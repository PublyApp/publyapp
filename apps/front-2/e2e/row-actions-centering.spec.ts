import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

// Kiota's getGuidValue() silently drops rows with non-UUID ids, which makes
// a table look empty while the test still passes — mocks must use real UUIDs.
const TENANT_ID = '0197b8f0-6001-7aaa-8aaa-aaaaaaaaaaaa';
const PROFILE_ID = '0197b8f0-6002-7bbb-8bbb-bbbbbbbbbbbb';
const INVITATION_ID = '0197b8f0-6003-7ccc-8ccc-cccccccccccc';

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockStaffTenantsList = async (page: Page) => {
	await page.route('**/staff/tenants**', async (route) => {
		const request = route.request();
		if (
			request.method() === 'GET' &&
			isApiPath(request.url(), '/staff/tenants')
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: TENANT_ID,
							name: 'Centring Co',
							status: 'Active',
							usersCount: 1,
							maxUsers: 10,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}
		await route.fallback();
	});
};

const mockStaffProfilesList = async (page: Page) => {
	await page.route('**/staff/profiles**', async (route) => {
		const request = route.request();
		if (
			request.method() === 'GET' &&
			isApiPath(request.url(), '/staff/profiles')
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: PROFILE_ID,
							name: 'Centring Profile',
							description: null,
							userAccountCount: 0,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}
		await route.fallback();
	});
};

const mockStaffInvitationsList = async (page: Page) => {
	await page.route('**/staff/invitations**', async (route) => {
		const request = route.request();
		if (
			request.method() === 'GET' &&
			isApiPath(request.url(), '/staff/invitations')
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: INVITATION_ID,
							email: 'centring-invite@example.com',
							profileName: 'Admins',
							status: 'Pending',
							expiresAt: '2026-07-10T12:00:00Z',
							acceptedAt: null,
							createdAt: '2026-07-01T09:00:00Z',
							invitedByName: 'Owner User',
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}
		await route.fallback();
	});
};

// getBoundingClientRect() on both the trigger and its enclosing <td>, not
// toHaveCSS('justify-content'), which says nothing about the overflow case
// that produced the original bug (a 40px column with a wider content box).
const assertActionTriggerCentredInCell = async (
	page: Page,
	tableTestId: string,
) => {
	const trigger = page
		.getByTestId(`${tableTestId}-rows`)
		.getByRole('button', { name: /^Actions for/ })
		.first();
	await expect(trigger).toBeVisible();

	const result = await trigger.evaluate((el) => {
		const cell = el.closest('[data-slot="table-cell"]');
		if (!cell) {
			throw new Error('actions trigger is not inside a table-cell');
		}
		const triggerBox = el.getBoundingClientRect();
		const cellBox = cell.getBoundingClientRect();
		return {
			triggerCenterX: triggerBox.x + triggerBox.width / 2,
			cellCenterX: cellBox.x + cellBox.width / 2,
		};
	});

	expect(
		Math.abs(result.triggerCenterX - result.cellCenterX),
		`trigger centre ${result.triggerCenterX} vs cell centre ${result.cellCenterX}`,
	).toBeLessThanOrEqual(1);
};

test.describe('row action trigger centring', () => {
	test('staff-users: the ⋯ trigger is centred within its 40px column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await assertActionTriggerCentredInCell(page, 'staff-users-table');
	});

	test('tenants: the ⋯ trigger is centred within its 40px column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffTenantsList(page);
		await page.goto('/staff/tenants');
		await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
		await assertActionTriggerCentredInCell(page, 'staff-tenants-table');
	});

	test('profiles: the ⋯ trigger is centred within its 40px column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffProfilesList(page);
		await page.goto('/staff/profiles');
		await expect(page.getByTestId('staff-profiles-table-rows')).toBeVisible();
		await assertActionTriggerCentredInCell(page, 'staff-profiles-table');
	});

	test('invitations: the ⋯ trigger is centred within its 40px column', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await mockStaffInvitationsList(page);
		await page.goto('/staff/invitations');
		await expect(
			page.getByTestId('staff-invitations-table-rows'),
		).toBeVisible();
		await assertActionTriggerCentredInCell(page, 'staff-invitations-table');
	});
});

test.describe('staff-users first-column hit area', () => {
	test('the whole first cell is the row link, so hovering the avatar covers the same hit area as /staff/tenants', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await expect(page.getByTestId('staff-users-table-rows')).toBeVisible();

		const firstRow = page
			.getByTestId('staff-users-table-rows')
			.locator('[data-slot="table-row"]')
			.first();
		const avatar = firstRow.locator('.publy-avatar-initials').first();
		await expect(avatar).toBeVisible();

		const firstCellLink = firstRow
			.locator('[data-slot="table-cell"]')
			.first()
			.locator('a');
		await expect(firstCellLink).toHaveCount(1);

		await avatar.hover();

		const avatarBox = await avatar.boundingBox();
		const linkBox = await firstCellLink.boundingBox();
		expect(avatarBox).not.toBeNull();
		expect(linkBox).not.toBeNull();
		if (avatarBox && linkBox) {
			// The link must fully cover the avatar — hovering anywhere on the
			// avatar hovers the row link, matching the tenants archetype.
			expect(linkBox.x).toBeLessThanOrEqual(avatarBox.x + 0.5);
			expect(linkBox.y).toBeLessThanOrEqual(avatarBox.y + 0.5);
			expect(linkBox.x + linkBox.width).toBeGreaterThanOrEqual(
				avatarBox.x + avatarBox.width - 0.5,
			);
			expect(linkBox.y + linkBox.height).toBeGreaterThanOrEqual(
				avatarBox.y + avatarBox.height - 0.5,
			);
		}
	});
});
