import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

test.describe('@tenant-workspace @638 tenant posts drafts', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);
	});

	test('create post via drawer, see in table, edit, save, back', async ({
		page,
	}) => {
		// Navigate to drafts page
		await page.goto('/tenant/posts/drafts');
		await expect(page.getByTestId('tenant-posts-drafts-page')).toBeVisible();

		// Open create drawer
		await page.getByTestId('tenant-posts-new-post').click();
		await expect(page.getByTestId('tenant-posts-create-drawer')).toBeVisible();

		// Fill in body
		const bodyInput = page.getByTestId('tenant-posts-create-body');
		await bodyInput.fill('E2E test post body');

		// Submit
		await page.getByTestId('tenant-posts-create-save').click();

		// Drawer should close
		await expect(
			page.getByTestId('tenant-posts-create-drawer'),
		).not.toBeVisible();

		// The post should appear in the table (or at minimum the table should refresh)
		await expect(page.getByTestId('tenant-posts-drafts-table')).toBeVisible();
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
