import { expect, test, type Page } from '@playwright/test';

import { sleep } from '@org/shared-ts/utils/any.utils';

import { API_BASE_URL, getSessionTokenFromBrowser } from './helpers/api';
import {
	loginAsTenantUser,
	SINGLE_TENANT_USER_CREDENTIALS,
} from './helpers/login';

const TENANT_HEADER_KEY = 'X-PublyApp-TenantId';
const PUBLICATIONS_PATH = '/publishing/publications';
/** The worker is single-threaded and shares the API container in the e2e
 * stack; ten measured publish-now latencies on 2026-08-30 ranged 5.3–12.6 s
 * (mean ~8.6 s). This bound is the observation deadline for the worker, not a
 * wait for the UI to catch up. */
const WORKER_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 250;

type PublicationWireRow = {
	postExcerpt?: string | null;
	status?: string | null;
	externalUrl?: string | null;
};

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts). Every test here calls
// `loginAsTenantUser`, which does a real form login starting from `/login`,
// so this file must start from a clean, unauthenticated context.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The tenant the app itself scopes its publications request to, read off the
 * request the history page issues. The test must not guess it: the app owns
 * that header, and the API authenticates the tenant scope from it.
 */
const armHistoryPublicationsRequest = (page: Page) =>
	page.waitForResponse(
		(candidate) =>
			candidate.request().method() === 'GET' &&
			candidate.url().startsWith(`${API_BASE_URL}${PUBLICATIONS_PATH}`),
		{ timeout: 15_000 },
	);

const readTenantIdFromHistoryRequest = async (
	historyListResponse: Promise<import('@playwright/test').Response>,
): Promise<string> => {
	const response = await historyListResponse;
	const tenantId = response.request().headers()['x-publyapp-tenantid'] ?? '';
	expect(tenantId, 'the history list request must name its tenant').not.toBe(
		'',
	);
	return tenantId;
};

/**
 * Polls the REAL publications endpoint until the worker has driven this
 * post's publication to a terminal Published row carrying an external URL.
 * Returns that URL so the UI assertion below can cross-check it.
 *
 * This is the FIX-FLAKY replacement for a 120-second `page.reload()` loop
 * (#2260): the observation is a cheap API request with a deadline tied to the
 * worker's measured latency, not a full document bootstrap per iteration.
 */
const waitForPublishedExternalUrl = async (
	page: Page,
	options: { postBody: string; tenantId: string },
): Promise<string> => {
	const token = await getSessionTokenFromBrowser(page, 'tenant');
	if (token === undefined) {
		throw new Error('no tenant session token to read publications with');
	}
	const deadline = Date.now() + WORKER_DEADLINE_MS;
	let observed = 'no publication row for the composed body';

	for (;;) {
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		const response = await page.request.get(
			`${API_BASE_URL}${PUBLICATIONS_PATH}?limit=50`,
			{
				headers: {
					'X-Session-Token': token,
					[TENANT_HEADER_KEY]: options.tenantId,
				},
			},
		);
		expect(
			response.status(),
			'reading publications must be authenticated (403/401 here means the page and the test disagree about scope, not that publish-now failed)',
		).toBe(200);
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		const payload = (await response.json()) as { data?: PublicationWireRow[] };
		const row = (payload.data ?? []).find((candidate) =>
			(candidate.postExcerpt ?? '').includes(options.postBody),
		);
		if (row !== undefined) {
			observed = `publication status ${String(row.status)}`;
			if (typeof row.externalUrl === 'string' && row.externalUrl.length > 0) {
				return row.externalUrl;
			}
		}
		if (Date.now() > deadline) {
			throw new Error(
				`publish-now never reached Published within ${WORKER_DEADLINE_MS}ms of worker observation (last seen: ${observed})`,
			);
		}
		// eslint-disable-next-line no-await-in-loop -- intentional sequential poll
		await sleep(POLL_INTERVAL_MS);
	}
};

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
			// e2e stack, so "how long until the worker flips scheduled→published"
			// is a property of the worker, not of this test. The observation
			// below polls the API with its own deadline (WORKER_DEADLINE_MS,
			// 20 s — ~1.6x the 12.6 s worst case measured over ten runs on
			// 2026-08-30) and the test keeps the default 30 s budget. A
			// regression that pushes the worker past the deadline fails loudly
			// with the last observed status, instead of silently stretching the
			// run.

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

			// Armed BEFORE the click: the history page's mount fetch is the request
			// whose tenant header the API poll below reuses.
			const historyListResponse = armHistoryPublicationsRequest(page);

			await page.getByTestId('tenant-posts-publish-now').click();

			// Redirect to history
			const history = page.getByTestId('tenant-posts-history-page');
			await expect(history).toBeVisible();

			// The worker drives the publication to Published through the faked
			// provider. #2260 FIX-FLAKY: this used to be a 120-second RELOAD LOOP —
			// `page.reload()` until the link appeared — so the test's duration was
			// whatever the shared single-threaded worker happened to cost that run,
			// and every iteration paid a full document bootstrap.
			//
			// The race it papered: the history page's own in-flight poll (5 s while a
			// row is `in_progress` or freshly `scheduled`) only starts when the mount
			// fetch already SAW such a row. A mount fetch that lands between the
			// publish-now POST and the row becoming visible sees nothing in flight,
			// stops polling, and then sits on a stale list forever — no amount of
			// waiting fixes that, which is why the loop had to reload.
			//
			// The fix observes the worker through the API first (a second request, the
			// seam the coverage guide asks for), and only reloads once, after the
			// publication is genuinely Published. The UI assertion then has a
			// deterministic precondition instead of a wall-clock race.
			const tenantId =
				await readTenantIdFromHistoryRequest(historyListResponse);
			const publishedHref = await waitForPublishedExternalUrl(page, {
				postBody,
				tenantId,
			});

			await page.reload();
			await expect(history).toBeVisible();

			// Row-level binding (ronde 10): the link must belong to the row whose
			// `post_excerpt` carries the freshly-composed body. A stale row from an
			// earlier run on a shared tenant can therefore never satisfy the
			// assertion, and `apps/front/tests/proofs/1628/` keeps this filter
			// pinned as a paired red proof.
			const postRow = () =>
				page
					.getByTestId('tenant-posts-history-table')
					.locator('tr', { hasText: postBody });
			const publishedRow = postRow();
			const link = publishedRow
				.getByTestId('tenant-posts-history-link')
				.first();
			await expect(link).toBeVisible();
			// Cross-check, not a duplicate: the href the UI paints must be the URL
			// the API reported for the same publication.
			expect(await link.getAttribute('href')).toBe(publishedHref);
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
