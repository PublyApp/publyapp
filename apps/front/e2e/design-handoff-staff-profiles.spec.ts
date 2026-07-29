import { type Page, expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const PROFILES_LIST_PATH = '/staff/profiles';
const PROFILE_DETAIL_PATH = (profileId: string) =>
	`/staff/profiles/${profileId}`;
const PROFILE_PERMISSIONS_PATH = (profileId: string) =>
	`/staff/profiles/${profileId}/permissions`;
const PERMISSION_CATALOG_PATH = '/staff/permissions/scopes/staff';
const PROFILE_USERS_PATH = (profileId: string) =>
	`/staff/profiles/${profileId}/users`;

const HANDOFF_PROFILE_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const setupProfilesMocks = async (page: Page) => {
	await page.route('**/staff/profiles**', async (route) => {
		const url = route.request().url();
		if (route.request().method() !== 'GET') {
			await route.fallback();
			return;
		}

		const parsed = new URL(url);
		if (parsed.origin !== API_BASE_URL) {
			await route.fallback();
			return;
		}

		if (parsed.pathname === PROFILES_LIST_PATH) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					data: [
						{
							id: HANDOFF_PROFILE_ID,
							name: 'Publishing',
							description: 'Articles, releases, and the editorial calendar',
							userAccountCount: 18,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (parsed.pathname === PROFILE_DETAIL_PATH(HANDOFF_PROFILE_ID)) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					profile: {
						id: HANDOFF_PROFILE_ID,
						name: 'Publishing',
						description: 'Articles, releases, and the editorial calendar',
						userAccountCount: 18,
					},
				}),
			});
			return;
		}

		if (parsed.pathname === PROFILE_PERMISSIONS_PATH(HANDOFF_PROFILE_ID)) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					permissionKeys: ['posts.write', 'posts.read'],
				}),
			});
			return;
		}

		if (parsed.pathname === PROFILE_USERS_PATH(HANDOFF_PROFILE_ID)) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					users: [
						{
							id: '0197b8f0-4444-7ddd-8ddd-dddddddddddd',
							email: 'maya@example.com',
							firstName: 'Maya',
							lastName: 'Chen',
							avatarUrl: null,
							status: 'Active',
						},
					],
					count: 1,
				}),
			});
			return;
		}

		await route.fallback();
	});

	await page.route('**/staff/permissions**', async (route) => {
		const url = route.request().url();
		if (route.request().method() !== 'GET') {
			await route.fallback();
			return;
		}

		const parsed = new URL(url);
		if (parsed.origin !== API_BASE_URL) {
			await route.fallback();
			return;
		}

		if (parsed.pathname === PERMISSION_CATALOG_PATH) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					posts: {
						read: {
							key: 'posts.read',
							name: 'Read posts',
							description: 'View published posts',
						},
						write: {
							key: 'posts.write',
							name: 'Write posts',
							description: 'Create and edit posts',
						},
					},
				}),
			});
			return;
		}

		await route.fallback();
	});
};

test('asserts profiles list table grid and row height per handoff 2g', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await setupProfilesMocks(page);

	await page.goto('/staff/profiles');
	await expect(page.getByTestId('staff-profiles-table-card')).toBeVisible({
		timeout: 10_000,
	});

	const tableCard = page.getByTestId('staff-profiles-table-card');
	await expect(tableCard).toHaveCSS('border-radius', '14px');

	const tableRows = page.getByTestId('staff-profiles-table-rows');
	const firstRow = tableRows.locator('[data-slot="table-row"]').first();
	await expect(firstRow).toHaveCSS('height', '56px');

	const firstCell = firstRow.locator('[data-slot="table-cell"]').nth(1);
	await expect(firstCell).toHaveCSS('height', '56px');

	const iconTile = firstRow.locator('.publy-profile-icon-tile');
	await expect(iconTile).toHaveCSS('width', '32px');
	await expect(iconTile).toHaveCSS('height', '32px');
	await expect(iconTile).toHaveCSS('border-radius', '9px');

	const iconTileSvg = iconTile.locator('svg');
	await expect(iconTileSvg).toBeVisible();

	const pageTitle = page.locator('.publy-type-page-title');
	await expect(pageTitle).toHaveText('Profiles');

	const searchInput = page.getByTestId('staff-profiles-table-search');
	await expect(searchInput).toHaveCSS('height', '40px');
});

