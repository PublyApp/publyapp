import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const STAFF_TENANTS_PATH = '/staff/tenants';
const CREATED_TENANT_ID = '0197b8f0-7777-7ddd-8ddd-111111111111';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const LOGO_FIXTURE_PATH = new URL('./fixtures/logo.png', import.meta.url)
	.pathname;
const UPLOADED_LOGO_URL = '/files/uploads/2026/07/logo.png';

const mockCreateStaffTenant = async (page: Page) => {
	let createdTenantLogoUrl: string | null = null;

	await page.route('**/staff/tenants**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() === 'POST' && isApiPath(url, STAFF_TENANTS_PATH)) {
			const body = request.postDataJSON() as Record<string, unknown>;
			if (typeof body.logoUrl === 'string') {
				createdTenantLogoUrl = body.logoUrl;
			}

			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					id: CREATED_TENANT_ID,
					name: 'Acme Corporation',
				}),
			});
			return;
		}

		if (
			request.method() === 'PATCH' &&
			isApiPath(url, `/staff/tenants/${CREATED_TENANT_ID}`)
		) {
			const body = request.postDataJSON() as Record<string, unknown>;
			if (typeof body.logoUrl === 'string') {
				createdTenantLogoUrl = body.logoUrl;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: CREATED_TENANT_ID,
					name: 'Acme Corporation',
					logoUrl: createdTenantLogoUrl,
				}),
			});
			return;
		}

		if (
			request.method() === 'GET' &&
			isApiPath(url, `/staff/tenants/${CREATED_TENANT_ID}`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: CREATED_TENANT_ID,
					name: 'Acme Corporation',
					code: 'acme-corporation',
					status: 'Active',
					usersCount: 1,
					maxUsers: 5,
					logoUrl: createdTenantLogoUrl,
					createdAt: '2026-07-11T09:00:00Z',
					updatedAt: '2026-07-11T09:00:00Z',
				}),
			});
			return;
		}

		await route.fallback();
	});
};

/** Mocks the staff image-upload endpoint (which returns a root-relative
 * `/files/...` url per BE-4) and the served-file path the front resolves it
 * to against the API origin, so the uploaded logo's `<img>` actually
 * resolves (200) instead of 404ing against the front origin. */
const mockStaffUploads = async (page: Page) => {
	await page.route('**/staff/uploads', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({
				url: UPLOADED_LOGO_URL,
				path: 'uploads/2026/07/logo.png',
				sizeBytes: 68,
				contentType: 'image/png',
			}),
		});
	});

	await page.route(`${API_BASE_URL}${UPLOADED_LOGO_URL}`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'image/png',
			path: LOGO_FIXTURE_PATH,
		});
	});
};

test.describe('staff create-tenant workspace slug and owners section', () => {
	test('renders the workspace slug field with its publyapp.com/ prefix and an owners section tagging the first row Primary', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await expect(
			page.getByRole('textbox', { name: 'Workspace slug' }),
		).toBeVisible();
		await expect(page.getByText('publyapp.com/').first()).toBeVisible();

		await expect(page.getByText('Owners').first()).toBeVisible();
		await expect(page.getByText('Primary')).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Remove owner' }),
		).toBeDisabled();
	});

	test('the Download template action and Require SSO switch (disabled) are present in the members/setup sections', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await expect(
			page.getByRole('button', { name: 'Download template' }),
		).toBeVisible();
		await expect(
			page.getByRole('switch', { name: 'Require SSO' }),
		).toBeDisabled();
	});
});

test.describe('staff create-tenant shell (rail-only) and two-pane layout', () => {
	test('the create route is rail-only and lays out the form and preview side by side on desktop', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		// Rail-only: no secondary panel on the create-tenant form route,
		// regardless of the sidebarOpen preference (route-metadata.ts
		// isCreatePath/isRailOnlyPath).
		await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

		const formNameField = page.getByRole('textbox', { name: /organization/i });
		const previewCard = page.getByTestId('staff-tenant-create-preview');
		await expect(formNameField).toBeVisible();
		await expect(previewCard).toBeVisible();

		const formBox = await formNameField.boundingBox();
		const previewBox = await previewCard.boundingBox();
		expect(formBox).not.toBeNull();
		expect(previewBox).not.toBeNull();
		// Two-pane at desktop width: the preview card sits to the right of the
		// form column, not stacked beneath it.
		expect(previewBox!.x).toBeGreaterThan(formBox!.x + formBox!.width);
	});
});

