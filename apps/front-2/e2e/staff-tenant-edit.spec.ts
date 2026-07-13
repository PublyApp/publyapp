import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const LOGO_FIXTURE_PATH = new URL('./fixtures/logo.png', import.meta.url)
	.pathname;
const UPLOADED_LOGO_URL = '/files/uploads/2026/07/logo.png';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
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

test.describe('staff tenant edit logo upload', () => {
	test('uploading a logo sets the preview, saves, and persists after reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);
		await mockStaffUploads(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

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
			page.getByTestId('staff-tenant-edit-preview').locator('img'),
		).toHaveAttribute('src', absoluteUploadedLogoUrl);

		const patchRequest = page.waitForRequest(
			(request) =>
				request.method() === 'PATCH' &&
				isApiPath(request.url(), `/staff/tenants/${TENANT_ID}`),
		);
		await page.getByRole('button', { name: 'Save changes' }).click();
		const request = await patchRequest;
		// The persisted value stays root-relative — the API origin is stripped
		// back off before saving, so a domain move doesn't strand stale urls.
		expect((request.postDataJSON() as Record<string, unknown>).logoUrl).toBe(
			UPLOADED_LOGO_URL,
		);

		await expect(page).toHaveURL(new RegExp(`/staff/tenants/${TENANT_ID}$`));

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();
		await expect(page.getByTestId('logo-upload-url')).toHaveText(
			absoluteUploadedLogoUrl,
		);

		const preview = page
			.getByTestId('staff-tenant-edit-preview')
			.locator('img');
		await expect(preview).toBeVisible();
		await expect(preview).toHaveAttribute('src', absoluteUploadedLogoUrl);
		expect(
			await preview.evaluate((img: HTMLImageElement) => img.naturalWidth),
		).toBeGreaterThan(0);
	});

	test('an oversized file shows an inline error and does not set the logo', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);
		await mockStaffUploads(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await page.getByLabel('Logo').setInputFiles({
			name: 'too-big.png',
			mimeType: 'image/png',
			buffer: Buffer.alloc(2_000_001),
		});

		await expect(page.getByText('Image must be 2 MB or smaller')).toBeVisible();
		await expect(page.getByTestId('logo-upload-url')).toHaveCount(0);
	});

	test('a disallowed file type shows an inline error and does not set the logo', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockTenantEdit(page);
		await mockStaffUploads(page);

		await page.goto(`/staff/tenants/${TENANT_ID}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		await page.getByLabel('Logo').setInputFiles({
			name: 'logo.svg',
			mimeType: 'image/svg+xml',
			buffer: Buffer.from('<svg></svg>'),
		});

		await expect(
			page.getByText('Image must be PNG, JPEG, WEBP, or GIF'),
		).toBeVisible();
		await expect(page.getByTestId('logo-upload-url')).toHaveCount(0);
	});
});

test.describe('staff tenant edit logo upload against the real backend', () => {
	test('an uploaded logo resolves against the API origin and loads (200) after reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		// Create a fresh tenant through the real, unmocked create flow so this
		// spec owns its own row instead of depending on a seeded tenant id.
		await page.goto('/staff/tenants/new');
		await expect(page.getByTestId('staff-tenant-create-page')).toBeVisible();

		const uniqueSuffix = Math.random().toString(36).slice(2, 10);
		await page
			.getByRole('textbox', { name: /organization/i })
			.fill(`Real Upload Tenant ${uniqueSuffix}`);
		await page
			.locator('input[name="owners.0.email"]')
			.fill(`owner-${uniqueSuffix}@acme.com`);

		await page.getByRole('button', { name: /^(create tenant)$/i }).click();
		const createDialog = page.getByRole('alertdialog');
		await expect(createDialog).toBeVisible();
		await createDialog
			.getByRole('button', { name: /^(create tenant)$/i })
			.click();

		// A UUID-shaped final segment, not a bare `[^/]+` — the latter also
		// matches the already-current `/staff/tenants/new` URL (since "new" has
		// no slash), which would resolve this wait immediately without ever
		// navigating.
		await page.waitForURL(/\/staff\/tenants\/[0-9a-f-]{36}$/);
		const tenantId = new URL(page.url()).pathname.split('/').pop();
		if (!tenantId) {
			throw new Error('expected a tenant id in the post-create redirect URL');
		}

		await page.goto(`/staff/tenants/${tenantId}/edit`);
		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();

		const uploadResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				isApiPath(response.url(), '/staff/uploads') &&
				response.status() === 201,
		);
		await page.getByLabel('Logo').setInputFiles(LOGO_FIXTURE_PATH);
		const uploadResponse = await uploadResponsePromise;
		const uploadBody = (await uploadResponse.json()) as { url: string };
		expect(uploadBody.url.startsWith('/files/')).toBe(true);

		const absoluteUploadedLogoUrl = `${API_BASE_URL}${uploadBody.url}`;
		await expect(page.getByTestId('logo-upload-url')).toHaveText(
			absoluteUploadedLogoUrl,
		);
		await expect(
			page.getByTestId('staff-tenant-edit-preview').locator('img'),
		).toHaveAttribute('src', absoluteUploadedLogoUrl);

		const patchResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' &&
				isApiPath(response.url(), `/staff/tenants/${tenantId}`) &&
				response.status() === 200,
		);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await patchResponsePromise;

		await page.waitForURL(new RegExp(`/staff/tenants/${tenantId}$`));

		// Reload into the edit form and confirm the persisted (root-relative)
		// url resolves against the real API origin and actually serves — 200
		// on a cold fetch, or a conditionally-revalidated 304 if the browser
		// still holds this exact url in its HTTP cache from the upload above.
		const filesResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'GET' &&
				response.url() === absoluteUploadedLogoUrl,
		);
		await page.goto(`/staff/tenants/${tenantId}/edit`);
		const filesResponse = await filesResponsePromise;
		expect([200, 304]).toContain(filesResponse.status());

		await expect(page.getByTestId('staff-tenant-edit-page')).toBeVisible();
		await expect(page.getByTestId('logo-upload-url')).toHaveText(
			absoluteUploadedLogoUrl,
		);

		const preview = page
			.getByTestId('staff-tenant-edit-preview')
			.locator('img');
		await expect(preview).toHaveAttribute('src', absoluteUploadedLogoUrl);
		expect(
			await preview.evaluate((img: HTMLImageElement) => img.naturalWidth),
		).toBeGreaterThan(0);
	});
});
