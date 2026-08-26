import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';

test.describe(
	'staff dashboard activity feed',
	{ tag: ['@staff-dashboard', '@818'] },
	() => {
		// Kiota's getGuidValue() silently drops rows with non-UUID ids — mocks
		// must use real UUIDv7-shaped ids or the table/feed looks empty while the
		// test still passes.
		const LOG_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

		/** Mocks the audit-log list endpoint the activity feed reads. */
		const mockAuditLogs = async (page: Page) => {
			await page.route('**/staff/audit-logs**', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						data: [
							{
								id: LOG_ID,
								action: 'tenant.created',
								userName: 'Ada Admin',
								userEmail: 'ada@example.com',
								ipAddress: '10.0.0.1',
								targetId: null,
								createdAt: '2026-08-26T08:00:00Z',
							},
						],
						nextCursor: null,
					}),
				});
			});
		};

		test('renders the recent audit-event feed with real mapped values and links to the full log', async ({
			page,
		}) => {
			await mockAuditLogs(page);

			await page.goto('/staff/dashboard/activity');

			const panel = page.getByTestId('staff-dashboard-activity-panel');
			await expect(panel).toBeVisible();
			await expect(
				panel.getByTestId('staff-dashboard-activity-entry'),
			).toHaveCount(1);
			await expect(panel.getByText('Ada Admin')).toBeVisible();

			await expect(
				page.getByTestId('staff-dashboard-activity-view-all'),
			).toHaveAttribute('href', '/staff/audit-logs');
		});

		test('shows an honest empty state when the audit log is empty (no placeholder text)', async ({
			page,
		}) => {
			await page.route('**/staff/audit-logs**', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data: [], nextCursor: null }),
				});
			});

			await page.goto('/staff/dashboard/activity');

			const panel = page.getByTestId('staff-dashboard-activity-panel');
			await expect(panel).toBeVisible();
			await expect(
				page.getByTestId('staff-dashboard-activity-empty'),
			).toBeVisible();
			// The retired bare-placeholder copy must never come back (#818 F8).
			await expect(panel.getByText(/not built yet/i)).toHaveCount(0);
		});

		test('the request carries the small explicit page size the feed needs', async ({
			page,
		}) => {
			let observedLimit: string | null = null;
			await page.route('**/staff/audit-logs**', async (route) => {
				const url = new URL(route.request().url());
				if (
					route.request().method() === 'GET' &&
					url.origin === API_BASE_URL &&
					url.pathname === '/staff/audit-logs'
				) {
					observedLimit = url.searchParams.get('limit');
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data: [], nextCursor: null }),
				});
			});

			await page.goto('/staff/dashboard/activity');

			await expect(
				page.getByTestId('staff-dashboard-activity-panel'),
			).toBeVisible();
			expect(observedLimit).toBe('8');
		});
	},
);
