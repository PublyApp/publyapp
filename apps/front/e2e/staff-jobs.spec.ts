import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const QUEUE_TABLE = 'staff-jobs-queue-table';
const DLQ_TABLE = 'staff-jobs-dead-letter-table';
const SYSTEM_TABLE = 'staff-jobs-system-table';

/** The K-3 protected definition seeded by SystemJobDefinitionSeeder.cs —
 * its dashed JobKey spelling matches the handler's real constant. */
const PROTECTED_JOB_KEY = 'email-prepared-sends-retention';

type QueueItem = {
	id: string;
	jobType: string;
	status: string;
	attempts: number;
	maxAttempts: number;
	tenantId: string | null;
	nextAttemptAt: string | null;
	createdAt: string;
};

const queueRow: QueueItem = {
	id: 'aaaaaaaa-0000-0000-0000-000000000001',
	jobType: 'SendEmailJob',
	status: 'pending',
	attempts: 1,
	maxAttempts: 5,
	tenantId: null,
	nextAttemptAt: '2026-08-26T09:00:00Z',
	createdAt: '2026-08-26T08:00:00Z',
};

const mockQueueList = async (page: Page, rows: QueueItem[]): Promise<void> => {
	await page.route('**/staff/jobs/queue**', async (route) => {
		if (
			route.request().method() !== 'GET' ||
			!route.request().url().startsWith(`${API_BASE_URL}/staff/jobs/queue`)
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: rows, nextCursor: null }),
		});
	});
};

test.describe('staff jobs dashboard', { tag: ['@staff-jobs', '@1454'] }, () => {
	test('admin walks queue → dead-letter requeue → system jobs trigger', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		// --- Queue tab renders rows from the mocked list endpoint.
		await mockQueueList(page, [queueRow]);
		await page.goto('/staff/jobs');
		await expect(page.getByTestId(QUEUE_TABLE)).toBeVisible();
		await expect(
			page.getByTestId(QUEUE_TABLE).getByText('SendEmailJob'),
		).toBeVisible();

		// --- Dead-letter tab: a failed row is inspectable and requeuable.
		const deadLetterId = 'aaaaaaaa-0000-0000-0000-000000000002';
		let requeued = false;
		await page.route('**/staff/jobs/dead-letter**', async (route) => {
			if (
				route.request().method() !== 'GET' ||
				!route
					.request()
					.url()
					.startsWith(`${API_BASE_URL}/staff/jobs/dead-letter`)
			) {
				await route.fallback();
				return;
			}

			if (requeued) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data: [], nextCursor: null }),
				});
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: deadLetterId,
							jobType: 'SendEmailJob',
							externalStateStatus: 6,
							attempts: 5,
							failedAt: '2026-08-25T18:00:00Z',
							requeuedAt: null,
						},
					],
					nextCursor: null,
				}),
			});
		});
		await page.route(`**/staff/dead-letter/${deadLetterId}`, async (route) => {
			if (route.request().method() === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						id: deadLetterId,
						jobType: 'SendEmailJob',
						payload: JSON.stringify({ emailId: 'e-1' }),
						lastError: 'SMTP connection refused',
						attempts: 5,
						externalStateStatus: 6,
						failedAt: '2026-08-25T18:00:00Z',
					}),
				});
				return;
			}
			await route.fallback();
		});

		await page.getByRole('tab', { name: 'Dead letter' }).click();
		const url = new URL(page.url());
		expect(url.pathname).toBe('/staff/jobs/dead-letter');
		await expect(page.getByTestId(DLQ_TABLE)).toBeVisible();
		await page.getByRole('button', { name: 'SendEmailJob' }).first().click();
		await page.getByTestId(`dead-letter-requeue-${deadLetterId}`).click();
		await expect(
			page.getByRole('alertdialog', { name: 'Requeue this job?' }),
		).toBeVisible();
		await page.route(
			`**/staff/dead-letter/${deadLetterId}/requeue`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				requeued = true;
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						message: 'Job requeued.',
						translationKey: 'dead-letter-requeue-success',
					}),
				});
			},
		);
		await page
			.getByRole('alertdialog', { name: 'Requeue this job?' })
			.getByRole('button', { name: 'Requeue', exact: true })
			.click();
		await expect(
			page.locator('[data-sonner-toast][data-type="success"]'),
		).toBeVisible();
		await expect(page.getByTestId(DLQ_TABLE)).toBeVisible();

		// --- System jobs: trigger an enabled definition and see the toast.
		const systemJobId = 'aaaaaaaa-0000-0000-0000-000000000003';
		await page.route('**/staff/jobs/system-jobs**', async (route) => {
			if (
				route.request().method() !== 'GET' ||
				!route
					.request()
					.url()
					.startsWith(`${API_BASE_URL}/staff/jobs/system-jobs`)
			) {
				await route.fallback();
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: systemJobId,
							jobKey: 'retention-sweep',
							cronExpression: '*/15 * * * *',
							isEnabled: true,
							lastEnqueuedAt: '2026-08-26T07:45:00Z',
							updatedAt: '2026-08-26T07:45:00Z',
						},
					],
					nextCursor: null,
				}),
			});
		});
		await page.route(
			`**/staff/jobs/system-jobs/${systemJobId}/trigger`,
			async (route) => {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}

				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						message: 'Job triggered.',
						translationKey: 'system-job-trigger-success',
					}),
				});
			},
		);

		await page.getByRole('tab', { name: 'System jobs' }).click();
		await expect(page.getByTestId(SYSTEM_TABLE)).toBeVisible();
		await page.getByTestId(`system-job-trigger-${systemJobId}`).click();
		await expect(
			page.locator('[data-sonner-toast][data-type="success"]'),
		).toBeVisible();
	});

	test('triggering the protected definition surfaces the localized 409 toast and keeps it enabled', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto('/staff/jobs/system-jobs');
		await expect(page.getByTestId(SYSTEM_TABLE)).toBeVisible();

		// The seeder-backed protected row is present on the real stack.
		const row = page
			.getByTestId(SYSTEM_TABLE)
			.getByText(PROTECTED_JOB_KEY)
			.first();
		await expect(row).toBeVisible();

		// Toggling the K-3 protected definition off is rejected server-side
		// with the localized `system-job-disable-protected` problem key; the
		// switch must snap back to enabled.
		const protectedId = await page
			.getByTestId(SYSTEM_TABLE)
			.getByRole('row')
			.filter({ hasText: PROTECTED_JOB_KEY })
			.locator('[data-testid^="system-job-toggle-"]')
			.getAttribute('data-testid')
			.then((value) => value?.replace('system-job-toggle-', ''));
		expect(protectedId).toBeTruthy();

		const toggle = page.getByTestId(`system-job-toggle-${protectedId}`);
		await expect(toggle).toBeChecked();

		// Real backend round-trip: the seeder-backed definition carries
		// SystemJobDisableProtection, so PATCH /enabled answers 409 with the
		// `system-job-disable-protected` translation key and the switch snaps
		// back to its enabled state (mutation evidence lives in
		// .dump/mutation-check.md).
		await toggle.click();
		await expect(
			page.getByText(
				'This system job cannot be disabled because its retention cadence is a privacy control',
			),
		).toBeVisible();
		await expect(toggle).toBeChecked();
	});
});
