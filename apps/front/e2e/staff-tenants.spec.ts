import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const STAFF_TENANTS_PATH = '/staff/tenants';
const BULK_SUSPEND_PATH = '/staff/tenants/bulk-suspend';
const TABLE = 'staff-tenants-table';

// Kiota's getGuidValue() silently drops rows with non-UUID ids, which makes
// a table look empty while the test still passes — mocks must use real UUIDs.
const ACTIVE_TENANT_ID = '0197b8f0-1111-7aaa-8aaa-aaaaaaaaaaaa';
const SUSPENDED_TENANT_ID = '0197b8f0-2222-7bbb-8bbb-bbbbbbbbbbbb';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** The visible table row for an organisation (the mobile card repeats the
 * name in the same DOM, so scope to the table role). */
const tenantRow = (page: Page, name: string) => page.getByRole('row', { name });

/** Floating bar is portalled to `document.body` and pinned near the viewport
 * bottom — assert it isn't trapped inside `.app-shell-main`'s scroll area. */
const expectFloatingSelectionBarAtViewportBottom = async (page: Page) => {
	const bar = page.getByTestId('floating-selection-bar');
	await expect(bar).toBeVisible();
	// toBeVisible() alone doesn't imply in-viewport (a bar trapped inside a
	// scrolled `.app-shell-main` container can still be "visible" while
	// off-screen); ratio: 1 requires the whole element be within the
	// viewport (review-r1-tests.md F25).
	await expect(bar).toBeInViewport({ ratio: 1 });

	const viewportHeight = page.viewportSize()?.height ?? 0;
	const box = await bar.boundingBox();
	expect(box).not.toBeNull();
	if (box) {
		expect(box.y + box.height).toBeGreaterThan(viewportHeight - 80);
		// Opposing bound: catches the bar being pushed entirely below/past the
		// viewport, which the lower bound alone would not.
		expect(box.y).toBeLessThan(viewportHeight);
	}
};

const mockStaffTenants = async (page: Page) => {
	await page.route('**/staff/tenants**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() === 'GET' && isApiPath(url, STAFF_TENANTS_PATH)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: ACTIVE_TENANT_ID,
							name: 'Acme Corporation',
							status: 'Active',
							usersCount: 12,
							maxUsers: 50,
						},
						{
							id: SUSPENDED_TENANT_ID,
							name: 'Globex Suspended Co',
							status: 'Suspended',
							usersCount: 3,
							maxUsers: 10,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (request.method() === 'POST' && isApiPath(url, BULK_SUSPEND_PATH)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					succeededCount: 1,
					failedCount: 0,
					failedItems: [],
				}),
			});
			return;
		}

		await route.fallback();
	});
};

const mockStaffTenantsByStatus = async (page: Page) => {
	await page.route('**/staff/tenants**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() === 'GET' && isApiPath(url, STAFF_TENANTS_PATH)) {
			const selectedStatuses = new Set(
				new URL(url).searchParams
					.get('status')
					?.split(',')
					.map((status) => status.trim().toLowerCase()) ?? [],
			);
			const activeRow = {
				id: ACTIVE_TENANT_ID,
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			};
			const suspendedRow = {
				id: SUSPENDED_TENANT_ID,
				name: 'Globex Suspended Co',
				status: 'Suspended',
				usersCount: 3,
				maxUsers: 10,
			};

			const allRows = [activeRow, suspendedRow];
			const rows =
				selectedStatuses.size === 0
					? allRows
					: allRows.filter((row) =>
							selectedStatuses.has(row.status.toLowerCase()),
						);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: rows, nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe(
	'staff tenants status panel filters',
	{ tag: ['@staff-tenants', '@806'] },
	() => {
		test('clicking Active/Suspended in the panel filters the table, updates the URL, and highlights the matching item', async ({
			page,
		}) => {
			await page.setViewportSize({ width: 1280, height: 900 });
			await loginAsStaffAdmin(page);
			await mockStaffTenantsByStatus(page);

			await page.goto('/staff/tenants');
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
			await expect(tenantRow(page, 'Acme Corporation')).toBeVisible();
			await expect(tenantRow(page, 'Globex Suspended Co')).toBeVisible();

			const panel = page.getByTestId('app-shell-secondary-panel');
			const activeRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					isApiPath(request.url(), STAFF_TENANTS_PATH) &&
					new URL(request.url()).searchParams.get('status') === 'active',
			);

			await panel.getByRole('button', { name: 'Active' }).click();
			await activeRequest;

			await expect(page).toHaveURL(/[?&]status=active(?:&|$)/);
			await expect(tenantRow(page, 'Globex Suspended Co')).toHaveCount(0);
			await expect(tenantRow(page, 'Acme Corporation')).toBeVisible();
			await expect(
				panel.getByRole('button', { name: 'Active' }),
			).toHaveAttribute('data-active', 'true');
			// The panel shortcut is exclusive: another status is never also on.
			await expect(
				panel.getByRole('button', { name: 'Suspended' }),
			).not.toHaveAttribute('data-active', 'true');

			const suspendedRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					isApiPath(request.url(), STAFF_TENANTS_PATH) &&
					new URL(request.url()).searchParams.get('status') === 'suspended',
			);

			await panel.getByRole('button', { name: 'Suspended' }).click();
			await suspendedRequest;

			await expect(page).toHaveURL(/[?&]status=suspended(?:&|$)/);
			await expect(tenantRow(page, 'Acme Corporation')).toHaveCount(0);
			await expect(tenantRow(page, 'Globex Suspended Co')).toBeVisible();
			// The exclusive shortcut replaces the previous status: the Active
			// entry is no longer active and the chip names Suspended only.
			await expect(
				panel.getByRole('button', { name: 'Suspended' }),
			).toHaveAttribute('data-active', 'true');
			await expect(
				panel.getByRole('button', { name: 'Active' }),
			).not.toHaveAttribute('data-active', 'true');
			await expect(
				page.getByRole('button', { name: 'Remove Statuses: Suspended' }),
			).toBeVisible();
		});
	},
);

