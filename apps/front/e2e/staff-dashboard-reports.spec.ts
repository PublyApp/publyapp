import { expect, test, type Page } from '@playwright/test';

test.describe(
	'staff dashboard reports tab',
	{ tag: ['@staff-dashboard', '@818'] },
	() => {
		/** Mocks the audit-log export endpoint the export menu calls. */
		const mockExport = async (page: Page) => {
			await page.route('**/staff/audit-logs/export**', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'text/csv',
					body: 'Id,Action,CreatedAt\n0197b8f0-3333-7ccc-8ccc-cccccccccccc,tenant.created,2026-08-26T08:00:00Z\n',
				});
			});
		};

		test('the export menu downloads the audit log as CSV', async ({ page }) => {
			await mockExport(page);

			await page.goto('/staff/dashboard/reports');

			await expect(
				page.getByTestId('staff-dashboard-reports-panel'),
			).toBeVisible();

			const exportRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					request.url().includes('/staff/audit-logs/export') &&
					new URL(request.url()).searchParams.get('format') === 'csv',
			);
			const downloadPromise = page.waitForEvent('download');
			await page.getByTestId('staff-dashboard-export-trigger').click();
			await page.getByTestId('staff-dashboard-export-csv').click();
			await exportRequest;
			const download = await downloadPromise;

			expect(download.suggestedFilename()).toMatch(
				/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/,
			);
		});

		test('the export menu sends format=json for the JSON entry', async ({
			page,
		}) => {
			await mockExport(page);

			await page.goto('/staff/dashboard/reports');
			await expect(
				page.getByTestId('staff-dashboard-reports-panel'),
			).toBeVisible();

			await page.getByTestId('staff-dashboard-export-trigger').click();

			const exportRequest = page.waitForRequest(
				(request) =>
					request.method() === 'GET' &&
					request.url().includes('/staff/audit-logs/export') &&
					new URL(request.url()).searchParams.get('format') === 'json',
			);
			await page.getByTestId('staff-dashboard-export-json').click();
			await exportRequest;
		});
	},
);
