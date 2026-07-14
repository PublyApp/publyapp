import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const THEME_TOGGLE_TEST_ID = 'theme-toggle';

test.describe('logout in one tab', () => {
	// Own clean context, not the shared staff-admin `storageState`: the day
	// `clearSession` starts revoking the session server-side (queued —
	// review-r3-tests.md F11), logging out here would invalidate the token
	// every other `chromium`-project test running concurrently is relying on.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('logout in one tab bounces every other authed tab to /login', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const otherTab = await page.context().newPage();
		await otherTab.goto('/staff/staff-users');
		await expect(otherTab.getByTestId('staff-users-table')).toBeVisible();

		await page.getByTestId('app-shell-user-menu-trigger').click();
		await expect(page.getByTestId('app-shell-user-menu')).toBeVisible();
		await page.getByTestId('app-shell-user-menu-logout').click();

		await expect(page).toHaveURL(/\/login$/);
		await expect(otherTab).toHaveURL(/\/login$/, { timeout: 10_000 });
		await expect(otherTab.getByTestId('auth-login-form')).toBeVisible();
	});
});

test('toggling the theme in one tab flips it in every other tab', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	const otherTab = await page.context().newPage();
	await otherTab.goto('/staff/staff-users');
	await expect(otherTab.getByTestId('staff-users-table')).toBeVisible();

	const otherTabHtmlClassBefore = await otherTab
		.locator('html')
		.getAttribute('class');

	await page.getByTestId(THEME_TOGGLE_TEST_ID).click();

	await expect
		.poll(async () => otherTab.locator('html').getAttribute('class'), {
			timeout: 10_000,
		})
		.not.toBe(otherTabHtmlClassBefore);
});

test.describe('logging in on a parked tab', () => {
	// The `chromium` project supplies a pre-authenticated staff-admin
	// `storageState` (playwright.config.ts, review-r1-tests.md F29) so the
	// other tests in this file can skip a real form login. This test's whole
	// premise is a tab that starts logged OUT and only becomes authenticated
	// via the OTHER tab's login — with that storageState in place, the
	// parked tab's `/login` visit would already carry a valid session and
	// redirect straight to the workspace instead of showing the login form,
	// so it needs its own clean context.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('logging in on one parked /login tab moves it into the workspace', async ({
		page,
	}) => {
		const parkedTab = await page.context().newPage();
		await parkedTab.goto('/login');
		await expect(parkedTab.getByTestId('auth-login-form')).toBeVisible();

		await loginAsStaffAdmin(page);

		await expect(parkedTab).toHaveURL(/\/staff(?:\/staff-users)?(?:[?#].*)?$/, {
			timeout: 10_000,
		});
	});
});
