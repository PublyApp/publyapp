import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

test('user menu logout clears the session and returns to login', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	await page.getByTestId('app-shell-user-menu-trigger').click();
	await expect(page.getByTestId('app-shell-user-menu')).toBeVisible();

	await page.getByTestId('app-shell-user-menu-logout').click();

	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByTestId('auth-login-form')).toBeVisible();
});
