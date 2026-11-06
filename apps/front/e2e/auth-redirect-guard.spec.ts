import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

test.describe('auth redirect guard', { tag: ['@auth', '@untracked'] }, () => {
	// @untracked: handoff parity guard
	test('authenticated user navigating to /login is redirected to their workspace without seeing the login form', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		await page.goto('/login');

		// The staff home is the dashboard since the admin redesign (PROMPT
		// §2.2): `/staff` redirects to `/staff/dashboard`, so the old
		// `/staff-users`-only pattern no longer matched the destination.
		await page.waitForURL(
			/\/staff(?:\/(?:dashboard|staff-users))?(?:[?#].*)?$/,
			{
				waitUntil: 'domcontentloaded',
			},
		);
		expect(page.url()).not.toContain('/login');
		await expect(page.getByTestId('auth-login-form')).not.toBeVisible();
	});
});
