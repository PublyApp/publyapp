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
			const status = new URL(url).searchParams.get('status');
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

			let rows = [activeRow, suspendedRow];
			if (status === 'active') {
				rows = [activeRow];
			} else if (status === 'suspended') {
				rows = [suspendedRow];
			}

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

test.describe('staff tenants status panel filters', () => {
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
});

test.describe('staff tenants toolbar status filter', () => {
	test('filtering by status narrows the table, updates the URL with bare snake_case values, and clearing restores all rows', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenantsByStatus(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
		await expect(page.getByText('Acme Corporation')).toBeVisible();
		await expect(page.getByText('Globex Suspended Co')).toBeVisible();

		const trigger = page.getByTestId(
			'staff-tenants-table-status-filter-trigger',
		);
		await expect(trigger).toHaveText(/All statuses/);

		const activeRequest = page.waitForRequest(
			(request) =>
				request.method() === 'GET' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH) &&
				new URL(request.url()).searchParams.get('status') === 'active',
		);
		await trigger.click();
		await page.getByTestId('staff-tenants-table-status-filter-active').click();
		await activeRequest;

		await expect(page).toHaveURL(/[?&]status=active(?:&|$)/);
		await expect(trigger).toHaveText(/Active/);
		await expect(page.getByText('Globex Suspended Co')).toHaveCount(0);
		await expect(page.getByText('Acme Corporation')).toBeVisible();

		// The "All statuses" query key was already fetched on initial load and
		// is still fresh, so TanStack Query serves it from cache — assert the
		// URL/UI settle back rather than waiting for a network round-trip.
		await trigger.click();
		await page.getByTestId('staff-tenants-table-status-filter-all').click();

		await expect(page).not.toHaveURL(/[?&]status=/);
		await expect(trigger).toHaveText(/All statuses/);
		await expect(page.getByText('Acme Corporation')).toBeVisible();
		await expect(page.getByText('Globex Suspended Co')).toBeVisible();
	});
});

test.describe('staff tenants list', () => {
	test('renders a selection checkbox and hashed avatar per row, matching the staff-users archetype', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenants(page);

		await page.goto('/staff/tenants');
		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		await expect(
			page.getByRole('checkbox', { name: `Select row ${ACTIVE_TENANT_ID}` }),
		).toBeVisible();

		const activeTenantRow = page.getByRole('row', {
			name: /Acme Corporation/,
		});
		await expect(
			activeTenantRow.locator('.publy-avatar-initials'),
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
			.getByRole('checkbox', { name: `Select row ${ACTIVE_TENANT_ID}` })
			.click();
		await expect(page.getByText('1 selected')).toBeVisible();
		await expectFloatingSelectionBarAtViewportBottom(page);

		const bar = page.getByTestId('floating-selection-bar');
		await bar.getByRole('button', { name: 'More actions' }).click();
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
			page.getByRole('checkbox', { name: `Select row ${ACTIVE_TENANT_ID}` }),
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
			.getByRole('checkbox', { name: `Select row ${ACTIVE_TENANT_ID}` })
			.click();
		const bar = page.getByTestId('floating-selection-bar');
		await expectFloatingSelectionBarAtViewportBottom(page);

		await bar.getByRole('button', { name: 'Clear selection' }).click();
		await expect(bar).toBeHidden();
		await expect(
			page.getByRole('checkbox', { name: `Select row ${ACTIVE_TENANT_ID}` }),
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
				name: `Select row ${SUSPENDED_TENANT_ID}`,
			})
			.click();
		const bar = page.getByTestId('floating-selection-bar');
		await expectFloatingSelectionBarAtViewportBottom(page);
		await bar.getByRole('button', { name: 'More actions' }).click();
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
