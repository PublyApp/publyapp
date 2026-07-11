import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const STAFF_TENANTS_PATH = '/staff/tenants';
const CREATED_TENANT_ID = '0197b8f0-7777-7ddd-8ddd-111111111111';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockCreateStaffTenant = async (page: Page) => {
	await page.route('**/staff/tenants**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() === 'POST' && isApiPath(url, STAFF_TENANTS_PATH)) {
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
					logoUrl: null,
					createdAt: '2026-07-11T09:00:00Z',
					updatedAt: '2026-07-11T09:00:00Z',
				}),
			});
			return;
		}

		await route.fallback();
	});
};

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
	test('adding a member slot updates the live preview counts', async ({
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
		await page
			.getByRole('textbox', { name: /email/i })
			.first()
			.fill('admin@acme.com');

		await expect(page.getByTestId('preview-admins')).toHaveText('1');
		await expect(page.getByTestId('preview-seats')).toHaveText('1 / 5');

		await page.getByRole('button', { name: /add member/i }).click();
		await page
			.getByRole('textbox', { name: /email/i })
			.nth(1)
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
		await page
			.getByRole('textbox', { name: /email/i })
			.first()
			.fill('admin@acme.com');

		const createRequest = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				isApiPath(request.url(), STAFF_TENANTS_PATH),
		);

		await page.getByRole('button', { name: /^(create tenant)$/i }).click();
		await createRequest;

		await expect(page).toHaveURL(
			new RegExp(`/staff/tenants/${CREATED_TENANT_ID}$`),
		);
	});
});
