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
					ownersCount: 2,
					pendingInvitationsCount: 4,
					expiringSoonInvitationsCount: 2,
					profilesCount: 6,
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
				body: JSON.stringify({
					data: [
						{
							id: '0197b8f0-4444-7ccc-8ccc-dddddddddddd',
							email: 'jamie@example.com',
							firstName: 'Jamie',
							lastName: 'Lee',
							avatarUrl: null,
							status: 'Active',
							level: 'Admin',
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: '0197b8f0-5555-7ccc-8ccc-eeeeeeeeeeee',
							name: 'Approvers',
							description: 'Can review approvals',
							isDefault: true,
							userAccountCount: 7,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/invitations`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: '0197b8f0-6666-7ccc-8ccc-ffffffffffff',
							email: 'sam@example.com',
							status: 'Pending',
							profileName: 'Approvers',
							invitedByName: 'Taylor Smith',
							createdAt: '2026-07-01T09:00:00Z',
							expiresAt: '2026-07-07T09:00:00Z',
							acceptedAt: null,
						},
					],
					nextCursor: null,
				}),
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

test.describe('staff tenant details Basics stat cards and Owners card', () => {
	test('renders the Members, Owners, Pending invites, and Profiles stat cards, plus an Owners card whose See all link filters the Users tab', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}`);
		await expect(page.getByTestId('staff-tenant-details-page')).toBeVisible();

		await expect(page.getByTestId('tenant-stat-members')).toContainText('12');
		await expect(page.getByTestId('tenant-stat-owners')).toContainText('2');
		await expect(page.getByTestId('tenant-stat-invites')).toContainText('4');
		await expect(page.getByTestId('tenant-stat-profiles')).toContainText('6');

		const ownersRows = page.getByTestId('tenant-owners-rows');
		await expect(ownersRows).toBeVisible();
		await expect(ownersRows).toContainText('jamie@example.com');

		await page.getByRole('link', { name: 'See all' }).click();

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(page).toHaveURL(/level=admin/);
	});
});

test.describe('staff tenant Profiles/Invitations/Users tab bodies', () => {
	test('Profiles tab renders the toolbar, the card grid, and the cursor footer', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/profiles`);

		await expect(page.getByTestId('staff-tenant-profiles-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-profiles-grid-footer'),
		).toBeVisible();
	});

	test('Invitations tab renders the toolbar, the table, and the cursor footer', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/invitations`);

		await expect(
			page.getByTestId('staff-tenant-invitations-page'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-invitations-table-footer'),
		).toBeVisible();
	});

	test('Users tab renders the toolbar, the table, and the cursor footer — no checkbox column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantDetails(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);

		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-toolbar'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-search'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-rows'),
		).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-footer'),
		).toBeVisible();
		await expect(page.getByLabel('Select all rows')).toHaveCount(0);
	});
});
