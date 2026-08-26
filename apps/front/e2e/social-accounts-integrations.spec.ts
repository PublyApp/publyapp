import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsTenantUser, TENANT_ADMIN_CREDENTIALS } from './helpers/login';

const INTEGRATIONS_URL = '/tenant/settings/integrations';

// Route globs are anchored at the API origin (`` `${API_BASE_URL}/…**` ``).
// A bare `**/social-accounts**` ALSO matches the lazy route chunk URL
// `/assets/social-accounts-<hash>.js` served by the FRONT origin, so the list
// handler fulfilled the module script with JSON; the browser rejected it on
// MIME type ("Expected a JavaScript module…") and the page never hydrated —
// observed as the empty state never rendering (CI shard 2/4, run 32941356252).
// Origin-anchored globs keep matching sub-paths and query strings via the
// trailing `**` (satisfying the design-system guard
// `no-single-star-route-glob`) while never touching front assets. The CONNECT
// handler registers AFTER the LIST one, so Playwright's last-registered-wins
// precedence keeps
// `/social-accounts/connect` requests out of the list handler despite the
// shared prefix.

// Plan defect (documented in PR): user-acme is a plain Member and NEVER
// receives the manage-gated Connect trigger — the shared seeded tenant
// Admin credential (effective set ["*"]) drives this spec instead.

test.describe(
	'social accounts integrations',
	{
		tag: ['@tenant-workspace', '@642'],
	},
	() => {
		test('connect (faked bluesky) then account appears in the list', async ({
			page,
		}) => {
			// The chromium project injects the staff-admin storageState; an authed
			// staff surface redirects /login before the form renders (same reason
			// drawer-form-scroll-geometry.spec.ts clears its storageState).
			await page.context().clearCookies();
			await loginAsTenantUser(page, TENANT_ADMIN_CREDENTIALS);

			let connectCalled = false;
			// Wire members per resolved A1 (SocialAccountListItem on wt-641).
			const connected = {
				id: '0197b8f0-3333-7ccc-8ccc-cccccccccccc',
				provider: 'bluesky',
				externalAccountId: 'did:plc:e2e000000000000000000000',
				displayHandle: '@e2e.bsky.social',
				status: 'active',
				credentialType: 'app_password',
				lastSuccessAt: new Date().toISOString(),
				lastError: null,
				projectIds: [],
			};

			await page.route(`${API_BASE_URL}/social-accounts**`, (route) =>
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					// Real C2 list wrapper: CursorPaginatedResult → { data, nextCursor }.
					body: JSON.stringify({
						data: connectCalled ? [connected] : [],
						nextCursor: null,
					}),
				}),
			);
			await page.route(
				`${API_BASE_URL}/social-accounts/connect**`,
				async (route) => {
					connectCalled = true;
					// C2 returns the created item FLAT as the 201 body.
					await route.fulfill({
						status: 201,
						contentType: 'application/json',
						body: JSON.stringify(connected),
					});
				},
			);

			await page.goto(INTEGRATIONS_URL);
			await expect(
				page.getByTestId('tenant-settings-connected-integrations-empty'),
			).toBeVisible();

			await page.getByRole('button', { name: /connect bluesky/i }).click();
			await page.getByTestId('bluesky-identifier').fill('@e2e.bsky.social');
			await page
				.getByTestId('bluesky-app-password')
				.fill('correct-horse-battery-staple');
			await page.getByRole('button', { name: /^connect$/i }).click();

			await expect(page.getByText('@e2e.bsky.social')).toBeVisible();
			await expect(page.getByTestId('status-pill-active')).toBeVisible();
		});
	},
);
