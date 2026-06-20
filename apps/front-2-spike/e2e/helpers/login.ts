import { expect, type Page } from '@playwright/test';

const STAFF_ADMIN_EMAIL = 'staff-admin@example.com';
const STAFF_ADMIN_PASSWORD = 'ChangeMe123!@3#lol';

export const getInviteStaffUserButton = (page: Page) =>
	page.locator('button').filter({ hasText: /^Invite staff user$/ });

export const loginAsStaffAdmin = async (page: Page): Promise<void> => {
	await page.goto('/login');

	await expect(page.getByPlaceholder('Email')).toBeVisible();
	await page.getByPlaceholder('Email').fill(STAFF_ADMIN_EMAIL);
	await page.getByPlaceholder('Password').fill(STAFF_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await page.waitForURL('**/staff/staff-users', {
		waitUntil: 'domcontentloaded',
	});
	await expect(getInviteStaffUserButton(page)).toBeVisible({ timeout: 15_000 });
};
