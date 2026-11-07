import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, getSessionTokenFromBrowser } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #819 — the staff-role edit flow, end to end against the compose stack.
 *
 * The component suites prove the wiring against fakes; this spec proves the
 * seam the five-criteria guide cares about: a value typed into the drawer is
 * PERSISTED by a real PATCH and read back in a DIFFERENT request (a fresh
 * page load of the same detail route), plus the dirty-draft navigation guard
 * holding a real router transition until confirmed.
 *
 * Isolation: every run creates its OWN role through the API (unique name)
 * and hard-deletes it afterwards, so seeded shared roles are never
 * mutated and parallel shards cannot collide.
 */

const STAFF_ROLES_PATH = '/staff/roles';

type CreatedRole = {
	id: string;
	name: string;
	description: string;
};

/** Creates a throwaway staff role through the API, bypassing the UI so
 * the tests exercise ONLY the #819 edit surface. The role carries one
 * harmless read-only permission because the create endpoint requires at
 * least one. */
const CREATE_PAYLOAD_PERMISSION = 'staff.users.list_for_staff';

const createRoleViaApi = async (
	page: Page,
	seed: string,
): Promise<CreatedRole> => {
	const token = await getSessionTokenFromBrowser(page, 'staff');
	expect(token, 'staff session token for the API').toBeDefined();
	const response = await page.request.post(`${API_BASE_URL}/staff/roles/`, {
		headers: token ? { 'X-Session-Token': token } : undefined,
		data: {
			name: `#819 e2e edit flow ${seed}`,
			description: 'Draft description before the edit',
			permissions: [CREATE_PAYLOAD_PERMISSION],
		},
	});
	expect(response.status(), 'create throwaway role').toBe(201);
	const payload = (await response.json()) as {
		roleId?: string;
		name?: string;
		description?: string | null;
	};
	expect(payload.roleId, 'created role id').toBeTruthy();

	return {
		id: payload.roleId as string,
		name: payload.name as string,
		description: payload.description ?? '',
	};
};

const deleteRoleViaApi = async (page: Page, roleId: string) => {
	const token = await getSessionTokenFromBrowser(page, 'staff');
	if (!token) {
		return;
	}

	// Tolerate 404: a failed test may have already left nothing to clean up.
	await page.request.delete(`${API_BASE_URL}/staff/roles/${roleId}`, {
		headers: { 'X-Session-Token': token },
	});
};

const openEditDrawer = async (page: Page, roleId: string) => {
	await page.goto(`/staff/roles/${roleId}`);
	await expect(page.getByTestId('staff-role-details-page')).toBeVisible();
	await expect(page.getByTestId('staff-role-edit-details-drawer')).toHaveCount(
		0,
	);

	await page.getByTestId('staff-role-edit-button').click();
	await expect(
		page.getByTestId('staff-role-edit-details-drawer'),
	).toBeVisible();
	await expect
		.poll(() => new URL(page.url()).searchParams.get('edit'))
		.toBe('1');
};

test.describe('staff role edit flow', { tag: ['@staff-roles', '@819'] }, () => {
	let role: CreatedRole;

	test.beforeEach(async ({ page }) => {
		await loginAsStaffAdmin(page);
		role = await createRoleViaApi(
			page,
			`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		);
	});

	test.afterEach(async ({ page }) => {
		if (role?.id) {
			await deleteRoleViaApi(page, role.id);
		}
	});

	test('edits name and description; the change persists across a full reload', async ({
		page,
	}) => {
		await openEditDrawer(page, role.id);

		const patchResponse = page.waitForResponse(
			(response) =>
				response.url() === `${API_BASE_URL}/staff/roles/${role.id}` &&
				response.request().method() === 'PATCH' &&
				response.status() === 200,
		);

		await page
			.getByTestId('staff-role-edit-details-drawer')
			.getByLabel('Role name')
			.fill(`${role.name} renamed`);
		await page
			.getByTestId('staff-role-edit-details-drawer')
			.getByLabel('Description')
			.fill('Edited by the #819 e2e spec');
		await page
			.getByTestId('staff-role-edit-details-drawer')
			.getByRole('button', { name: 'Save changes' })
			.click();

		await patchResponse;

		// Success feedback, then the drawer closes and the flag leaves the URL.
		await expect(page.getByText('Role updated successfully.')).toBeVisible();
		await expect(
			page.getByTestId('staff-role-edit-details-drawer'),
		).toHaveCount(0);
		await expect
			.poll(() => new URL(page.url()).searchParams.has('edit'))
			.toBe(false);

		// The seam: a fresh document re-fetches GET /roles/{id} and shows
		// what was actually persisted, not what the cache happens to hold.
		await page.reload();
		await expect(page.getByTestId('staff-role-identity-header')).toContainText(
			`${role.name} renamed`,
		);
		await expect(page.getByTestId('staff-role-identity-header')).toContainText(
			'Edited by the #819 e2e spec',
		);
	});

	test('a dirty draft blocks leaving until confirmed, then the draft is really discarded', async ({
		page,
	}) => {
		await openEditDrawer(page, role.id);

		// Dirty the draft WITHOUT saving.
		await page
			.getByTestId('staff-role-edit-details-drawer')
			.getByLabel('Description')
			.fill('Unsaved drift that must never reach the server');

		// The drawer's modal overlay covers the back link, so drive the guard
		// through the link's own router handler with a direct DOM click (raw
		// pointer clicks die on the overlay; pushState bypasses the router).
		await page
			.locator('a.publy-back-link[href="/staff/roles"]')
			.dispatchEvent('click');

		// Blocked: the confirm dialog appears and the URL holds still.
		await expect(page.getByText('Leave without saving?')).toBeVisible();
		expect(new URL(page.url()).pathname).toBe(`/staff/roles/${role.id}`);

		await page.getByRole('button', { name: 'Leave page' }).click();
		await expect
			.poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
			.toBe(STAFF_ROLES_PATH);

		// Back on the detail route in a fresh load: the stored description is
		// still the original one — the drift never reached the server.
		await page.goto(`/staff/roles/${role.id}`);
		await expect(page.getByTestId('staff-role-identity-header')).toContainText(
			role.description,
		);
		await expect(
			page.getByTestId('staff-role-identity-header'),
		).not.toContainText('Unsaved drift');
	});

	test('leaving with an untouched form needs no confirmation', async ({
		page,
	}) => {
		await openEditDrawer(page, role.id);

		// A pristine draft must not arm the guard: the navigation out goes
		// straight through with no confirmation dialog.
		await page
			.locator('a.publy-back-link[href="/staff/roles"]')
			.dispatchEvent('click');

		await expect(page.locator('[data-slot="confirm-dialog"]')).toHaveCount(0);
		expect(new URL(page.url()).pathname).toBe(STAFF_ROLES_PATH);
	});
});
