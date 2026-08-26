import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsTenantUser, TENANT_ADMIN_CREDENTIALS } from './helpers/login';

const INTEGRATIONS_URL = '/tenant/settings/integrations';
const CONNECT_PATH = '/social-accounts/connect';
const LIST_PATH = '/social-accounts';

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

			const isApiPath = (url: URL, path: string): boolean =>
				url.origin === API_BASE_URL && url.pathname === path;

			await page.route(
				(url) => isApiPath(url, LIST_PATH),
				(route) =>
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
				(url) => isApiPath(url, CONNECT_PATH),
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
