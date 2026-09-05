import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import {
	loginAsTenantUser,
	MULTI_TENANT_USER_CREDENTIALS,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';
import {
	cleanupTenantAccountFixture,
	createTenantAccountFixture,
	type TenantAccountFixture,
} from './helpers/tenant-account-fixture';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts, review-r1-tests.md F29). Every test
// here calls `loginAsTenantUser`, which does a real form login starting from
// `/login` — with the staff-admin storageState in place, that navigation
// would redirect away before the login form ever renders, so this file must
// start from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

// Authored per AUTH-4 — NOT run as part of this packet (no docker/playwright
// available to the executor). See SeedConstants.cs / UserAccountSeeder.cs:
// user-acme@example.com is single-tenant (Acme only, Active); alice@example.com
// is cross-tenant (Acme + TechStart, both Active). Neither seed has a
// suspended tenant, so the suspended-banner scenario isn't covered here —
// only by the unit tests in src/routes/authed/tenant.test.tsx.

test.describe(
	'tenant portal picker',
	{ tag: ['@staff-tenants', '@806'] },
	() => {
		test('a single-active-tenant user skips the picker entirely', async ({
			page,
		}) => {
			await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);

			// The single active tenant auto-resolves to the workspace and the
			// root redirects to `/tenant/account` (the picker never renders).
			await expect(page).toHaveURL(/\/tenant\/account/);
			await expect(page.getByTestId('tenant-workspace-shell')).toBeVisible();
			await expect(page.getByTestId('tenant-portal-picker')).toHaveCount(0);
		});

		test('a multi-active-tenant user sees the picker and can select an organization', async ({
			page,
		}) => {
			await loginAsTenantUser(page, MULTI_TENANT_USER_CREDENTIALS);

			await expect(page.getByTestId('simple-layout')).toBeVisible();
			await expect(page.getByTestId('tenant-portal-picker')).toBeVisible();

			const rows = page.getByTestId('tenant-portal-row');
			await expect(rows).toHaveCount(2);

			await rows.first().click();

			// Selecting a tenant resolves the workspace; the child redirects to
			// `/tenant/account` where the AppShell-mounted shell renders.
			await expect(page.getByTestId('tenant-workspace-shell')).toBeVisible();
			await expect(page.getByTestId('tenant-portal-picker')).toHaveCount(0);
		});

		test('logging out from the picker returns to login', async ({ page }) => {
			await loginAsTenantUser(page, MULTI_TENANT_USER_CREDENTIALS);

			await expect(page.getByTestId('tenant-portal-picker')).toBeVisible();
			await page.getByTestId('tenant-portal-logout-button').click();

			// The central logout flow redirects to /login, carrying the rto
			// (redirect-to) parameter naming the origin path — same contract as
			// ssr-auth-shell.spec.ts.
			await expect(page).toHaveURL(/\/login(\?rto=.*)?$/);
			await expect(page.getByTestId('auth-login-form')).toBeVisible();
		});
	},
);

const deleteTenantForPickerJourney = async (
	page: Page,
	fixture: TenantAccountFixture,
): Promise<void> => {
	const headers = { 'X-Session-Token': fixture.staffToken };
	const suspendResponse = await page.request.post(
		`${API_BASE_URL}/staff/tenants/${fixture.tenantId}/suspend`,
		{ headers, data: {} },
	);
	expect(suspendResponse.status(), 'suspend throwaway tenant').toBe(200);

	const deleteResponse = await page.request.delete(
		`${API_BASE_URL}/staff/tenants/${fixture.tenantId}`,
		{ headers },
	);
	expect(deleteResponse.status(), 'delete throwaway tenant').toBe(200);
};

test.describe(
	'tenant portal picker — real all-deleted journey',
	{ tag: ['@staff-tenants', '@1611'] },
	() => {
		test('explains that the active tenant was removed by an administrator', async ({
			page,
		}) => {
			let fixture: TenantAccountFixture | undefined;
			try {
				fixture = await createTenantAccountFixture(page);
				await loginAsTenantUser(page, {
					email: fixture.email,
					password: fixture.password,
				});
				await expect(page.getByTestId('tenant-workspace-shell')).toBeVisible();

				await deleteTenantForPickerJourney(page, fixture);

				const pickerResponsePromise = page.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						url.origin === API_BASE_URL &&
						url.pathname === '/auth/tenants-for-picker' &&
						response.request().method() === 'GET' &&
						response.status() === 200
					);
				});
				await page.goto('/tenant');
				const pickerResponse = await pickerResponsePromise;
				const payload = (await pickerResponse.json()) as {
					totalCount?: unknown;
					activeCount?: unknown;
					hasDeletedTenants?: unknown;
				};

				expect(payload.totalCount).toBe(0);
				expect(payload.activeCount).toBe(0);
				expect(payload.hasDeletedTenants).toBe(true);

				await expect(
					page.getByText('Your organizations are no longer available'),
				).toBeVisible();
				await expect(
					page.getByText(
						/All of your organizations have been removed by their administrators/,
					),
				).toBeVisible();
				await expect(
					page.getByTestId('tenant-portal-logout-button'),
				).toBeVisible();
				await expect(page.getByText('No organizations found')).toHaveCount(0);
			} finally {
				if (fixture) {
					await cleanupTenantAccountFixture(page, fixture);
				}
			}
		});
	},
);
