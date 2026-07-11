import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const BASE_STAFF_PATH = '/staff/staff-users';
const TENANT_PATH = '/staff/tenants';
const TABLE_TEST_ID = 'staff-users-table';
const STAFF_INVITATIONS_PATH = '/staff/invitations';
// Kiota parses entity ids with getGuidValue(); mocked ids must be real UUIDs
// or rows are silently dropped.
const HANDOFF_TENANT_ID = '0197b8f0-2222-7bbb-8bbb-bbbbbbbbbbbb';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

test('asserts shell foundation dimensions and table heights', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(BASE_STAFF_PATH);

	const rail = page.getByTestId('app-shell-rail');
	const secondary = page.getByTestId('app-shell-secondary-panel');
	const topbar = page.getByTestId('app-shell-topbar');

	await expect(rail).toHaveCSS('width', '49px');
	await expect(secondary).toHaveCSS('width', '272px');
	await expect(topbar).toHaveCSS('height', '64px');
	await expect(topbar).toHaveCSS('border-bottom-width', '0px');

	await expect(page.getByRole('link', { name: /invite users/i })).toHaveCSS(
		'background-color',
		'rgb(253, 199, 0)',
	);
	const tableCard = page.getByTestId(`${TABLE_TEST_ID}-card`);
	await expect(tableCard).toHaveCSS('border-radius', '14px');
	await expect(page.getByTestId(`${TABLE_TEST_ID}-rows`)).toBeVisible();
	await expect(
		page
			.getByTestId(`${TABLE_TEST_ID}-rows`)
			.locator('[data-slot="table-sortable-column-header"]')
			.first(),
	).toHaveCSS('height', '40px');
	await expect(
		page
			.getByTestId(`${TABLE_TEST_ID}-rows`)
			.locator('[data-slot="table-cell"]')
			.first(),
	).toHaveCSS('height', '48px');
	await expect(page.getByTestId(`${TABLE_TEST_ID}-footer`)).toHaveCSS(
		'min-height',
		'48px',
	);
	await expect(page.getByTestId(`${TABLE_TEST_ID}-footer`)).toHaveCSS(
		'height',
		'48px',
	);

	const tableContainer = tableCard.locator('[data-slot="table-container"]');
	await expect(tableContainer).toHaveCSS('overflow-y', 'auto');
	const scrollContract = await tableCard.evaluate((card) => {
		const container = card.querySelector<HTMLElement>(
			'[data-slot="table-container"]',
		);
		const cardRect = card.getBoundingClientRect();
		const containerRect = container?.getBoundingClientRect();

		return {
			cardBottom: Math.round(cardRect.bottom),
			cardHeight: Math.round(cardRect.height),
			containerHeight: Math.round(containerRect?.height ?? 0),
			viewportHeight: window.innerHeight,
		};
	});
	expect(scrollContract.cardBottom).toBeLessThanOrEqual(
		scrollContract.viewportHeight,
	);
	expect(scrollContract.containerHeight).toBeLessThan(
		scrollContract.cardHeight,
	);

	const searchInput = page.getByTestId(`${TABLE_TEST_ID}-search`);
	await expect(searchInput).toHaveCSS('height', '40px');
	const searchWrapperWidth = await searchInput.evaluate(
		(el) => el.parentElement?.getBoundingClientRect().width,
	);
	expect(searchWrapperWidth).toBeLessThanOrEqual(420);

	const selectionCell = page
		.getByTestId(`${TABLE_TEST_ID}-rows`)
		.locator('[data-slot="table-selection-cell"]')
		.first();
	await expect(selectionCell).toBeVisible();
	const selectionCellWidth = await selectionCell.evaluate((el) =>
		Math.round(el.getBoundingClientRect().width),
	);
	expect(selectionCellWidth).toBe(40);

	const firstAction = page.getByRole('button', { name: /Actions for/ }).first();
	await expect(firstAction).toHaveCSS('width', '28px');
	await expect(firstAction).toHaveCSS('height', '28px');
	await expect(firstAction).toHaveCSS('border-radius', '10px');
	await firstAction.click();

	const rowMenu = page.locator(
		'[data-slot="dropdown-menu-content"].publy-row-actions-menu',
	);
	await expect(rowMenu).toBeVisible();
	await expect(rowMenu).toHaveCSS('width', '196px');
	await expect(rowMenu).toHaveCSS('border-radius', '14px');
	await expect(rowMenu.getByRole('menuitem').first()).toHaveCSS(
		'height',
		'32px',
	);
	await expect(rowMenu.getByRole('menuitem').first()).toHaveCSS(
		'border-radius',
		'9px',
	);
});