test.describe(
	'staff tenants toolbar status filter',
	{ tag: ['@staff-tenants', '@806'] },
	() => {
		test('combines, narrows, and resets status values in one persistent checkbox menu', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await mockStaffTenantsByStatus(page);
			await page.goto('/staff/tenants');
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

			const trigger = page.getByRole('button', { name: /^Filters/ });
			await trigger.click();
			const active = page.getByRole('checkbox', {
				name: 'Active',
				exact: true,
			});
			const suspended = page.getByRole('checkbox', {
				name: 'Suspended',
				exact: true,
			});
			await expect(active).toBeVisible();
			await expect(suspended).toBeVisible();

			await active.click();
			await expect(active).toBeChecked();
			await suspended.click();
			await expect(suspended).toBeChecked();
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('active,suspended');
			await expect(tenantRow(page, 'Acme Corporation')).toBeVisible();
			await expect(tenantRow(page, 'Globex Suspended Co')).toBeVisible();

			await active.click();
			await expect(active).not.toBeChecked();
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('suspended');
			await expect(tenantRow(page, 'Acme Corporation')).toHaveCount(0);
			await expect(tenantRow(page, 'Globex Suspended Co')).toBeVisible();

			// The new filter menu has no exclusive "All" row: the Statuses
			// section's Clear all is the reset.
			await page.getByRole('button', { name: 'Clear all' }).click();
			await expect
				.poll(() => new URL(page.url()).searchParams.has('status'))
				.toBe(false);
			await expect(tenantRow(page, 'Acme Corporation')).toBeVisible();
			await expect(tenantRow(page, 'Globex Suspended Co')).toBeVisible();

			await page.keyboard.press('Escape');
			await expect(
				page.getByRole('checkbox', { name: 'Active', exact: true }),
			).toBeHidden();
		});
	},
);

