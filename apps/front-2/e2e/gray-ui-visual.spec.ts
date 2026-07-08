import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const TABLE = 'staff-users-table';
const API_BASE_URL = 'https://api.front-2.localhost:8443';
const PENDING_INVITATION_ID = '11111111-1111-1111-1111-111111111111';
const INVITATION_DETAIL_PATH = `/staff/invitations/${PENDING_INVITATION_ID}`;

const seededInvitationDetails = {
	id: PENDING_INVITATION_ID,
	email: 'pending-staff@example.com',
	profileName: 'Admins',
	status: 'Pending',
	expiresAt: '2026-07-10T12:00:00Z',
	acceptedAt: null,
	revokedAt: null,
	createdAt: '2026-07-01T09:00:00Z',
	invitedByName: 'Owner User',
} as const;

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockInvitationDetails = async (page: import('@playwright/test').Page) => {
	await page.route('**/staff/invitations/**', async (route) => {
		const url = route.request().url();
		const method = route.request().method();

		if (method === 'GET' && isApiPath(url, INVITATION_DETAIL_PATH)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(seededInvitationDetails),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe('Gray UI visual acceptance smoke', () => {
	for (const width of [1280, 768, 390]) {
		test(`staff users list at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await loginAsStaffAdmin(page);

			await expect(page.getByTestId(TABLE)).toBeVisible();
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

			await page.screenshot({
				path: `test-results/gray-ui/staff-users-list-${width}.png`,
				fullPage: true,
			});
		});
	}

	test('no-match state', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);

		await expect(page.getByTestId(TABLE)).toBeVisible();
		await page.getByTestId(`${TABLE}-search`).fill('zzz-no-match-xyz');
		await expect(page.getByTestId(`${TABLE}-no-match`)).toBeVisible();

		await page.screenshot({
			path: 'test-results/gray-ui/staff-users-no-match.png',
			fullPage: true,
		});
	});

	test('detail surface', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);

		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

		const viewLink = page.getByTestId(`${TABLE}-rows`).locator('a').first();
		await viewLink.click();
		await page.waitForURL(/\/staff\/staff-users\//);

		await expect(page.getByTestId('staff-user-details-page')).toBeVisible();

		await page.screenshot({
			path: 'test-results/gray-ui/staff-user-detail.png',
			fullPage: true,
		});
	});

	test('destructive confirm dialog', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);

		await mockInvitationDetails(page);
		await page.goto(`/staff/invitations/${PENDING_INVITATION_ID}`);
		await expect(
			page.getByTestId('staff-invitation-details-page'),
		).toBeVisible();

		await page.getByRole('button', { name: /revoke/i }).click();

		await expect(page.getByRole('alertdialog')).toBeVisible();

		// Wait for HeroUI AlertDialog entering animation to finish before screenshot
		await page.waitForTimeout(350);

		await page.screenshot({
			path: 'test-results/gray-ui/destructive-confirm-dialog.png',
			fullPage: true,
		});
	});
});
