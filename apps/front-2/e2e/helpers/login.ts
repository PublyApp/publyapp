import { expect, type Page } from '@playwright/test';

const STAFF_ADMIN_CREDENTIALS = {
	email: process.env.E2E_STAFF_ADMIN_EMAIL ?? 'staff-admin@example.com',
	password: process.env.E2E_STAFF_ADMIN_PASSWORD ?? 'ChangeMe123!@3#lol',
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
			domain: 'front-2.localhost',
			path: '/',
			secure: true,
			sameSite: 'Lax',
		},
	]);
};

export const loginAsStaffAdmin = async (page: Page): Promise<void> => {
	await page.goto('/login');

	await expect(page.locator('input[name="email"]')).toBeVisible();
	await page.locator('input[name="email"]').fill(STAFF_ADMIN_CREDENTIALS.email);
	await page
		.locator('input[name="password"]')
		.fill(STAFF_ADMIN_CREDENTIALS.password);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await page.waitForURL(/\/staff(?:\/staff-users)?(?:[?#].*)?$/, {
		waitUntil: 'domcontentloaded',
	});
	if (!new URL(page.url()).pathname.endsWith('/staff-users')) {
		await page.goto('/staff/staff-users');
	}
	await expect(page.getByTestId('staff-users-table')).toBeVisible({
		timeout: 15_000,
	});
};
