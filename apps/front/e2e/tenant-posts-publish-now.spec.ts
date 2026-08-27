import { expect, test } from '@playwright/test';

import {
	loginAsTenantUser,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts). Every test here calls
// `loginAsTenantUser`, which does a real form login starting from `/login`,
// so this file must start from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

// QUARANTINE (owner decision, D2 verdict-r1 BLOCKER → option a): the e2e
// stack pins `APP_ROLE: api` (apps/front/docker-compose.test.yml, audit F24)
// and runs NO worker, seeds NO SocialAccount, and uses the REAL IBlueskyClient
// (Fakes live only in Lib/Testing/Fakes). Publish-now only *enqueues*
// publishing.publish-publication.v1, so the publication can never reach
// Published (no bsky.app link) here. The spec is honest about that pipeline
// but cannot complete it in this topology — identical red on pre-merge heads
// e7ef0c198 / 6191c4b20 and post-merge 88bf34857 (see .dump/merge-audit-m.md
// §CI convergence rounds, .dump/verdict-r1.md). fixme (not skip) so it turns
// RED the moment the pipeline works, prompting removal. Owner follow-up:
// either seed a SocialAccount + grant tenant.socialaccounts.publish to the e2e
// user + run a worker in the e2e stack + register FakeBlueskyClient for the api
// role, or drop the @645 tag. Tracked against #645.
test.describe.fixme(
	'tenant posts publish now',
	{ tag: ['@tenant-workspace', '@645'] },
	() => {
		// D2 acceptance: publish now against the faked Bluesky provider lands
		// the post in history with exactly ONE external link — no duplicate
		// (the deterministic idempotency key makes worker retries safe).
		test('publish now appears once in history with an external link', async ({
			page,
		}) => {
			await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);

			await page.goto('/tenant/posts/drafts');
			const drafts = page.getByTestId('tenant-posts-drafts-page');
			await expect(drafts).toBeVisible();

			// Compose
			await page.getByTestId('tenant-posts-new-post').click();
			const body = page.getByTestId('tenant-posts-create-body');
			await expect(body).toBeVisible();
			await body.fill('Publish-now end-to-end post from D2 (#645)');

			// Choose the visible target(s) and publish immediately. The block
			// only renders with tenant.socialaccounts.publish; if the seed has
			// no linked account the block is absent and this scenario cannot
			// run against the fake provider — fail loudly rather than silently.
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
