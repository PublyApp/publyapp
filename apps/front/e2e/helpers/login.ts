import { expect, type Page } from '@playwright/test';

const STAFF_ADMIN_CREDENTIALS = {
	email: process.env.E2E_STAFF_ADMIN_EMAIL ?? 'staff-admin@example.com',
	password: process.env.E2E_STAFF_ADMIN_PASSWORD ?? 'ChangeMe123!@3#lol',
};

// Seeded via apps/api/Data/Seeding/SeedConstants.cs + UserAccountSeeder.cs —
// every seeded user (staff and tenant) shares SeedConstants.SeedPassword.
const SEED_PASSWORD = 'ChangeMe123!@3#lol';

/** Single-tenant user: only a member of Acme (SeedConstants.Tenants). */
export const SINGLE_TENANT_USER_CREDENTIALS = {
	email: 'user-acme@example.com',
	password: SEED_PASSWORD,
};

/** Cross-tenant user: member of both Acme and TechStart (both Active). */
export const MULTI_TENANT_USER_CREDENTIALS = {
	email: 'alice@example.com',
	password: SEED_PASSWORD,
};

/**
 * Seeded tenant Admin (AccountLevel.Admin → effective set ["*"]). The
 * manage-gated tenant surfaces (Integrations C3) are only reachable with
 * this account; user-acme is a plain Member.
 */
export const TENANT_ADMIN_CREDENTIALS = {
	email: 'admin-acme@example.com',
	password: SEED_PASSWORD,
};

export const loginAsTenantUser = async (
	page: Page,
	credentials: { email: string; password: string },
): Promise<void> => {
	await page.goto('/login');

	await expect(page.locator('input[name="email"]')).toBeVisible();
	await page.locator('input[name="email"]').fill(credentials.email);
	await page.locator('input[name="password"]').fill(credentials.password);
	await page
		.locator('[data-testid="auth-login-form"] button[type="submit"]')
		.click();

	await page.waitForURL(/\/tenant(?:[/?#].*)?$/, {
		waitUntil: 'domcontentloaded',
	});
};

export const getInviteStaffUserButton = (page: Page) =>
	page.getByRole('link', {
		name: /^(Invite users|Inviter des utilisateurs)$/,
	});

export const setLocaleCookie = async (page: Page, locale: 'fr') => {
	await page.context().addCookies([
		{
			name: 'publyapp-locale',
			value: locale,
			domain: 'front.localhost',
			path: '/',
			secure: true,
			sameSite: 'Lax',
		},
	]);
};

/**
 * Fast-path aware: projects that supply a pre-authenticated `storageState`
 * (see playwright.config.ts's `setup` project) land straight on
 * `/staff/staff-users` without ever hitting the login form. Projects with no
 * (or an expired) session get redirected to `/login` by the server/browser
 * session guards, then this helper fills the form. To avoid races, it waits for
 * whichever appears first: the `staff-users-table` (fast path) or the login form
 * (fallback) using a deterministic race. Every existing call site keeps working
 * unchanged (review-r1-tests.md F29).
 */
export const loginAsStaffAdmin = async (page: Page): Promise<void> => {
	await page.goto('/staff/staff-users');

	const firstVisible = await Promise.race([
		page
			.getByTestId('staff-users-table')
			.waitFor({ state: 'visible' })
			.then(() => 'table'),
		page
			.locator('input[name="email"]')
			.waitFor({ state: 'visible' })
			.then(() => 'login'),
	]);

	if (firstVisible === 'login') {
		await expect(page.locator('input[name="email"]')).toBeVisible();
		await page
			.locator('input[name="email"]')
			.fill(STAFF_ADMIN_CREDENTIALS.email);
		await page
			.locator('input[name="password"]')
			.fill(STAFF_ADMIN_CREDENTIALS.password);
		// Locale-agnostic: the login CTA copy is now i18n'd (t('sign-in') →
		// "Se connecter" under the fr locale), so match the sole submit button
		// in the login form rather than its English label.
		await page
			.locator('[data-testid="auth-login-form"] button[type="submit"]')
			.click();

		await page.waitForURL(/\/staff(?:\/staff-users)?(?:[?#].*)?$/, {
			waitUntil: 'domcontentloaded',
		});
		if (!new URL(page.url()).pathname.endsWith('/staff-users')) {
			await page.goto('/staff/staff-users');
		}
	}

	await expect(page.getByTestId('staff-users-table')).toBeVisible({
		timeout: 15_000,
	});
};
