import { expect, type Page } from '@playwright/test';

const STAFF_ADMIN_EMAIL = 'staff-admin@example.com';
// Known dev seed credential. TODO(M1.4): source from shared fixture/env before ungating.
const STAFF_ADMIN_PASSWORD = 'ChangeMe123!@3#lol';

export const getInviteStaffUserButton = (page: Page) =>
	page.locator('button').filter({ hasText: /^Invite staff user$/ });

export const loginAsStaffAdmin = async (page: Page): Promise<void> => {
	await page.goto('/login');

	await expect(page.locator('input[name="email"]')).toBeVisible();
	await page.locator('input[name="email"]').fill(STAFF_ADMIN_EMAIL);
	await page.locator('input[name="password"]').fill(STAFF_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await page.waitForURL(/\/staff(?:\/staff-users)?(?:[?#].*)?$/, {
		waitUntil: 'domcontentloaded',
	});
	if (!new URL(page.url()).pathname.endsWith('/staff-users')) {
		await page.goto('/staff/staff-users');
	}
	await expect(getInviteStaffUserButton(page)).toBeVisible({ timeout: 15_000 });
};
