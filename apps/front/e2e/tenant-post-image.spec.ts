import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	SINGLE_TENANT_ADMIN_CREDENTIALS,
} from './helpers/login';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts). Every test here does a real form
// login starting from `/login` — with the staff-admin storageState in place,
// that navigation would redirect away before the login form renders — so this
// file starts from a clean, unauthenticated context (same pattern as
// tenant-posts-drafts.spec.ts).
//
// The image attach verbs are permissioned (`posts.create`/`posts.edit`), so
// the flow runs as the seeded Acme ADMIN account; `user-acme` is a plain
// AccountLevel.User and would be refused before ever reaching the picker.
test.use({ storageState: { cookies: [], origins: [] } });

const POST_BODY = 'Draft with an attached image ';

test.describe('@uploads @639 tenant post image', () => {
	test('attach an image to a new draft, then see it on the drafts list and the edit page', async ({
		page,
	}) => {
		await loginAsTenantUser(page, SINGLE_TENANT_ADMIN_CREDENTIALS);

		// ── Compose: create a draft with body + deferred image + alt text ──
		await page.goto('/tenant/posts/drafts');
		const draftsPage = page.getByTestId('tenant-posts-drafts-page');
		await expect(draftsPage).toBeVisible();

		await page.getByTestId('tenant-posts-new-post').click();
		const drawer = page.getByTestId('tenant-posts-create-drawer');
		await expect(drawer).toBeVisible();

		const uniqueBody = `${POST_BODY}${Date.now()}`;
		await page.getByTestId('tenant-posts-create-body').fill(uniqueBody);

		// The picker's file input is sr-only but focusable/locatable by id.
		await page
			.getByTestId('tenant-posts-create-image-input')
			.setInputFiles(new URL('./fixtures/logo.png', import.meta.url).pathname);
		const preview = page.getByTestId('tenant-posts-create-image-preview');
		await expect(preview).toBeVisible();
		await page
			.getByTestId('tenant-posts-create-image-alt')
			.fill('A tiny red square');

		await page.getByTestId('tenant-posts-create-save').click();

		// Save closes the drawer once the post exists and the deferred image
		// has been attached.
		await expect(drawer).not.toBeVisible();

		// ── Drafts list shows the new draft ──
		const rowLink = page
			.getByTestId('tenant-posts-drafts-table')
			.getByRole('link')
			.filter({ hasText: uniqueBody });
		await expect(rowLink).toBeVisible();

		// ── Edit page shows the attached image with its alt text ──
		await rowLink.click();
		const editPage = page.getByTestId('tenant-post-edit-page');
		await expect(editPage).toBeVisible();
		await expect(page.getByTestId('tenant-post-edit-body')).toHaveValue(
			uniqueBody,
		);
		await expect(
			page.getByTestId('tenant-posts-create-image-preview'),
		).toBeVisible();
		await expect(page.getByTestId('tenant-posts-create-image-alt')).toHaveValue(
			'A tiny red square',
		);
	});
});
