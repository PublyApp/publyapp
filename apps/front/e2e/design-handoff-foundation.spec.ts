import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const BASE_STAFF_PATH = '/staff/staff-users';
const TENANT_PATH = '/staff/tenants';
const TABLE_TEST_ID = 'staff-users-table';
const STAFF_INVITATIONS_PATH = '/staff/invitations';
const STAFF_USERS_API_PATH = '/staff/users';
// Kiota parses entity ids with getGuidValue(); mocked ids must be real UUIDs
// or rows are silently dropped.
const HANDOFF_TENANT_ID = '0197b8f0-2222-7bbb-8bbb-bbbbbbbbbbbb';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

test.describe('design handoff foundation', { tag: ['@design', '@806'] }, () => {
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

		// #2292: the primary fill is the prototype's #FECD00 in both themes.
		await expect(page.getByRole('link', { name: /invite member/i })).toHaveCSS(
			'background-color',
			'rgb(254, 205, 0)',
		);
		const tableCard = page.getByTestId(`${TABLE_TEST_ID}-card`);
		await expect(tableCard).toHaveCSS('border-radius', '14px');
		await expect(page.getByTestId(`${TABLE_TEST_ID}-rows`)).toBeVisible();
		await expect(tableCard.locator('thead th').first()).toHaveCSS(
			'height',
			'40px',
		);
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

		const tableContainer = page.getByTestId(`${TABLE_TEST_ID}-rows`);
		await expect(tableContainer).toHaveCSS('overflow-y', 'auto');
		const scrollContract = await tableCard.evaluate((card) => {
			const container = card.querySelector<HTMLElement>(
				'[data-testid$="-rows"]',
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
		// A child element's rect height is trivially <= its parent's by box-model
		// alone — that alone doesn't prove the container owns a BOUNDED scroll
		// area distinct from the toolbar/footer chrome. Require both a real
		// positive height and a substantial gap (not rounding/border noise) from
		// the card's full height (review-r1-tests.md F25).
		expect(scrollContract.containerHeight).toBeGreaterThan(0);
		expect(scrollContract.containerHeight).toBeLessThan(
			scrollContract.cardHeight - 20,
		);

		const searchInput = page.getByTestId(`${TABLE_TEST_ID}-search`);
		await expect(searchInput).toHaveCSS('height', '40px');
		const searchWrapperWidth = await searchInput.evaluate(
			(el) => el.parentElement?.getBoundingClientRect().width,
		);
		// Upper bound alone passes at width 0 (a collapsed/hidden wrapper) — pair
		// with a real minimum (review-r1-tests.md F25).
		expect(searchWrapperWidth).toBeGreaterThan(200);
		// #2292: the list search wrapper matches the prototype's 448px field.
		expect(searchWrapperWidth).toBeLessThanOrEqual(448);

		// The generic table folds selection into the first column (the old
		// separate 40px selection cell is gone) and pins the actions column at
		// 40px. Guard both affordances instead of the removed cell.
		await expect(
			tableCard.getByRole('checkbox', { name: /Select all/ }),
		).toBeVisible();
		await expect(
			page
				.getByTestId(`${TABLE_TEST_ID}-rows`)
				.getByRole('checkbox', { name: /^Select / })
				.first(),
		).toBeVisible();
		await expect(tableCard.locator('thead th').last()).toHaveCSS(
			'width',
			'40px',
		);

		const firstAction = page
			.getByRole('button', { name: /Actions for/ })
			.first();
		await expect(firstAction).toHaveCSS('width', '28px');
		await expect(firstAction).toHaveCSS('height', '28px');
		await expect(firstAction).toHaveCSS('border-radius', '10px');
		await firstAction.click();

		const rowMenu = page.locator(
			'[data-slot="dropdown-menu-content"].publy-row-actions-menu',
		);
		await expect(rowMenu).toBeVisible();
		await expect(rowMenu).toHaveCSS('width', '196px');
		// #2292: every menu surface is the prototype's 10px popover radius.
		await expect(rowMenu).toHaveCSS('border-radius', '10px');
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

		await page.route('**/staff/invitations**', async (route) => {
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

		const filterButton = page.getByRole('button', { name: /^Filters/ });
		await expect(filterButton).toBeVisible();
		await expect(filterButton).toHaveCSS('height', '36px');
		// #2292: default-size (36px) button radius is 14px per the prototype's
		// radius scale (default/sm 14, icon 36px/14).
		await expect(filterButton).toHaveCSS('border-radius', '14px');
	});

	test('asserts confirm modal geometry uses handoff radius', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.setViewportSize({ width: 1280, height: 900 });

		await page.route('**/staff/tenants**', async (route) => {
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

		// Normalised to the `${tableTestId}-actions-${id}` convention (PKT-D
		// rename of tenants.tsx's row-action trigger testid, tracked alongside
		// review-r1-tests.md F27's addressing-consistency fix).
		await page
			.getByTestId(`staff-tenants-table-actions-${HANDOFF_TENANT_ID}`)
			.click();

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
		await expect(modalFooter).toHaveCSS(
			'border-top-color',
			'rgb(241, 241, 243)',
		);

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
		await expect(
			rail.getByRole('link', { name: 'Organizations' }),
		).toBeVisible();
		await expect(rail.getByRole('link', { name: 'Staff' })).toBeVisible();

		const panel = page.getByTestId('app-shell-secondary-panel');
		await expect(panel).toBeVisible();
		await expect(
			panel.getByRole('button', { name: /Staff members/ }),
		).toBeVisible();
		await expect(
			panel.getByRole('button', { name: /Invitations/ }),
		).toBeVisible();
		await expect(panel.getByRole('button', { name: /Profiles/ })).toBeVisible();
	});

	test('asserts the no-match state renders a bare, un-boxed icon with no card, ring, or shadow (flat, owner-approved 2026-07-10 round 2)', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.setViewportSize({ width: 1280, height: 900 });

		await page.route('**/staff/users**', async (route) => {
			if (
				route.request().method() !== 'GET' ||
				!isApiPath(route.request().url(), STAFF_USERS_API_PATH)
			) {
				await route.fallback();
				return;
			}

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

		// Owner decision 04/11 supersedes the flat 2026-07-10 shape: every empty
		// state is now the ShopKart OS pictogram — two faint rings around a −6°
		// tilted tile carrying the icon (the surface itself stays un-boxed).
		const cluster = noMatch.locator('.publy-state-icon-cluster');
		await expect(cluster).toHaveCSS('width', '120px');
		await expect(cluster).toHaveCSS('height', '120px');
		// A no-match list is the neutral empty kind (04/11 per-kind tone); the
		// old flat design tinted this glyph primary.
		await expect(cluster).toHaveAttribute('data-tone', 'neutral');
		await expect(cluster).toHaveAttribute('data-scale', 'inline');
		await expect(cluster).toHaveAttribute('data-presentation', 'empty');
		await expect(cluster).toHaveAttribute('aria-hidden', 'true');
		await expect(cluster.locator('.publy-empty-ring')).toHaveCount(2);
		await expect(cluster.locator('.publy-state-icon-wash')).toHaveCount(0);

		const icon = cluster.locator(
			'.publy-state-icon[data-tone="neutral"][data-presentation="empty"]',
		);
		await expect(icon).toHaveCSS('width', '56px');
		await expect(icon).toHaveCSS('height', '56px');
		await expect(icon).toHaveCSS('border-radius', '18px');

		const glyph = icon.locator('svg');
		await expect(glyph).toHaveCSS('width', '28px');
		await expect(glyph).toHaveCSS('height', '28px');
	});

	test('the 404 view no longer renders a separator above its actions (owner-approved 2026-07-10 round 3)', async ({
		page,
	}) => {
		await page.goto('/route-does-not-exist');

		const view404 = page.getByTestId('view-404');
		await expect(view404).toBeVisible();

		const cluster = view404.locator('.publy-state-icon-cluster');
		await expect(cluster).toHaveAttribute('data-scale', 'page');
		await expect(cluster).toHaveAttribute('data-presentation', 'status');
		await expect(cluster).toHaveCSS('width', '144px');
		await expect(cluster).toHaveCSS('height', '144px');
		const glyph = view404.locator(
			'.publy-state-icon[data-presentation="status"] svg',
		);
		await expect(glyph).toHaveCSS('width', '32px');
		await expect(glyph).toHaveCSS('height', '32px');

		const actionsWrap = view404
			.getByRole('link', { name: /home/i })
			.locator('..');
		await expect(actionsWrap).toHaveCSS('border-top-width', '0px');
	});

	for (const entry of ['goto', 'reload'] as const) {
		test(`the 500 boundary renders a working Retry and Go to home control after a ${entry} (owner-approved 2026-07-10 round 3; PR #997 finding 3 regression)`, async ({
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

			if (entry === 'goto') {
				await page.goto('/staff/staff-users');
			} else {
				await page.reload();
			}

			// The 500 is the per-kind « Unable to load » screen (owner decision
			// 04/11), with the pair's English copy.
			await expect(page.getByText('Unable to load')).toBeVisible();
			const retryButton = page.getByRole('button', { name: 'Retry' });
			const homeLink = page.getByRole('link', { name: 'Back to home' });
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
	}
});
