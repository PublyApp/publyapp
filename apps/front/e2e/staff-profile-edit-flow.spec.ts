import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, getSessionTokenFromBrowser } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #819 — the staff-profile edit flow, end to end against the compose stack.
 *
 * The component suites prove the wiring against fakes; this spec proves the
 * seam the five-criteria guide cares about: a value typed into the drawer is
 * PERSISTED by a real PATCH and read back in a DIFFERENT request (a fresh
 * page load of the same detail route), plus the dirty-draft navigation guard
 * holding a real router transition until confirmed.
 *
 * Isolation: every run creates its OWN profile through the API (unique name)
 * and hard-deletes it afterwards, so seeded shared profiles are never
 * mutated and parallel shards cannot collide.
 */

const STAFF_PROFILES_PATH = '/staff/profiles';

type CreatedProfile = {
	id: string;
	name: string;
	description: string;
};

/** Creates a throwaway staff profile through the API, bypassing the UI so
 * the tests exercise ONLY the #819 edit surface. The profile carries one
 * harmless read-only permission because the create endpoint requires at
 * least one. */
const CREATE_PAYLOAD_PERMISSION = 'staff.users.list_for_staff';

const createProfileViaApi = async (
	page: Page,
	seed: string,
): Promise<CreatedProfile> => {
	const token = await getSessionTokenFromBrowser(page, 'staff');
	expect(token, 'staff session token for the API').toBeDefined();
	const response = await page.request.post(`${API_BASE_URL}/staff/profiles/`, {
		headers: token ? { 'X-Session-Token': token } : undefined,
		data: {
			name: `#819 e2e edit flow ${seed}`,
			description: 'Draft description before the edit',
			permissions: [CREATE_PAYLOAD_PERMISSION],
		},
	});
	expect(response.status(), 'create throwaway profile').toBe(201);
	const payload = (await response.json()) as {
		profileId?: string;
		name?: string;
		description?: string | null;
	};
	expect(payload.profileId, 'created profile id').toBeTruthy();

	return {
		id: payload.profileId as string,
		name: payload.name as string,
		description: payload.description ?? '',
	};
};

const deleteProfileViaApi = async (page: Page, profileId: string) => {
	const token = await getSessionTokenFromBrowser(page, 'staff');
	if (!token) {
		return;
	}

	// Tolerate 404: a failed test may have already left nothing to clean up.
	await page.request.delete(`${API_BASE_URL}/staff/profiles/${profileId}`, {
		headers: { 'X-Session-Token': token },
	});
};

const openEditDrawer = async (page: Page, profileId: string) => {
	await page.goto(`/staff/profiles/${profileId}`);
	await expect(page.getByTestId('staff-profile-details-page')).toBeVisible();
	await expect(
		page.getByTestId('staff-profile-edit-details-drawer'),
	).toHaveCount(0);

	await page.getByTestId('staff-profile-edit-button').click();
	await expect(
		page.getByTestId('staff-profile-edit-details-drawer'),
	).toBeVisible();
	await expect
		.poll(() => new URL(page.url()).searchParams.get('edit'))
		.toBe('1');
};

test.describe(
	'staff profile edit flow',
	{ tag: ['@staff-profiles', '@819'] },
	() => {
		let profile: CreatedProfile;

		test.beforeEach(async ({ page }) => {
			await loginAsStaffAdmin(page);
			profile = await createProfileViaApi(
				page,
				`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			);
		});

		test.afterEach(async ({ page }) => {
			if (profile?.id) {
				await deleteProfileViaApi(page, profile.id);
			}
		});

		test('edits name and description; the change persists across a full reload', async ({
			page,
		}) => {
			await openEditDrawer(page, profile.id);

			const patchResponse = page.waitForResponse(
				(response) =>
					response.url() === `${API_BASE_URL}/staff/profiles/${profile.id}` &&
					response.request().method() === 'PATCH' &&
					response.status() === 200,
			);

			await page
				.getByTestId('staff-profile-edit-details-drawer')
				.getByLabel('Profile name')
				.fill(`${profile.name} renamed`);
			await page
				.getByTestId('staff-profile-edit-details-drawer')
				.getByLabel('Description')
				.fill('Edited by the #819 e2e spec');
			await page
				.getByTestId('staff-profile-edit-details-drawer')
				.getByRole('button', { name: 'Save changes' })
				.click();

			await patchResponse;

			// Success feedback, then the drawer closes and the flag leaves the URL.
			await expect(
				page.getByText('Profile updated successfully.'),
			).toBeVisible();
			await expect(
				page.getByTestId('staff-profile-edit-details-drawer'),
			).toHaveCount(0);
			await expect
				.poll(() => new URL(page.url()).searchParams.has('edit'))
				.toBe(false);

			// The seam: a fresh document re-fetches GET /profiles/{id} and shows
			// what was actually persisted, not what the cache happens to hold.
			await page.reload();
			await expect(
				page.getByTestId('staff-profile-identity-header'),
			).toContainText(`${profile.name} renamed`);
			await expect(
				page.getByTestId('staff-profile-identity-header'),
			).toContainText('Edited by the #819 e2e spec');
		});

		test('a dirty draft blocks leaving until confirmed, then the draft is really discarded', async ({
			page,
		}) => {
			await openEditDrawer(page, profile.id);

			// Dirty the draft WITHOUT saving.
			await page
				.getByTestId('staff-profile-edit-details-drawer')
				.getByLabel('Description')
				.fill('Unsaved drift that must never reach the server');

			// The drawer's modal overlay covers the back link, so drive the guard
			// through the link's own router handler with a direct DOM click (raw
			// pointer clicks die on the overlay; pushState bypasses the router).
			await page
				.locator('a.publy-back-link[href="/staff/profiles"]')
				.dispatchEvent('click');

			// Blocked: the confirm dialog appears and the URL holds still.
			await expect(page.getByText('Leave without saving?')).toBeVisible();
			expect(new URL(page.url()).pathname).toBe(
				`/staff/profiles/${profile.id}`,
			);

			await page.getByRole('button', { name: 'Leave page' }).click();
			await expect
				.poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
				.toBe(STAFF_PROFILES_PATH);

			// Back on the detail route in a fresh load: the stored description is
			// still the original one — the drift never reached the server.
			await page.goto(`/staff/profiles/${profile.id}`);
			await expect(
				page.getByTestId('staff-profile-identity-header'),
			).toContainText(profile.description);
			await expect(
				page.getByTestId('staff-profile-identity-header'),
			).not.toContainText('Unsaved drift');
		});

		test('leaving with an untouched form needs no confirmation', async ({
			page,
		}) => {
			await openEditDrawer(page, profile.id);

			// A pristine draft must not arm the guard: the navigation out goes
			// straight through with no confirmation dialog.
			await page
				.locator('a.publy-back-link[href="/staff/profiles"]')
				.dispatchEvent('click');

			await expect(page.locator('[data-slot="confirm-dialog"]')).toHaveCount(0);
			expect(new URL(page.url()).pathname).toBe(STAFF_PROFILES_PATH);
		});
	},
);
