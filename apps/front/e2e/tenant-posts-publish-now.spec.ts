import { expect, test } from '@playwright/test';

import { checkFeatureAncestry } from './helpers/feature-ancestry.ts';
import {
	loginAsTenantUser,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

// #1726: a branch that predates the publish-now merge (#1457, ef8a43d83) still
// runs this e2e test, taken from the base — and the failure blames the wrong
// PR. Before the test touches any UI that may not exist in the current tree,
// verify that the feature commit is an ancestor of HEAD. If it is not, the
// branch is older than the feature merge: fail LOUDLY naming the situation
// and the remedy (rebase) instead of letting a downstream assertion break on
// a missing page.
checkFeatureAncestry('ef8a43d83', 'publish-now (#1457)');

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
			// e2e stack. The deterministic reload loop below is the actual
			// answer to "how long until the worker flips scheduled→published":
			// it polls until the row lands, so the wall-clock time of the
			// test is dominated by worker latency on a given run, NOT by
			// this timeout. The timeout just has to be larger than the
			// expected worst case.
			//
			// Measured (ronde 10, 2026-08-30): 10 consecutive runs against
			// the local e2e stack (front.localhost:8443, fresh containers)
			// produced publish-now-link-visible latencies of 9.9s, 11.6s,
			// 5.3s, 7.7s, 12.6s, 7.2s, 10.3s, 7.0s, 6.9s, 7.5s — max 12.6s,
			// mean ~8.6s, all five with a 30 000 ms test timeout. The
			// previous 150 000 ms budget was chosen before anyone measured
			// the worker; it was a guess, not a number. CI runners are
			// noisier than the local stack, so a 2x margin over the local
			// max is the smallest honest ceiling that does not silently
			// truncate the observation loop. A future regression that pushes
			// the worker past 60s will trip THIS budget instead of the
			// loop's reload deadline — which is the loud failure the test
			// is for.
			test.setTimeout(60_000);

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
			// transition.
			//
			// IMPORTANT (ronde 10 proof): the assertion below binds the link
			// to its row's `post_excerpt` cell — the row's `postExcerpt` MUST
			// contain the freshly-composed `postBody`. Without this binding,
			// any link already present in the history table (a previous e2e
			// run on a shared tenant) would satisfy the test: `postRow()`'s
			// `.first()` would resolve to the stale row, the link's href would
			// still match `^https://bsky.app/profile/`, and the test would
			// pass while the publish-now feature itself stayed broken. The
			// `readPublishedHref()` helper returns `null` when the link's row
			// does not carry the freshly-composed `postBody`, so the reload
			// loop continues until either the new row reaches the table OR
			// the deadline is reached — and a stale-only hit never satisfies
			// the loop's exit condition. A post may have multiple
			// publications (one per connected social account), so take the
			// first link on the matching row and verify its href rather than
			// asserting a global count of 1 — the count depends on the
			// number of active seeded accounts, which is a seeder concern,
			// not this test's.
			const postRow = () =>
				page
					.getByTestId('tenant-posts-history-table')
					.locator('tr', { hasText: postBody });
			const readPublishedHref = async (): Promise<string | null> => {
				const row = postRow();
				if ((await row.count()) === 0) {
					return null;
				}
				const link = row.getByTestId('tenant-posts-history-link').first();
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

			// Final invariant (#1628 ronde 10 paired proof): the link we
			// observed belongs to the row that carries the freshly-composed
			// `postBody` in its `post_excerpt` cell. If `postRow()` ever
			// stopped filtering by `postBody`, this assertion would name the
			// mismatch and fail the test — the bug would be loud, not
			// silent. Use a `getByText` locator so the failure message names
			// the missing text in plain words instead of timing out on an
			// ambiguous locator chain. A paired kept-red proof under
			// `apps/front/tests/proofs/1628/` reads this source and asserts
			// both this invariant and the upstream `hasText: postBody`
			// filter remain in place — any future regression that drops one
			// turns that proof GREEN, which the `Verify paired red proofs`
			// CI step reports as CORRUPT PROOF.
			const matchingRowLocator = page
				.getByTestId('tenant-posts-history-table')
				.getByText(postBody, { exact: false });
			const matchingRowCount = await matchingRowLocator.count();
			if (matchingRowCount === 0) {
				throw new Error(
					`publish-now link matched a row whose post_excerpt ` +
						`does not contain the composed body: expected to ` +
						`find ${JSON.stringify(postBody)} in the history ` +
						`table body, found 0 matching rows.`,
				);
			}
		});
	},
);
