import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';

test.describe(
	'staff dashboard activity feed',
	{ tag: ['@staff-dashboard', '@818'] },
	() => {
		// Kiota's getGuidValue() silently drops rows with non-UUID ids — mocks
		// must use real UUIDv7-shaped ids or the feed looks empty while the
		// test still passes.
		const LOG_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

		// The feed imports the audit-logs route's own filter modules, so an
		// origin-less `**/staff/audit-logs**` glob would also swallow those
		// Vite module requests (served as application/json → blank page).
		// Anchor each glob on the API origin: nothing served by the front dev
		// server can match it. The literal is inlined at every call because
		// the design-system guard cannot statically check a named constant.

		// The activity tab pulls the whole shared history stack; the first
		// navigation on a cold Vite dev server can exceed the 5 s default.
		const FIRST_RENDER_TIMEOUT = 15_000;

		/** Mocks the audit-log list endpoint the activity feed reads. */
		const mockAuditLogs = async (page: Page, data: unknown[]) => {
			await page.route(`${API_BASE_URL}/staff/audit-logs**`, async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data, nextCursor: null }),
				});
			});
			await page.route(
				`${API_BASE_URL}/staff/audit-logs/actions**`,
				async (route) => {
					await route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({ actions: [] }),
					});
				},
			);
		};

		test('renders the recent audit-event feed, starting with its toolbar', async ({
			page,
		}) => {
			await mockAuditLogs(page, [
				{
					id: LOG_ID,
					action: 'tenant.created',
					userName: 'Ada Admin',
					userEmail: 'ada@example.com',
					ipAddress: '10.0.0.1',
					targetId: null,
					createdAt: '2026-08-26T08:00:00Z',
				},
			]);

			await page.goto('/staff/dashboard/activity');

			const panel = page.getByTestId('staff-dashboard-activity');
			await expect(panel).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });
			// The shared history feed's day groups, not a dashboard-local list.
			const feed = panel.getByTestId('staff-dashboard-activity-days');
			await expect(feed).toBeVisible();
			await expect(feed.locator('[data-history-event]')).toHaveCount(1);
			await expect(feed.getByText('Ada Admin')).toBeVisible();

			// The shipped design has no title row above the toolbar (§5.1): the
			// tab starts directly with its search/filters. The full log is
			// reached from the side panel, not a « Tout voir » link.
			await expect(
				page.getByTestId('staff-dashboard-activity-search'),
			).toBeVisible();
			await expect(
				page.getByTestId('staff-dashboard-activity-view-all'),
			).toHaveCount(0);
		});

		test('shows an honest empty state when the audit log is empty (no placeholder text)', async ({
			page,
		}) => {
			await mockAuditLogs(page, []);

			await page.goto('/staff/dashboard/activity');

			const panel = page.getByTestId('staff-dashboard-activity');
			await expect(panel).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });
			await expect(
				page.getByTestId('staff-dashboard-activity-empty'),
			).toBeVisible();
			// The retired bare-placeholder copy must never come back (#818 F8).
			await expect(panel.getByText(/not built yet/i)).toHaveCount(0);
		});

		test('the request carries the feed’s explicit page size', async ({
			page,
		}) => {
			let observedLimit: string | null = null;
			await page.route(`${API_BASE_URL}/staff/audit-logs**`, async (route) => {
				observedLimit = new URL(route.request().url()).searchParams.get(
					'limit',
				);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data: [], nextCursor: null }),
				});
			});

			await page.goto('/staff/dashboard/activity');

			await expect(page.getByTestId('staff-dashboard-activity')).toBeVisible({
				timeout: FIRST_RENDER_TIMEOUT,
			});
			// `ACTIVITY_FEED_SIZE` (activity.tsx): one explicit page, no
			// server default.
			expect(observedLimit).toBe('50');
		});
	},
);
