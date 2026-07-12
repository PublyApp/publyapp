import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const buildTenantPayload = (overrides: Record<string, unknown> = {}) => ({
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
	...overrides,
});

/** Keeps a mutable server-side copy so a PATCH followed by a GET (page
 * reload) reflects the persisted values, the way the real API would. */
const mockTenantEdit = async (page: Page) => {
	let tenant = buildTenantPayload();

	// A single '*' glob cannot cross a path separator, so '**' is required to
	// match both the tenant collection and its sub-paths.
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
				body: JSON.stringify(tenant),
			});
			return;
		}

		if (
			request.method() === 'PATCH' &&
			isApiPath(url, `/staff/tenants/${TENANT_ID}`)
		) {
			const body = request.postDataJSON() as Record<string, unknown>;
			tenant = { ...tenant, ...body };
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(tenant),
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
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});
};

test.describe('staff tenant edit form persistence', () => {
	test('filling legal name and billing email, saving, and reloading shows the persisted values', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: 'Legal name' })
			.fill('Acme Corporation Ltd');
		await page
			.getByRole('textbox', { name: 'Billing email' })
			.fill('billing@acme.com');

		const patchRequest = page.waitForRequest(
			(request) =>
				request.method() === 'PATCH' &&
				isApiPath(request.url(), `/staff/tenants/${TENANT_ID}`),
		);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await patchRequest;

		await expect(page).toHaveURL(new RegExp(`/staff/tenants/${TENANT_ID}$`));

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await expect(page.getByRole('textbox', { name: 'Legal name' })).toHaveValue(
			'Acme Corporation Ltd',
		);
		await expect(
			page.getByRole('textbox', { name: 'Billing email' }),
		).toHaveValue('billing@acme.com');
	});
});

test.describe('staff tenant edit unsaved-changes navigation guard', () => {
	test('navigating away with unsaved edits shows a confirm dialog, and Cancel keeps the edits', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: 'Legal name' })
			.fill('Acme Corporation Ltd');

		await page.getByRole('link', { name: 'Back to tenant' }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Leave without saving?');

		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).not.toBeVisible();
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Legal name' })).toHaveValue(
			'Acme Corporation Ltd',
		);
	});

	test('confirming Leave page navigates away and discards the unsaved edits', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: 'Legal name' })
			.fill('Acme Corporation Ltd');

		await page.getByRole('button', { name: 'Cancel' }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Leave page' }).click();

		await expect(page).toHaveURL(new RegExp(`/staff/tenants/${TENANT_ID}$`));
	});
});
