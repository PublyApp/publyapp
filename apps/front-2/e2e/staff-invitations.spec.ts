import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const COUNTER_BASE_URL = 'http://127.0.0.1:8800';
const STAFF_INVITATIONS_PATH = '/staff/invitations';
const STAFF_PROFILES_PATH = '/staff/profiles';
const TABLE = 'staff-invitations-table';

const seededInvitationsPayload = {
	data: [
		{
			id: '11111111-1111-1111-1111-111111111111',
			email: 'pending-staff@example.com',
			profileName: 'Admins',
			status: 'Pending',
			expiresAt: '2026-07-10T12:00:00Z',
			acceptedAt: null,
			createdAt: '2026-07-01T09:00:00Z',
			invitedByName: 'Owner User',
		},
		{
			id: '22222222-2222-2222-2222-222222222222',
			email: 'accepted-staff@example.com',
			profileName: 'Editors',
			status: 'Accepted',
			expiresAt: '2026-07-11T12:00:00Z',
			acceptedAt: '2026-07-02T14:30:00Z',
			createdAt: '2026-07-01T11:15:00Z',
			invitedByName: 'Staff Admin',
		},
	],
	nextCursor: null,
} as const;

const profilesPayload = {
	data: [
		{
			id: '33333333-3333-3333-3333-333333333333',
			name: 'Admins',
		},
	],
	nextCursor: null,
} as const;

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const waitForStaffInvitationsGetResponse = (page: Page) =>
	page.waitForResponse(
		(response) =>
			isApiPath(response.url(), STAFF_INVITATIONS_PATH) &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);

const mockStaffInvitations = async (
	page: Page,
	payload: { data: readonly unknown[]; nextCursor: string | null },
) => {
	await page.route('**/staff/invitations**', async (route) => {
		if (
			route.request().method() !== 'GET' ||
			!isApiPath(route.request().url(), STAFF_INVITATIONS_PATH)
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(payload),
		});
	});
};

const mockStaffProfiles = async (page: Page) => {
	await page.route('**/staff/profiles**', async (route) => {
		if (
			route.request().method() !== 'GET' ||
			!isApiPath(route.request().url(), STAFF_PROFILES_PATH)
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(profilesPayload),
		});
	});
};

const resetCounter = async (page: Page) => {
	const response = await page.request.post(
		`${COUNTER_BASE_URL}/__counter/reset`,
	);
	expect(response.ok()).toBe(true);
};

const getCounter = async (page: Page, path: string): Promise<number> => {
	const response = await page.request.get(`${COUNTER_BASE_URL}/__counter`, {
		params: {
			path,
			method: 'GET',
		},
	});
	expect(response.ok()).toBe(true);

	const body = (await response.json()) as {
		count?: unknown;
	};
	return typeof body.count === 'number' ? body.count : -1;
};

test.describe('staff invitations list', () => {
	test('renders seeded invitation rows and timing columns', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffInvitations(page, seededInvitationsPayload);

		await page.goto('/staff/invitations');

		await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Invitee' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Role' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Profiles' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Invited by' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Expires' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Status' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Actions' }),
		).toBeAttached();
		await expect(page.getByText('pending-staff@example.com')).toBeVisible();
		await expect(page.getByText('accepted-staff@example.com')).toBeVisible();
		await expect(
			page.getByTestId(`${TABLE}-rows`).getByText('Pending', { exact: true }),
		).toBeVisible();
		await expect(
			page.getByTestId(`${TABLE}-rows`).getByText('Accepted', { exact: true }),
		).toBeVisible();
	});

	test('renders the empty state when no invitations are returned', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffInvitations(page, {
			data: [],
			nextCursor: null,
		});

		await page.goto('/staff/invitations');

		await expect(page.getByTestId(`${TABLE}-empty`)).toBeVisible();
		await expect(page.getByTestId(`${TABLE}-rows`)).toHaveCount(0);
	});

	test('invite users entry navigates to the create route', async ({ page }) => {
		await loginAsStaffAdmin(page);
		await mockStaffInvitations(page, seededInvitationsPayload);
		await mockStaffProfiles(page);

		await page.goto('/staff/invitations');

		await Promise.all([
			page.waitForURL(/\/staff\/invitations\/new$/),
			page.getByRole('link', { name: /invite user/i }).click(),
		]);

		await expect(
			page.getByTestId('staff-invitations-create-page'),
		).toBeVisible();
	});

	test('clean load issues exactly one GET /staff/invitations request', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await resetCounter(page);

		const response = waitForStaffInvitationsGetResponse(page);
		await page.goto('/staff/invitations');
		await response;

		expect(await getCounter(page, STAFF_INVITATIONS_PATH)).toBe(1);
	});
});
