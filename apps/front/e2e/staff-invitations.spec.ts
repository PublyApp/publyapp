import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const STAFF_INVITATIONS_PATH = '/staff/invitations';
const STAFF_PROFILES_PATH = '/staff/profiles';
const TABLE = 'staff-invitations-table';
const PENDING_INVITATION_ID = '11111111-1111-1111-1111-111111111111';

const seededInvitationsPayload = {
	data: [
		{
			id: PENDING_INVITATION_ID,
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

test.describe(
	'staff invitations list',
	{ tag: ['@staff-invitations', '@742'] },
	() => {
		test('toggles status filters through the generic filter menu and clears them', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await mockStaffInvitations(page, seededInvitationsPayload);
			await page.goto('/staff/invitations');

			const trigger = page.getByRole('button', { name: /^Filters/ });
			await trigger.click();
			const pending = page.getByRole('checkbox', {
				name: 'Pending',
				exact: true,
			});
			const accepted = page.getByRole('checkbox', {
				name: 'Accepted',
				exact: true,
			});

			await pending.click();
			await expect(pending).toBeChecked();
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('pending');

			await accepted.click();
			await expect(accepted).toBeChecked();
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('pending,accepted');
			await expect(
				page.getByRole('button', { name: /Remove Statuses:?\s*Pending/ }),
			).toBeVisible();

			await pending.click();
			await expect
				.poll(() => new URL(page.url()).searchParams.get('status'))
				.toBe('accepted');

			await page.getByRole('button', { name: 'Clear all' }).first().click();
			await expect
				.poll(() => new URL(page.url()).searchParams.has('status'))
				.toBe(false);
		});

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
				page.getByRole('columnheader', { name: 'Status' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Profile' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Invited by' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Sent on' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Expires on' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Accepted at' }),
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
				page
					.getByTestId(`${TABLE}-rows`)
					.getByText('Accepted', { exact: true }),
			).toBeVisible();
		});

		test('shows the Team panel with a real invitations count', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await mockStaffInvitations(page, seededInvitationsPayload);
			await page.goto('/staff/invitations');

			const panel = page.getByTestId('app-shell-secondary-panel');
			await expect(
				panel.getByRole('button', { name: /Invitations\s+2/ }),
			).toBeVisible();
			await expect(
				panel.getByRole('button', { name: /Audit logs/ }),
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

		test('invite member entry navigates to the create route', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await mockStaffInvitations(page, seededInvitationsPayload);
			await mockStaffProfiles(page);

			await page.goto('/staff/invitations');

			await Promise.all([
				page.waitForURL(/\/staff\/invitations\/new$/),
				page.getByRole('link', { name: 'Invite member' }).click(),
			]);

			await expect(
				page.getByTestId('staff-invitations-create-page'),
			).toBeVisible();
		});

		test('a failed revoke shows one deterministic error toast', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await mockStaffInvitations(page, seededInvitationsPayload);
			await page.route(
				`**/staff/invitations/${PENDING_INVITATION_ID}`,
				async (route) => {
					if (route.request().method() !== 'DELETE') {
						await route.fallback();
						return;
					}

					await route.fulfill({
						status: 400,
						contentType: 'application/problem+json',
						body: JSON.stringify({
							status: 400,
							title: 'Invitation can no longer be revoked',
							detail: 'The invitation was accepted before it could be revoked.',
							translationKey: 'invitation-already-accepted',
						}),
					});
				},
			);

			await page.goto('/staff/invitations');
			await expect(page.getByTestId(`${TABLE}-rows`)).toBeVisible();

			await page
				.getByTestId(`staff-invitation-actions-${PENDING_INVITATION_ID}`)
				.click();
			await page.getByRole('menuitem', { name: 'Revoke invitation' }).click();
			await expect(
				page.getByRole('heading', { name: 'Revoke invitation' }),
			).toBeVisible();
			await page.getByRole('button', { name: 'Revoke', exact: true }).click();

			const errorToasts = page.locator(
				'[data-sonner-toast][data-type="error"]',
			);
			await expect(
				page.getByText('Accepted invitations cannot be revoked', {
					exact: true,
				}),
			).toBeVisible();
			await expect(errorToasts).toHaveCount(1);
		});
	},
);