test('applies the P3 column grid, truncates long text without horizontal scroll, and keeps the last row bordered', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1440, height: 900 });

	const longDescription =
		'This description is deliberately long enough to exceed the description column width and would force horizontal scroll if column geometry were not enforced by a fixed table layout and a colgroup.';

	await page.route('**/staff/profiles**', async (route) => {
		if (route.request().method() !== 'GET') {
			await route.fallback();
			return;
		}

		const parsed = new URL(route.request().url());
		if (
			parsed.origin !== API_BASE_URL ||
			parsed.pathname !== PROFILES_LIST_PATH
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				data: [
					{
						id: HANDOFF_PROFILE_ID,
						name: 'Publishing',
						description: longDescription,
						userAccountCount: 18,
					},
				],
				nextCursor: null,
			}),
		});
	});

	await page.goto('/staff/profiles');
	const tableRows = page.getByTestId('staff-profiles-table-rows');
	await expect(tableRows).toBeVisible({ timeout: 10_000 });

	// SPEC 2g grid, restricted to the columns the API can actually populate:
	// 40 / 240 / 1fr / 104 / 40 — every implemented column but Description (the
	// fluid slot) carries a fixed pixel width.
	//
	// The design canvas also specifies a 140px `Permissions` and a 120px `Updated`
	// column. Both are gone from the product (review-r3-users-auth.md F1, W3-E
	// `a709628f`): `GET /staff/profiles` returns neither field, so shipping them
	// meant rendering fabricated placeholder content — which the owner ruling
	// bans. Their pixel widths are therefore NOT asserted here; restoring the
	// columns is an owner decision (extend the API contract, or drop them from the
	// canvas), not something a spec should quietly re-pin.
	await expect(page.getByRole('columnheader', { name: 'Profile' })).toHaveCSS(
		'width',
		'240px',
	);
	await expect(page.getByRole('columnheader', { name: 'Members' })).toHaveCSS(
		'width',
		'104px',
	);
	await expect(
		page.getByRole('columnheader', { name: 'Permissions' }),
	).toHaveCount(0);
	await expect(page.getByRole('columnheader', { name: 'Updated' })).toHaveCount(
		0,
	);

	// The table must not force horizontal scroll: description truncates to
	// one line inside its fluid column instead of widening the table.
	const tableScrollWidth = await tableRows.evaluate((el) => el.scrollWidth);
	const cardClientWidth = await page
		.getByTestId('staff-profiles-table-card')
		.evaluate((el) => el.clientWidth);
	// Upper bound alone passes for a collapsed (0-width) table too — pair
	// with a real minimum (review-r1-tests.md F25).
	expect(tableScrollWidth).toBeGreaterThan(0);
	expect(tableScrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);

	const descriptionText = tableRows
		.locator('[data-slot="table-row"]')
		.first()
		.locator('[data-slot="table-cell"]')
		.nth(1)
		.locator('span');
	await expect(descriptionText).toHaveCSS('text-overflow', 'ellipsis');
	await expect(descriptionText).toHaveAttribute('title', longDescription);

	// Owner decision 15b: the last row keeps its bottom border, opposite to
	// the gray-ui template default.
	const lastRowCell = tableRows
		.locator('[data-slot="table-row"]')
		.last()
		.locator('[data-slot="table-cell"]')
		.first();
	await expect(lastRowCell).toHaveCSS('border-bottom-width', '1px');
	await expect(lastRowCell).toHaveCSS(
		'border-bottom-color',
		'rgb(241, 241, 243)',
	);
});

test('asserts profile detail identity block and permission matrix per handoff 2h', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await setupProfilesMocks(page);

	await page.goto(`/staff/profiles/${HANDOFF_PROFILE_ID}`);
	await expect(page.getByTestId('staff-profile-details-page')).toBeVisible({
		timeout: 10_000,
	});

	const detailTitle = page.locator('.publy-type-detail-title');
	await expect(detailTitle).toHaveText('Publishing');
	await expect(detailTitle).toHaveCSS('font-size', '22px');
	await expect(detailTitle).toHaveCSS('font-weight', '600');

	const detailTile = page.locator('.publy-profile-detail-tile');
	await expect(detailTile).toHaveCSS('width', '56px');
	await expect(detailTile).toHaveCSS('height', '56px');
	await expect(detailTile).toHaveCSS('border-radius', '14px');

	const permMatrix = page.locator('.publy-perm-matrix');
	expect(
		await permMatrix.evaluate((element) => {
			const tracks = getComputedStyle(element)
				.gridTemplateColumns.trim()
				.split(/\s+/);
			const [firstTrack, secondTrack] = tracks;
			const pixelTrackPattern = /^\d+(?:\.\d+)?px$/;

			if (firstTrack === undefined || secondTrack === undefined) {
				return false;
			}

			return (
				tracks.length === 2 &&
				pixelTrackPattern.test(firstTrack) &&
				pixelTrackPattern.test(secondTrack) &&
				Math.abs(
					Number.parseFloat(firstTrack) - Number.parseFloat(secondTrack),
				) <= 0.5
			);
		}),
	).toBe(true);

	const permKey = permMatrix.locator('.publy-perm-key').first();
	await expect(permKey).toBeVisible();
	await expect(permKey).toHaveCSS('font-family', /Geist Mono/);
});
