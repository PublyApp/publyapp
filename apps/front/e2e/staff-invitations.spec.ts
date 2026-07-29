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

test.describe('staff invitations list', () => {
	test('All statuses resets and closes without a persistent square checkbox', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffInvitations(page, seededInvitationsPayload);
		await page.goto('/staff/invitations?status=pending,accepted');

		const trigger = page.getByRole('button', { name: /Pending, Accepted/i });
		await trigger.click();
		const allStatuses = page.getByRole('menuitemcheckbox', {
			name: 'All statuses',
		});
		await expect(
			allStatuses.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toHaveCount(0);
		await allStatuses.click();
		await expect(page.getByRole('menu')).toBeHidden();
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
		// No `Role` column: the invitations API carries no role for an invitee, so
		// the column rendered a fabricated constant (review-r3-users-auth.md F1,
		// removed in W3-E `a709628f`). Assert its absence — it was restored once
		// already by an unrelated fix.
		await expect(page.getByRole('columnheader', { name: 'Role' })).toHaveCount(
			0,
		);
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

		const errorToasts = page.locator('[data-sonner-toast][data-type="error"]');
		await expect(
			page.getByText('Accepted invitations cannot be revoked', { exact: true }),
		).toBeVisible();
		await expect(errorToasts).toHaveCount(1);
	});

	// The request-counter test that used to live here moved to its own file
	// and dependency-ordered project — see e2e/request-counter.spec.ts and
	// review-r1-tests.md F11.
});
