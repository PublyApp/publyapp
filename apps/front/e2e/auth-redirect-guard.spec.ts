import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

test.describe('auth redirect guard', { tag: ['@auth', '@untracked'] }, () => {
	test('authenticated user navigating to /login is redirected to their workspace without seeing the login form', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		await page.goto('/login');

		await page.waitForURL(/\/staff(?:\/staff-users)?(?:[?#].*)?$/, {
			waitUntil: 'domcontentloaded',
		});
		expect(page.url()).not.toContain('/login');
		await expect(page.getByTestId('auth-login-form')).not.toBeVisible();
	});
});
