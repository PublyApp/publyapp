import { expect, test, type Page } from '@playwright/test';

test.describe(
	'staff dashboard reports tab',
	{ tag: ['@staff-dashboard', '@818'] },
	() => {
		/** Mocks the unfiltered audit-log export endpoint the card calls. */
		const mockExport = async (page: Page) => {
			await page.route('**/staff/audit-logs/export**', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'text/csv',
					body: 'Id,Action,CreatedAt\n0197b8f0-3333-7ccc-8ccc-cccccccccccc,tenant.created,2026-08-26T08:00:00Z\n',
				});
			});
		};

		test('downloads the audit-log export through the working report card', async ({
			page,
		}) => {
			await mockExport(page);

			await page.goto('/staff/dashboard/reports');

			const panel = page.getByTestId('staff-dashboard-reports-panel');
			await expect(panel).toBeVisible();

			const exportRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					request.url().includes('/staff/audit-logs/export') &&
					new URL(request.url()).searchParams.get('format') === 'csv',
			);
			const downloadPromise = page.waitForEvent('download');
			await page.getByTestId('staff-dashboard-reports-download').click();
			await exportRequest;
			const download = await downloadPromise;

			expect(download.suggestedFilename()).toMatch(
				/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/,
			);
		});

		test('switching the format control sends format=json instead of csv', async ({
			page,
		}) => {
			await mockExport(page);

			await page.goto('/staff/dashboard/reports');
			await expect(
				page.getByTestId('staff-dashboard-reports-panel'),
			).toBeVisible();

			await page.getByTestId('staff-dashboard-reports-format').click();
			await page.getByRole('option', { name: 'JSON', exact: true }).click();

			const exportRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					request.url().includes('/staff/audit-logs/export') &&
					new URL(request.url()).searchParams.get('format') === 'json',
			);
			await page.getByTestId('staff-dashboard-reports-download').click();
			await exportRequest;
		});

		test('shows the honest coming-later analytics state (no fabricated charts)', async ({
			page,
		}) => {
			await mockExport(page);

			await page.goto('/staff/dashboard/reports');

			const panel = page.getByTestId('staff-dashboard-reports-panel');
			await expect(panel).toBeVisible();
			await expect(
				panel.getByTestId('staff-dashboard-reports-empty'),
			).toBeVisible();
			// The retired bare-placeholder copy must never come back (#818 F8).
			await expect(panel.getByText(/not built yet/i)).toHaveCount(0);
		});
	},
);