test('asserts staff invitations filter button geometry', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });

	// design-system-ignore: no-single-star-route-glob — pre-existing collection-only mock; not yet audited for sub-path escapes (see BACKLOG: e2e glob audit)
	await page.route('**/staff/invitations*', async (route) => {
		if (
			route.request().method() !== 'GET' ||
			!isApiPath(route.request().url(), STAFF_INVITATIONS_PATH)
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
						id: '0197b8f0-1111-7aaa-8aaa-aaaaaaaaaaaa',
						email: 'member@example.com',
						profileName: 'Admin',
						status: 'Pending',
						expiresAt: '2026-07-09T12:00:00Z',
						acceptedAt: null,
						createdAt: '2026-07-09T08:00:00Z',
						invitedByName: 'Owner User',
					},
				],
				nextCursor: null,
			}),
		});
	});

	await page.goto(STAFF_INVITATIONS_PATH);

	const filterButton = page.locator('.publy-data-table-filter-button');
	await expect(filterButton).toBeVisible();
	await expect(filterButton).toHaveCSS('height', '36px');
	await expect(filterButton).toHaveCSS('border-radius', '14px');
});

test('asserts confirm modal geometry uses handoff radius', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });

	// design-system-ignore: no-single-star-route-glob — pre-existing collection-only mock; not yet audited for sub-path escapes (see BACKLOG: e2e glob audit)
	await page.route('**/staff/tenants*', async (route) => {
		if (
			route.request().method() !== 'GET' ||
			!isApiPath(route.request().url(), TENANT_PATH)
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
						id: HANDOFF_TENANT_ID,
						name: 'Handoff Tenant',
						status: 'Active',
						usersCount: 1,
						maxUsers: 10,
					},
				],
				nextCursor: null,
			}),
		});
	});

	await page.goto(TENANT_PATH);

	await page.getByTestId(`tenant-actions-${HANDOFF_TENANT_ID}`).click();

	const rowMenu = page.locator(
		'[data-slot="dropdown-menu-content"].publy-row-actions-menu',
	);
	await expect(rowMenu).toBeVisible();
	await expect(
		rowMenu.locator(
			'[data-slot="dropdown-menu-item"][data-variant="destructive"]',
		),
	).toHaveCSS('color', 'rgb(220, 38, 38)');

	await page.getByRole('menuitem', { name: 'Suspend' }).click();
	const confirmDialog = page.getByRole('alertdialog');
	await expect(confirmDialog).toBeVisible();
	await expect(confirmDialog).toHaveCSS('border-radius', '28px');
	await expect(confirmDialog).toHaveCSS('width', '480px');
	await expect(confirmDialog).toHaveCSS(
		'background-color',
		'rgba(255, 255, 255, 0.97)',
	);

	const modalTitle = confirmDialog.locator(
		'[data-slot="confirm-dialog-title"]',
	);
	await expect(modalTitle).toHaveCSS('font-size', '17px');
	await expect(modalTitle).toHaveCSS('font-weight', '600');

	const modalFooter = confirmDialog.locator(
		'[data-slot="confirm-dialog-footer"]',
	);
	await expect(modalFooter).toHaveCSS('border-top-width', '1px');
	await expect(modalFooter).toHaveCSS('border-top-color', 'rgb(241, 241, 243)');

	const confirmButton = modalFooter.getByRole('button', { name: 'Suspend' });
	await expect(confirmButton).toHaveCSS('color', 'rgb(220, 38, 38)');
	await expect(confirmButton).toHaveCSS(
		'background-color',
		'rgba(220, 38, 38, 0.1)',
	);
	await expect(confirmButton).toHaveCSS('font-weight', '600');
});

