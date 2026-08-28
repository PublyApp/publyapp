import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	SINGLE_TENANT_ADMIN_CREDENTIALS,
} from './helpers/login';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts). Every test here calls
// `loginAsTenantUser`, which does a real form login starting from `/login`,
// so this file must start from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

// D2 acceptance: the e2e stack runs APP_ROLE=all (api + worker in one
// container) with PUBLISHING_FAKE_PROVIDER=1, so the full publish pipeline
// (session-open → delivery → status transition) runs end-to-end through the
// deterministic fakes — no PDS is ever contacted. The test logs in as
// admin-acme (AccountLevel.Admin), who carries the tenant.admin implicit
// grant and therefore the tenant.socialaccounts.publish permission that
// gates the PublishOnBlock.
test.describe(
	'tenant posts publish now',
	{ tag: ['@tenant-workspace', '@645'] },
	() => {
		// D2 acceptance: publish now against the faked Bluesky provider lands
		// the post in history with exactly ONE external link — no duplicate
		// (the deterministic idempotency key makes worker retries safe).
		test('publish now appears once in history with an external link', async ({
			page,
		}) => {
			await loginAsTenantUser(page, SINGLE_TENANT_ADMIN_CREDENTIALS);

			await page.goto('/tenant/posts/drafts');
			const drafts = page.getByTestId('tenant-posts-drafts-page');
			await expect(drafts).toBeVisible();

			// Compose
			await page.getByTestId('tenant-posts-new-post').click();
			const body = page.getByTestId('tenant-posts-create-body');
			await expect(body).toBeVisible();
			await body.fill('Publish-now end-to-end post from D2 (#645)');

			// Choose the visible target(s) and publish immediately. Admin carries
			// tenant.socialaccounts.publish implicitly, so the block renders; the
			// demo SocialAccountSeeder (gated behind PUBLISHING_FAKE_PROVIDER=1)
			// seeds one Active Bluesky account for Acme.
			const targets = page.locator(
				'[data-testid^="tenant-posts-publish-target-"]',
			);
			await expect(targets.first()).toBeVisible();
			await targets
				.all()
				.then((boxes) => Promise.all(boxes.map((b) => b.check())));

			await page.getByTestId('tenant-posts-publish-now').click();

			// Redirect to history
			const history = page.getByTestId('tenant-posts-history-page');
			await expect(history).toBeVisible();

			// The worker drives the publication to Published through the faked
			// provider; poll the list until the link shows up.
			const link = page.getByTestId('tenant-posts-history-link');
			await expect(link).toBeVisible({ timeout: 30_000 });
			await expect(link).toHaveAttribute(
				'href',
				/^https:\/\/bsky\.app\/profile\//,
			);

			// Idempotency, visible end-to-end: exactly one link for the post.
			await expect(link).toHaveCount(1);
		});
	},
);
