import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';
import { waitForBoundingBoxToSettle } from './helpers/settle';

const TABLE = 'staff-users-table';
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

/**
 * NOTE: this suite captures reference screenshots for manual/owner review —
 * it asserts real DOM structure per viewport (below), but it does NOT compare
 * pixels. `toHaveScreenshot()` baselines are QUEUED for the design-system
 * owner to commit separately (see review-r1-tests.md F10); adding them here
 * without owner-approved baselines would just pin whatever renders today,
 * including regressions.
 */
test.describe('Gray UI screenshot capture (no visual assertions — see NOTE above)', () => {
	for (const width of [1280, 768, 390]) {
		test(`staff users list at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await loginAsStaffAdmin(page);

			await expect(page.getByTestId(TABLE)).toBeVisible();
			const rows = page.getByTestId(`${TABLE}-rows`);
			await expect(rows).toBeVisible();

			// Per-viewport structural checks (previously identical at all three
			// widths, asserting nothing viewport-specific — F10):
			if (width >= 1024) {
				await expect(
					page.getByTestId('app-shell-secondary-panel'),
				).toBeVisible();
			} else {
				await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(
					0,
				);
			}
			if (width < 768) {
				await expect(page.getByTestId('app-shell-rail')).not.toBeVisible();
			} else {
				await expect(page.getByTestId('app-shell-rail')).toBeVisible();
			}
			// The table must never force horizontal scroll at any of these
			// widths — a collapsed/overflowing table would still pass a bare
			// toBeVisible() but fails this bound.
			const rowsScrollWidth = await rows.evaluate((el) => el.scrollWidth);
			const cardClientWidth = await page
				.getByTestId(`${TABLE}-card`)
				.evaluate((el) => el.clientWidth);
			expect(rowsScrollWidth).toBeGreaterThan(0);
			expect(rowsScrollWidth).toBeLessThanOrEqual(cardClientWidth + 1);

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
		// The rows container must actually be gone, not merely obscured behind
		// the no-match state — a stacked/overlapping render would still pass
		// the toBeVisible() above.
		await expect(page.getByTestId(`${TABLE}-rows`)).toHaveCount(0);

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
		await expect(page.getByTestId('staff-user-details-heading')).toBeVisible();
		// Detail routes are rail-only — the real invariant under test, not
		// just "some page rendered".
		await expect(page.getByTestId('app-shell-rail')).toBeVisible();
		await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

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

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();

		// Poll until the dialog's own entry animation (scale/translate) has
		// settled, instead of a fixed sleep tuned to one component library's
		// timing — this app has migrated off HeroUI, so a HeroUI-tuned wait
		// would be silently wrong on the next animation-timing change too.
		await waitForBoundingBoxToSettle(dialog);

		await page.screenshot({
			path: 'test-results/gray-ui/destructive-confirm-dialog.png',
			fullPage: true,
		});
	});
});