test.describe('staff tenants list', { tag: ['@staff-tenants', '@806'] }, () => {
	test('renders a selection checkbox and hashed logo fallback per row, matching the staff-users archetype', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		await expect(
			page.getByRole('checkbox', { name: 'Select Acme Corporation' }),
		).toBeVisible();

		const activeTenantRow = page.getByRole('row', {
			name: /Acme Corporation/,
		});
		await expect(
			activeTenantRow.locator(
				'[data-slot="person-avatar-fallback"].publy-avatar-initials[data-palette="7"]',
			),
		).toBeVisible();
	});

	test('column widths follow the new default grid and the wide table scrolls inside its card', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		// The new 14-column default grid; the old "Users"/"Max users" pair is
		// now Members plus the Seats-used ratio.
		await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCSS(
			'width',
			'130px',
		);
		await expect(
			page.getByRole('columnheader', { name: 'Members', exact: true }),
		).toHaveCSS('width', '130px');
		await expect(
			page.getByRole('columnheader', { name: 'Seats used' }),
		).toHaveCSS('width', '190px');

		const scroller = page.getByTestId(`${TABLE}-rows`);
		const card = page.getByTestId(`${TABLE}-card`);
		const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
		}));
		// The 14 default columns are wider than the card at 1280px: the
		// horizontal scroll belongs to the rows scroller inside the card, not
		// to the page (the old grid fit by dropping columns).
		expect(scrollWidth).toBeGreaterThan(clientWidth);
		const cardBox = await card.boundingBox();
		const viewport = page.viewportSize();
		expect(cardBox).not.toBeNull();
		if (cardBox && viewport) {
			expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewport.width);
		}
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(
			(await page.evaluate(() => document.documentElement.clientWidth)) + 1,
		);
	});

	test('bulk-suspends the eligible selected tenant and clears the selection on success', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		const bulkSuspendRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), BULK_SUSPEND_PATH),
		);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		await page
			.getByRole('checkbox', { name: 'Select Acme Corporation' })
			.click();
		await expect(page.getByText('1 selected')).toBeVisible();
		await expectFloatingSelectionBarAtViewportBottom(page);

		const bar = page.getByTestId('floating-selection-bar');
		await bar.getByRole('button', { name: 'Bulk actions' }).click();
		await page.getByRole('menuitem', { name: 'Suspend selected' }).click();

		await expect(
			page.getByRole('heading', { name: 'Suspend selected' }),
		).toBeVisible();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Suspend' })
			.click();

		const request = await bulkSuspendRequest;
		expect(request.postDataJSON()).toMatchObject({
			tenantIds: [ACTIVE_TENANT_ID],
		});

		await expect(
			page.getByText('Successfully suspended 1 organization(s).'),
		).toBeVisible();
		await expect(
			page.getByRole('checkbox', { name: 'Select Acme Corporation' }),
		).toHaveAttribute('aria-checked', 'false');
		// Success clears the selection — the bar plays its exit animation and unmounts.
		await expect(bar).toBeHidden();
	});

	test('the floating selection bar disappears when the selection is cleared', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		await page
			.getByRole('checkbox', { name: 'Select Acme Corporation' })
			.click();
		const bar = page.getByTestId('floating-selection-bar');
		await expectFloatingSelectionBarAtViewportBottom(page);

		await bar.getByRole('button', { name: 'Clear selection' }).click();
		await expect(bar).toBeHidden();
		await expect(
			page.getByRole('checkbox', { name: 'Select Acme Corporation' }),
		).toHaveAttribute('aria-checked', 'false');
	});

	test('an ineligible bulk suspend click on a suspended-only selection shows inline feedback, not the confirm dialog', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		await page
			.getByRole('checkbox', {
				name: 'Select Globex Suspended Co',
			})
			.click();
		const bar = page.getByTestId('floating-selection-bar');
		await expectFloatingSelectionBarAtViewportBottom(page);
		await bar.getByRole('button', { name: 'Bulk actions' }).click();
		await page.getByRole('menuitem', { name: 'Suspend selected' }).click();

		await expect(
			page.getByText('Select at least one active organization to suspend.'),
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Suspend selected' }),
		).toBeHidden();
		// Ineligible click surfaces inline feedback but does not clear the selection.
		await expect(bar).toBeVisible();
	});
});

for (const width of [768, 390]) {
	test.describe(
		`staff tenants table responsive at ${width}px`,
		{ tag: ['@staff-tenants', '@806'] },
		() => {
			test.use({ viewport: { width, height: 800 } });

			test('the list adapts at its breakpoint without overflowing the page', async ({
				page,
			}) => {
				await loginAsStaffAdmin(page);
				await mockStaffTenants(page);

				await page.goto('/staff/tenants');

				if (width < 768) {
					// Below md the generic list renders meta cards instead of the
					// table; the wide table is not a horizontal page overflow.
					await expect(page.getByTestId(`${TABLE}-rows`)).toBeHidden();
					await expect(
						page.getByRole('link', { name: 'Open Acme Corporation' }),
					).toBeVisible();
				} else {
					// At md the table shows and owns its own horizontal scroll.
					const scroller = page.getByTestId(`${TABLE}-rows`);
					await expect(scroller).toBeVisible();
					const { scrollWidth, clientWidth } = await scroller.evaluate(
						(el) => ({
							scrollWidth: el.scrollWidth,
							clientWidth: el.clientWidth,
						}),
					);
					expect(scrollWidth).toBeGreaterThan(0);
					expect(scrollWidth).toBeGreaterThan(clientWidth);
				}

				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
				).toBeLessThanOrEqual(
					(await page.evaluate(() => document.documentElement.clientWidth)) + 1,
				);
			});
		},
	);
}