test('asserts staff shell rails and panel match handoff registry', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/staff/staff-users');

	const rail = page.getByTestId('app-shell-rail');
	await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Tenants' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Staff' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Audit logs' })).toBeVisible();

	const panel = page.getByTestId('app-shell-secondary-panel');
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('link', { name: 'All users' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Invitations' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Profiles' })).toBeVisible();
});

test('asserts the no-match state renders a bare, un-boxed icon with no card, ring, or shadow (flat, owner-approved 2026-07-10 round 2)', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });

	// design-system-ignore: no-single-star-route-glob — pre-existing collection-only mock; not yet audited for sub-path escapes (see BACKLOG: e2e glob audit)
	await page.route('**/staff/users*', async (route) => {
		await route.fulfill({
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				data: [],
				nextCursor: null,
			}),
		});
	});

	await page.goto('/staff/staff-users?q=nonexistent');

	const noMatch = page.getByTestId('staff-users-table-no-match');
	await expect(noMatch).toBeVisible();
	await expect(noMatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(noMatch).toHaveCSS('box-shadow', 'none');
	await expect(noMatch).toHaveCSS('border-radius', '0px');

	const cluster = noMatch.locator('.publy-state-icon-cluster');
	await expect(cluster).toHaveCSS('width', '48px');
	await expect(cluster).toHaveCSS('height', '48px');
	await expect(cluster).toHaveAttribute('data-tone', 'primary');
	await expect(cluster).toHaveAttribute('data-scale', 'inline');
	await expect(cluster).toHaveAttribute('aria-hidden', 'true');
	await expect(cluster.locator('.publy-state-icon-wash')).toHaveCount(0);
	await expect(cluster.locator('.publy-state-icon-ring')).toHaveCount(0);

	const icon = cluster.locator('.publy-state-icon[data-tone="primary"]');
	await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(icon).toHaveCSS('box-shadow', 'none');
	await expect(icon).toHaveCSS('border-radius', '0px');
	await expect(icon).toHaveCSS('color', 'rgb(253, 199, 0)');

	// Owner decision R3-4b (reaffirmed 2026-07-11): the inline empty/no-match
	// scale now matches the page error scale exactly — the glyph fills the
	// same 48px cluster on both, no backing shape, size + tone colour carry
	// the presence.
	const glyph = icon.locator('svg');
	await expect(glyph).toHaveCSS('width', '48px');
	await expect(glyph).toHaveCSS('height', '48px');
});

test('the 404 view no longer renders a separator above its actions (owner-approved 2026-07-10 round 3)', async ({
	page,
}) => {
	await page.goto('/route-does-not-exist');

	const view404 = page.getByTestId('view-404');
	await expect(view404).toBeVisible();

	const cluster = view404.locator('.publy-state-icon-cluster');
	await expect(cluster).toHaveAttribute('data-scale', 'page');
	const glyph = view404.locator('.publy-state-icon svg');
	await expect(glyph).toHaveCSS('width', '48px');
	await expect(glyph).toHaveCSS('height', '48px');

	const actionsWrap = view404
		.getByRole('link', { name: /home/i })
		.locator('..');
	await expect(actionsWrap).toHaveCSS('border-top-width', '0px');
});

test('the 500 boundary renders a working Retry and Go to home control (owner-approved 2026-07-10 round 3)', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	await page.route('**/auth/redirect-code**', async (route) => {
		await route.fulfill({
			status: 500,
			headers: { 'content-type': 'application/problem+json' },
			body: JSON.stringify({ title: 'Internal Server Error', status: 500 }),
		});
	});

	await page.reload();

	await expect(page.getByText('Something went wrong')).toBeVisible();
	const retryButton = page.getByRole('button', { name: 'Retry' });
	const homeLink = page.getByRole('link', { name: 'Go to home' });
	await expect(retryButton).toBeVisible();
	await expect(homeLink).toBeVisible();

	const actionsWrap = homeLink.locator('..');
	await expect(actionsWrap).toHaveCSS('border-top-width', '0px');

	await page.unroute('**/auth/redirect-code**');
	await retryButton.click();

	await expect(page.getByTestId('staff-users-table')).toBeVisible({
		timeout: 15_000,
	});
});