test.describe('staff create-tenant preview counts', () => {
	test('adding a manual member slot updates the live preview counts', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await expect(page.getByTestId('preview-members')).toHaveText('0');

		await page
			.getByRole('textbox', { name: /organization/i })
			.fill('Acme Corporation');
		await page.locator('input[name="owners.0.email"]').fill('owner@acme.com');

		await expect(page.getByTestId('preview-owners')).toHaveText('1');
		await expect(page.getByTestId('preview-seats')).toHaveText('1 / 5');

		await page.getByRole('button', { name: 'Add member' }).click();
		await page
			.locator('input[name="manualMembers.0.email"]')
			.fill('member@acme.com');

		await expect(page.getByTestId('preview-members')).toHaveText('1');
		await expect(page.getByTestId('preview-seats')).toHaveText('2 / 5');
	});
});

test.describe('staff create-tenant submission', () => {
	test('submits the initial admin and navigates to the new tenant detail', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: /organization/i })
			.fill('Acme Corporation');
		await page.locator('input[name="owners.0.email"]').fill('admin@acme.com');

		const createRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH),
		);

		await page.getByRole('button', { name: /^(create tenant)$/i }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /^(create tenant)$/i }).click();
		await createRequest;

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${CREATED_TENANT_ID}$`),
		);
	});
});

test.describe('staff create-tenant Organization details optional section', () => {
	test('renders between Organization and Owners, and submits its trimmed values without changing the rest of the create flow', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await expect(page.getByText('Organization details')).toBeVisible();
		await expect(
			page.getByText('Optional — add these details now or edit them later.'),
		).toBeVisible();

		await page
			.getByRole('textbox', { name: /organization/i })
			.fill('Acme Corporation');
		await page.locator('input[name="owners.0.email"]').fill('owner@acme.com');
		await page
			.getByRole('textbox', { name: 'Legal name' })
			.fill('Acme Corporation Ltd');
		await page
			.getByRole('textbox', { name: 'Website URL' })
			.fill('https://acme.com');

		const createRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH),
		);

		await page.getByRole('button', { name: /^(create tenant)$/i }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /^(create tenant)$/i }).click();
		const request = await createRequest;

		const body = request.postDataJSON() as Record<string, unknown>;
		expect(body.legalName).toBe('Acme Corporation Ltd');
		expect(body.websiteUrl).toBe('https://acme.com');

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${CREATED_TENANT_ID}$`),
		);
	});
});

test.describe('staff create-tenant submit confirmation', () => {
	test('shows a rich summary confirm dialog before submitting, and Cancel returns to the form untouched', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: /organization/i })
			.fill('Acme Corporation');
		await page.locator('input[name="owners.0.email"]').fill('admin@acme.com');

		let createRequestFired = false;
		page.on('request', (request) => {
			if (
				request.method() === 'POST' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH)
			) {
				createRequestFired = true;
			}
		});

		await page.getByRole('button', { name: /^(create tenant)$/i }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByTestId('confirm-create-tenant-summary'),
		).toContainText('Acme Corporation');
		await expect(dialog.getByTestId('confirm-create-tenant-owners')).toHaveText(
			'1',
		);
		expect(createRequestFired).toBe(false);

		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();
		expect(createRequestFired).toBe(false);
		await expect(
			page.getByRole('textbox', { name: /organization/i }),
		).toHaveValue('Acme Corporation');
	});
});

test.describe('staff create-tenant logo upload', () => {
	test('uploading a logo before submit sends it in the create body', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);
		await mockStaffUploads(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await page
			.getByRole('textbox', { name: /organization/i })
			.fill('Acme Corporation');
		await page.locator('input[name="owners.0.email"]').fill('owner@acme.com');

		const uploadRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), '/staff/uploads'),
		);
		await page.getByLabel('Logo').setInputFiles(LOGO_FIXTURE_PATH);
		await uploadRequest;

		// The uploaded url is root-relative (BE-4); the form resolves it against
		// the API origin so the <img> doesn't 404 against the front origin.
		const absoluteUploadedLogoUrl = `${API_BASE_URL}${UPLOADED_LOGO_URL}`;
		await expect(page.getByTestId('logo-upload-url')).toHaveText(
			absoluteUploadedLogoUrl,
		);
		await expect(
			page.getByTestId('staff-tenant-create-page').locator('img').first(),
		).toHaveAttribute('src', absoluteUploadedLogoUrl);

		const createRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH),
		);
		await page.getByRole('button', { name: /^(create tenant)$/i }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /^(create tenant)$/i }).click();
		const request = await createRequest;
		expect((request.postDataJSON() as Record<string, unknown>).logoUrl).toBe(
			UPLOADED_LOGO_URL,
		);

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${CREATED_TENANT_ID}$`),
		);
	});

	test('an oversized file shows an inline error and does not set the logo', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockCreateStaffTenant(page);
		await mockStaffUploads(page);

		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		await page.getByLabel('Logo').setInputFiles({
			name: 'too-big.png',
			mimeType: 'image/png',
			buffer: Buffer.alloc(2_000_001),
		});

		await expect(page.getByText('Image must be 2 MB or smaller')).toBeVisible();
		await expect(page.getByTestId('logo-upload-url')).toHaveCount(0);
	});
});
