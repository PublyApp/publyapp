import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';
import { expectTableFitsCard } from './helpers/table-fits-card';

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
			await expect(page.getByText('Acme Corporation')).toBeVisible();
			await expect(page.getByText('Globex Suspended Co')).toBeVisible();

			const panel = page.getByTestId('app-shell-secondary-panel');
			const activeRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					isApiPath(request.url(), STAFF_TENANTS_PATH) &&
					new URL(request.url()).searchParams.get('status') === 'active',
			);

			await panel.getByRole('link', { name: 'Active' }).click();
			await activeRequest;

			await expect(page).toHaveURL(/[?&]status=active(?:&|$)/);
			await expect(page.getByText('Globex Suspended Co')).toHaveCount(0);
			await expect(page.getByText('Acme Corporation')).toBeVisible();
			await expect(panel.getByRole('link', { name: 'Active' })).toHaveAttribute(
				'data-active',
				'true',
			);
			await expect(
				panel.getByRole('link', { name: 'All tenants' }),
			).not.toHaveAttribute('data-active', 'true');

			const suspendedRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					isApiPath(request.url(), STAFF_TENANTS_PATH) &&
					new URL(request.url()).searchParams.get('status') === 'suspended',
			);

			await panel.getByRole('link', { name: 'Suspended' }).click();
			await suspendedRequest;

			await expect(page).toHaveURL(/[?&]status=suspended(?:&|$)/);
			await expect(page.getByText('Acme Corporation')).toHaveCount(0);
			await expect(page.getByText('Globex Suspended Co')).toBeVisible();
			await expect(
				panel.getByRole('link', { name: 'Suspended' }),
			).toHaveAttribute('data-active', 'true');
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

			const trigger = page.getByTestId(
				'staff-tenants-table-status-filter-trigger',
			);
			await trigger.click();
			const active = page.getByTestId(
				'staff-tenants-table-status-filter-active',
			);
			const suspended = page.getByTestId(
				'staff-tenants-table-status-filter-suspended',
			);
			for (const item of [active, suspended]) {
				await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
				await expect(
					item.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
				).toBeVisible();
			}

			await active.click();
			await expect(active).toHaveAttribute('aria-checked', 'true');
			await expect(suspended).toBeVisible();
			await suspended.click();
			await expect(suspended).toHaveAttribute('aria-checked', 'true');
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('active,suspended');
			await expect(page.getByText('Acme Corporation')).toBeVisible();
			await expect(page.getByText('Globex Suspended Co')).toBeVisible();

			await active.click();
			await expect(active).toHaveAttribute('aria-checked', 'false');
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('suspended');
			await expect(page.getByText('Acme Corporation')).toHaveCount(0);
			await expect(page.getByText('Globex Suspended Co')).toBeVisible();

			const all = page.getByTestId('staff-tenants-table-status-filter-all');
			await expect(
				all.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
			).toHaveCount(0);
			await all.click();
			await expect(page.getByRole('menu')).toBeHidden();
			await expect
				.poll(() => new URL(page.url()).searchParams.has('status'))
				.toBe(false);
			await expect(page.getByText('Acme Corporation')).toBeVisible();
			await expect(page.getByText('Globex Suspended Co')).toBeVisible();
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

	test('column widths follow the adapted 3a grid and the table never overflows its card', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		// Adapted grid: SPEC 3a's Plan/Owner/Created columns aren't implemented
		// yet, so Name (the only unbounded text field) is the fluid column.
		await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCSS(
			'width',
			'124px',
		);
		await expect(
			page.getByRole('columnheader', { name: 'Users', exact: true }),
		).toHaveCSS('width', '92px');
		await expect(
			page.getByRole('columnheader', { name: 'Max users' }),
		).toHaveCSS('width', '132px');

		const tableScrollWidth = await page
			.getByTestId(`${TABLE}-rows`)
			.evaluate((el) => el.scrollWidth);
		const cardClientWidth = await page
			.getByTestId(`${TABLE}-card`)
			.evaluate((el) => el.clientWidth);
		// Upper bound alone passes for a collapsed (0-width) table too — pair
		// with a real minimum (review-r1-tests.md F25).
		expect(tableScrollWidth).toBeGreaterThan(0);
		expect(tableScrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);
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
			page.getByText('Successfully suspended 1 tenant(s).'),
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
			page.getByText('Select at least one active tenant to suspend.'),
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

			test('table never overflows its card', async ({ page }) => {
				await loginAsStaffAdmin(page);
				await mockStaffTenants(page);

				await page.goto('/staff/tenants');
				await expectTableFitsCard(page, TABLE);
			});
		},
	);
}
