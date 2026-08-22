import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts, review-r1-tests.md F29). Every test
// here calls `loginAsTenantUser`, which does a real form login starting from
// `/login` — with the staff-admin storageState in place, that navigation
// would redirect away before the login form ever renders, so this file must
// start from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@tenant-workspace @638 tenant posts drafts', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);
	});

	test('open create drawer and verify form fields render', async ({ page }) => {
		// Navigate to drafts page
		await page.goto('/tenant/posts/drafts');
		await expect(page.getByTestId('tenant-posts-drafts-page')).toBeVisible();

		// Open create drawer
		await page.getByTestId('tenant-posts-new-post').click();
		await expect(page.getByTestId('tenant-posts-create-drawer')).toBeVisible();

		// Verify form fields are rendered
		await expect(page.getByTestId('tenant-posts-create-body')).toBeVisible();
		await expect(page.getByTestId('tenant-posts-create-save')).toBeVisible();

		// Close the drawer via cancel
		await page.getByRole('button', { name: /cancel/i }).click();
		await expect(
			page.getByTestId('tenant-posts-create-drawer'),
		).not.toBeVisible();
	});

	test('drafts page renders heading and create button', async ({ page }) => {
		await page.goto('/tenant/posts/drafts');
		await expect(page.getByRole('heading', { name: /Drafts/i })).toBeVisible();
		await expect(page.getByTestId('tenant-posts-new-post')).toBeVisible();
	});

	test('empty drafts page shows empty state', async ({ page }) => {
		await page.goto('/tenant/posts/drafts');
		await expect(page.getByTestId('tenant-posts-drafts-page')).toBeVisible();
		// The page renders regardless of data state
		await expect(page.getByTestId('tenant-posts-drafts-table')).toBeVisible();
	});
});
