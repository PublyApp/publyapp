import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** More rows than fit in a viewport-height table card, so the table's own
 * scroll container actually overflows. */
const SEEDED_USER_ROWS = Array.from({ length: 40 }, (_, index) => ({
	id: `0197b8f0-4444-7ccc-8ccc-${String(index).padStart(12, '0')}`,
	userAccountId: `0197b8f0-5555-7ccc-8ccc-${String(index).padStart(12, '0')}`,
	email: `user-${index}@example.com`,
	firstName: `User`,
	lastName: `${index}`,
	avatarUrl: null,
	status: 'Active',
	level: 'Admin',
}));

const mockTenantUsers = async (page: Page) => {
	await page.route(`**/staff/tenants/**`, async (route) => {
		const request = route.request();
		const url = request.url();

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: TENANT_ID,
					name: 'Acme Corporation',
					code: 'ACME',
					status: 'Active',
					usersCount: SEEDED_USER_ROWS.length,
					maxUsers: 100,
					ownersCount: 2,
					pendingInvitationsCount: 4,
					expiringSoonInvitationsCount: 2,
					profilesCount: 6,
					logoUrl: null,
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}/users`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: SEEDED_USER_ROWS, nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe('tenant Users tab: the table owns its scroll, not the page', () => {
	test('the app shell body does not scroll while the table body does', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantUsers(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/users`);
		await expect(page.getByTestId('staff-tenant-users-page')).toBeVisible();
		await expect(
			page.getByTestId('staff-tenant-users-table-rows'),
		).toBeVisible();

		// `.app-shell-main` is the shell's real scroll container (the document
		// itself never scrolls — `.app-shell-body` is `h-dvh overflow-hidden`).
		// It must stay bounded to the viewport: scrollHeight === clientHeight.
		const shellMainOverflow = await page
			.locator('.app-shell-main')
			.evaluate((element) => element.scrollHeight - element.clientHeight);
		expect(shellMainOverflow).toBeLessThanOrEqual(1);

		// The table's own internal scroll container (`[data-slot="table-
		// container"]`, rendered by the shared `Table` primitive) must overflow
		// instead — that's where the 40 seeded rows actually scroll.
		const tableContainerOverflow = await page
			.locator(
				'[data-testid="staff-tenant-users-table-card"] [data-slot="table-container"]',
			)
			.evaluate((element) => element.scrollHeight - element.clientHeight);
		expect(tableContainerOverflow).toBeGreaterThan(0);

		// The toolbar and cursor footer stay pinned in view while rows scroll.
		// The default ratio is 0 (one visible pixel passes) — ratio: 1 requires
		// the whole element to be in the viewport (review-r1-tests.md F25).
		await expect(
			page.getByTestId('staff-tenant-users-table-toolbar'),
		).toBeInViewport({ ratio: 1 });
		await expect(
			page.getByTestId('staff-tenant-users-table-footer'),
		).toBeInViewport({ ratio: 1 });
	});
});
