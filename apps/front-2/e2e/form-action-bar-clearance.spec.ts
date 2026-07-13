import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockTenantEdit = async (page: Page) => {
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
					usersCount: 12,
					maxUsers: 50,
					ownersCount: 2,
					pendingInvitationsCount: 4,
					expiringSoonInvitationsCount: 2,
					profilesCount: 6,
					logoUrl: null,
					legalName: null,
					description: null,
					websiteUrl: null,
					billingEmail: null,
					supportEmail: null,
					defaultLocale: null,
					timezone: null,
					notes: null,
					lastActivityAt: '2026-07-10T09:00:00Z',
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		await route.fallback();
	});
};

/** Short enough that the sticky FormActionBar and the form's last field
 * compete for the same viewport space, the way the owner-reported bug
 * required. */
const SHORT_VIEWPORT = { width: 1280, height: 620 };

/** Fully opaque per docs/guides/front-2/conventions.md — asserts the
 * resolved background-color's alpha channel is 1, so scrolled-past content
 * can never show through the pinned bar. */
const expectOpaqueBackground = async (page: Page) => {
	const alpha = await page
		.locator('[data-slot="form-action-bar"]')
		.evaluate((element) => {
			const [, , , a = '1'] = getComputedStyle(element)
				.backgroundColor.replace(/[^\d.,]/g, '')
				.split(',');
			return Number(a);
		});

	expect(alpha).toBe(1);
};

/** Asserts `field`'s full box (including any helper/hint text right below
 * it) sits above the action bar's top edge — i.e. nothing is left hidden
 * behind the pinned bar after a keyboard-focus scroll. */
const expectFieldFullyAboveActionBar = async (
	page: Page,
	field: ReturnType<Page['getByLabel']>,
) => {
	const barBox = await page
		.locator('[data-slot="form-action-bar"]')
		.boundingBox();
	const fieldBox = await field.boundingBox();
	if (!barBox || !fieldBox) {
		throw new Error('form action bar or field did not render');
	}

	expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(barBox.y + 1);
};

test.describe('form action bar: opaque and clears the last field', () => {
	test('create-tenant form: the bar is opaque, and keyboard-focusing the last field scrolls it fully above the bar', async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_VIEWPORT);
		await loginAsStaffAdmin(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();
		await expect(page.locator('[data-slot="form-action-bar"]')).toBeVisible();

		await expectOpaqueBackground(page);

		const lastField = page.getByRole('switch', {
			name: 'Seed default profiles',
		});
		await lastField.focus();
		await expect(lastField).toBeFocused();
		await expectFieldFullyAboveActionBar(page, lastField);
	});

	test('edit-tenant form: keyboard-focusing the last field (Internal notes) scrolls it fully above the bar', async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_VIEWPORT);
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();
		await expect(page.locator('[data-slot="form-action-bar"]')).toBeVisible();

		await expectOpaqueBackground(page);

		const lastField = page.getByRole('textbox', { name: 'Internal notes' });
		await lastField.focus();
		await expect(lastField).toBeFocused();
		await expectFieldFullyAboveActionBar(page, lastField);
	});
});

/** Wheeling over a part of the shell with no scroll container of its own
 * (the rail) used to bubble up to <body>, which stayed independently
 * scrollable even though `.app-shell-main` also scrolls — the double
 * scrollbar bug (handoff 2a). Asserts the rail wheel is a no-op for the
 * document, so `.app-shell-main` stays the single scroller. */
const expectSingleScroller = async (page: Page) => {
	const railBox = await page.locator('.app-shell-rail').boundingBox();
	if (!railBox) {
		throw new Error('rail did not render');
	}

	await page.mouse.move(
		railBox.x + railBox.width / 2,
		railBox.y + railBox.height / 2,
	);
	await page.mouse.wheel(0, 500);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollTop))
		.toBe(0);

	const bodyOverflow = await page.evaluate(
		() => getComputedStyle(document.body).overflow,
	);
	expect(bodyOverflow).toBe('hidden');
};

/** Asserts the sticky bar's bottom edge is flush with `.app-shell-main`'s own
 * bottom edge once scrolled to the end — a gap here means scrolled-past form
 * content is visible beneath the bar (handoff 2b). */
const expectBarFlushWithScrollerBottom = async (page: Page) => {
	const main = page.locator('.app-shell-main');
	await main.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});

	const dims = await page.evaluate(() => {
		const mainRect = document
			.querySelector('.app-shell-main')!
			.getBoundingClientRect();
		const barRect = document
			.querySelector('[data-slot="form-action-bar"]')!
			.getBoundingClientRect();
		return { mainBottom: mainRect.bottom, barBottom: barRect.bottom };
	});
	// Sub-pixel rendering can put these a fraction of a px apart even when
	// flush; a 1px tolerance is tight enough to catch the 32px handoff-2b gap.
	expect(Math.abs(dims.barBottom - dims.mainBottom)).toBeLessThanOrEqual(1);
};

test.describe('app shell: single scroller, no gap beneath the pinned bar (handoff 2a/2b)', () => {
	test('create-tenant form: wheeling the rail does not scroll the document, and the bar sits flush at the bottom once scrolled', async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_VIEWPORT);
		await loginAsStaffAdmin(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await expectSingleScroller(page);
		await expectBarFlushWithScrollerBottom(page);
	});

	test('edit-tenant form: wheeling the rail does not scroll the document, and the bar sits flush at the bottom once scrolled', async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_VIEWPORT);
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await expectSingleScroller(page);
		await expectBarFlushWithScrollerBottom(page);
	});
});
