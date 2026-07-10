import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
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

const mockStaffTenants = async (page: Page) => {
	await page.route('**/staff/tenants*', async (route) => {
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
		await expect(page.getByRole('columnheader', { name: 'Users' })).toHaveCSS(
			'width',
			'92px',
		);
		await expect(
			page.getByRole('columnheader', { name: 'Max users' }),
		).toHaveCSS('width', '132px');

		const tableScrollWidth = await page
			.getByTestId(`${TABLE}-rows`)
			.evaluate((el) => el.scrollWidth);
		const cardClientWidth = await page
			.getByTestId(`${TABLE}-card`)
			.evaluate((el) => el.clientWidth);
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

		await page.getByRole('button', { name: 'More actions' }).click();
		await page.getByRole('menuitem', { name: 'Suspend selected' }).click();

		await expect(
			page.getByRole('heading', { name: 'Suspend selected' }),
		).toBeVisible();
		await page
			.getByRole('dialog')
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
		await page.getByRole('button', { name: 'More actions' }).click();
		await page.getByRole('menuitem', { name: 'Suspend selected' }).click();

		await expect(
			page.getByText('Select at least one active tenant to suspend.'),
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Suspend selected' }),
		).toBeHidden();
	});
});
