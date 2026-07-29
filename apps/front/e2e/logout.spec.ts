import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

// Own clean context, not the shared staff-admin `storageState`: the day
// `clearSession` starts revoking the session server-side (queued —
// review-r3-tests.md F11), logging out here would invalidate the token every
// other `chromium`-project test running concurrently is relying on.
test.use({ storageState: { cookies: [], origins: [] } });

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
