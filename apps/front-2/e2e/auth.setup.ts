import { test as setup } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';
import { STAFF_ADMIN_STORAGE_STATE } from './helpers/storage-state';

/**
 * Runs once per full suite invocation (see playwright.config.ts's `setup`
 * project) and saves a real, logged-in session so every test in the
 * `chromium`/`chromium-hermetic-counter` projects can start already
 * authenticated instead of paying for a full form login + 15s visibility
 * wait per test (review-r1-tests.md F29). `loginAsStaffAdmin` itself stays
 * the single source of truth for "what a successful staff-admin login looks
 * like" — this just captures its result.
 */
setup('authenticate as staff admin', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await page.context().storageState({ path: STAFF_ADMIN_STORAGE_STATE });
});
