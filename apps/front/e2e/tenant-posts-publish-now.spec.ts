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

// D2 acceptance: the e2e stack runs APP_ROLE=all (api + worker in one
// container) with PUBLISHING_FAKE_PROVIDER=true, so the full publish pipeline
// (session-open → delivery → status transition) runs end-to-end through the
// deterministic fakes — no PDS is ever contacted. The test logs in as the
// seeded non-admin member (user-acme), who carries the publish verbs through
// the demo-publishing profile (PublishingProfileSeeder, gated behind
// PUBLISHING_FAKE_PROVIDER) so the real permission gate is exercised.
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
			// The worker is single-threaded and shares the API container in the
			// e2e stack. On a loaded CI runner the worker can take longer than
			// a few seconds to pick the fresh `scheduled` row up, so stay well
			// above the default 30s test timeout: the observation loop below
			// gives the worker up to 120s to reach `published`.
			test.setTimeout(150_000);

			await loginAsTenantUser(page, SINGLE_TENANT_USER_CREDENTIALS);

			await page.goto('/tenant/posts/drafts');
			const drafts = page.getByTestId('tenant-posts-drafts-page');
			await expect(drafts).toBeVisible();

			// Compose
			await page.getByTestId('tenant-posts-new-post').click();
			const body = page.getByTestId('tenant-posts-create-body');
			await expect(body).toBeVisible();
			const postBody = 'Publish-now end-to-end post from D2 (#645)';
			await body.fill(postBody);

			// Choose the visible target(s) and publish immediately. The seeded
			// non-admin member holds both tenant.posts.publish and
			// tenant.socialaccounts.publish through the demo-publishing profile
			// (PublishingProfileSeeder), so the block renders; the demo
			// SocialAccountSeeder (gated behind PUBLISHING_FAKE_PROVIDER=true)
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
			// provider. The history list auto-refreshes while a row is in
			// flight (in_progress, or scheduled and freshly updated), but the
			// mount fetch can still land outside that window and then the page
			// sits on the stale row until a manual reload. Reload on a short
			// cadence so the test deterministically observes the worker's
			// transition. Filter the row by the post body text so we never
			// match other published posts left over from earlier runs on a
			// shared tenant. A post may have multiple publications (one per
			// connected social account), so take the first link and verify its
			// href rather than asserting a global count of 1 — the count
			// depends on the number of active seeded accounts, which is a
			// seeder concern, not this test's.
			const postRow = () =>
				page
					.getByTestId('tenant-posts-history-table')
					.locator('tr', { hasText: postBody });
			const readPublishedHref = async () => {
				const link = postRow().getByTestId('tenant-posts-history-link').first();

				if (!(await link.isVisible().catch(() => false))) {
					return null;
				}

				return link.getAttribute('href');
			};

			const publishDeadline = Date.now() + 120_000;
			let publishedHref: string | null = await readPublishedHref();

			while (publishedHref === null && Date.now() < publishDeadline) {
				await page.reload();
				await expect(history).toBeVisible();
				publishedHref = await readPublishedHref();
			}

			if (publishedHref === null) {
				throw new Error(
					'publish-now never surfaced an external link in history within 120s',
				);
			}

			expect(publishedHref).toMatch(/^https:\/\/bsky\.app\/profile\//);
		});
	},
);
