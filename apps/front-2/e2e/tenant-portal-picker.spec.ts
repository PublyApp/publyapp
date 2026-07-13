import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	MULTI_TENANT_USER_CREDENTIALS,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

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

test('a single-active-tenant user skips the picker entirely', async ({
	page,
}) => {
	await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);

	await expect(page).toHaveURL(/\/tenant$/);
	await expect(page.getByTestId('tenant-workspace-placeholder')).toBeVisible();
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

	await expect(page.getByTestId('tenant-workspace-placeholder')).toBeVisible();
	await expect(page.getByTestId('tenant-portal-picker')).toHaveCount(0);
});

test('logging out from the picker returns to login', async ({ page }) => {
	await loginAsTenantUser(page, MULTI_TENANT_USER_CREDENTIALS);

	await expect(page.getByTestId('tenant-portal-picker')).toBeVisible();
	await page.getByTestId('tenant-portal-logout-button').click();

	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByTestId('auth-login-form')).toBeVisible();
});
