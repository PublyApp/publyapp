import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockTenantDetails = async (page: Page) => {
	// A single '*' glob cannot cross a path separator (compiles to [^/]*), so
	// '**' is required to match both the tenant collection and its sub-paths.
	await page.route(`**/staff/tenants/**`, async (route) => {
		const request = route.request();
		const url = request.url();

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: TENANT_ID,
					name: 'Acme Corporation',
					code: 'ACME',
					status: 'Active',
					usersCount: 12,
					maxUsers: 50,
					logoUrl: null,
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/users`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe('staff tenant details tabs', () => {
	test('switching tabs is a client-side navigation, not a document reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		await page.evaluate(() => {
			(window as unknown as { __spaAlive?: boolean }).__spaAlive = true;
		});

		await page.getByRole('link', { name: 'Users' }).click();

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-details-loading'),
		).not.toBeVisible();

		const alive = await page.evaluate(
			() => (window as unknown as { __spaAlive?: boolean }).__spaAlive === true,
		);
		expect(alive).toBe(true);
	});
});

test.describe('staff tenant details shell (rail-only) and Basics danger zone', () => {
	test('the detail route is rail-only, all four tabs render, and the danger zone is visible', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		// Rail-only: no secondary panel on the detail route, regardless of the
		// sidebarOpen preference (route-metadata.ts isRailOnlyPath).
		await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

		const nav = page.getByRole('navigation', { name: 'Tenant sections' });
		await expect(nav.getByText('Basics')).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Profiles' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Invitations' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();

		await expect(page.getByText('Danger zone')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();

		// Back on the tenants list, the secondary panel returns.
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	});
});
