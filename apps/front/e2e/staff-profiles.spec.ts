import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const STAFF_PROFILES_PATH = '/staff/profiles';
const TABLE = 'staff-profiles-table';

type StaffProfileFixture = {
	id: string;
	name: string;
};

const isStaffProfilesResponse = (url: string): boolean => {
	const parsed = new URL(url);
	return (
		parsed.origin === API_BASE_URL && parsed.pathname === STAFF_PROFILES_PATH
	);
};

const waitForStaffProfilesGetResponse = (page: Page, expectedQuery?: string) =>
	page.waitForResponse((response) => {
		if (
			!isStaffProfilesResponse(response.url()) ||
			response.request().method() !== 'GET' ||
			response.status() !== 200
		) {
			return false;
		}

		const query = new URL(response.url()).searchParams.get('q');
		return (query ?? undefined) === expectedQuery;
	});

const extractProfiles = async (response: {
	json: () => Promise<{ data?: unknown }>;
}): Promise<StaffProfileFixture[]> => {
	const payload = (await response.json()) as {
		data?: unknown;
	};
	const rows = Array.isArray(payload.data) ? payload.data : [];
	const profiles: StaffProfileFixture[] = [];

	for (const row of rows) {
		if (
			row &&
			typeof row === 'object' &&
			'id' in row &&
			'name' in row &&
			typeof row.id === 'string' &&
			row.id.length > 0 &&
			typeof row.name === 'string' &&
			row.name.length > 0
		) {
			profiles.push({ id: row.id, name: row.name });
		}
	}

	return profiles;
};

const profileRow = (page: Page, profileName: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(profileName)) });

const escapeRegExp = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

test.describe(
	'staff profiles route',
	{ tag: ['@staff-profiles', '@744'] },
	() => {
		test('renders seeded profiles and the expected column shape', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			const profilesResponse = waitForStaffProfilesGetResponse(page);
			await page.goto(STAFF_PROFILES_PATH);
			const profiles = await extractProfiles(await profilesResponse);

			expect(
				profiles.length,
				'seeded staff profiles from harness',
			).toBeGreaterThan(0);

			await expect(page.getByTestId(TABLE)).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Profile' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Type' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Members' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Description' }),
			).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Actions' }),
			).toBeAttached();

			// The honest 4-column grid: profile / description / members / actions.
			// `Permissions` and `Updated` are deliberately GONE (review-r3-users-auth.md
			// F1, fixed in W3-E `a709628f`): the staff-profiles API returns neither
			// field, so both columns rendered fabricated placeholder content — banned by
			// the owner ruling against design-mock data in shipped surfaces. They came
			// back once already (a captain micro-fix reverted the deletion), so assert
			// their absence rather than just omitting them; src/routes/authed/staff/
			// no-fabricated-placeholder.test.ts guards the same thing at the unit level.
			await expect(
				page.getByRole('columnheader', { name: 'Permissions' }),
			).toHaveCount(0);
			await expect(
				page.getByRole('columnheader', { name: 'Updated' }),
			).toHaveCount(0);

			for (const profile of profiles.slice(0, 3)) {
				await expect(profileRow(page, profile.name)).toBeVisible();
			}
		});

		test('filters profiles by member presence through the Team panel', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto(STAFF_PROFILES_PATH);
			await expect(page.getByTestId(TABLE)).toBeVisible();

			const panel = page.getByTestId('app-shell-secondary-panel');
			await expect(
				panel.getByRole('button', { name: /Profiles\s+\d+/ }),
			).toBeVisible();
			await panel.getByRole('button', { name: /With members/ }).click();
			await expect(page).toHaveURL(/[?&]members=with(?:&|$)/);
		});

		test('search filters seeded profiles and clearing search restores the list', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			const initialResponse = waitForStaffProfilesGetResponse(page);
			await page.goto(STAFF_PROFILES_PATH);
			const initialProfiles = await extractProfiles(await initialResponse);

			expect(
				initialProfiles.length,
				'need seeded profiles to exercise search parity',
			).toBeGreaterThan(0);

			const primaryProfile = initialProfiles[0];
			expect(primaryProfile, 'seeded profile to search for').toBeDefined();
			if (!primaryProfile) {
				return;
			}

			const filteredResponse = waitForStaffProfilesGetResponse(
				page,
				primaryProfile.name,
			);
			const search = page.getByTestId(`${TABLE}-search`);
			await search.fill(primaryProfile.name);
			await expect
				.poll(() => new URL(page.url()).searchParams.get('q'))
				.toBe(primaryProfile.name);

			const filteredProfiles = await extractProfiles(await filteredResponse);
			expect(
				filteredProfiles.map((profile) => profile.name),
				'API-filtered staff profiles for the current query',
			).toContain(primaryProfile.name);

			for (const profile of filteredProfiles) {
				await expect(profileRow(page, profile.name)).toBeVisible();
			}

			// Unconditional: if server-side filtering silently no-ops and returns
			// every profile, filteredProfiles === initialProfiles and the excluded-
			// row check below would be skipped entirely, letting a broken filter
			// pass in full (review-r1-tests.md F14). The seed guarantees at least
			// two distinct profile names, so a real filter on the first profile's
			// name must exclude at least one other.
			expect(
				filteredProfiles.length,
				'a real filter must narrow the result set',
			).toBeLessThan(initialProfiles.length);

			const excludedProfile = initialProfiles.find((profile) => {
				return !filteredProfiles.some((filtered) => filtered.id === profile.id);
			});
			expect(
				excludedProfile,
				'expected at least one excluded profile',
			).toBeDefined();
			if (excludedProfile) {
				await expect(profileRow(page, excludedProfile.name)).toHaveCount(0);
			}

			// Clearing the search restores the unfiltered list from the still-fresh
			// query cache (30s staleTime) — instantly and WITHOUT a network request,
			// so assert on the restored rows, not on a refetch.
			await search.fill('');
			await expect
				.poll(() => new URL(page.url()).searchParams.get('q'))
				.toBeNull();

			for (const profile of initialProfiles.slice(0, 3)) {
				await expect(profileRow(page, profile.name)).toBeVisible();
			}
		});
	},
);

test.describe(
	'staff profiles responsive',
	{ tag: ['@staff-profiles', '@744'] },
	() => {
		test.use({ viewport: { width: 768, height: 800 } });

		test('the table keeps a real, horizontally scrollable body at md', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto(STAFF_PROFILES_PATH);
			const rows = page.getByTestId(`${TABLE}-rows`);
			await expect(rows).toBeVisible();
			const scrollWidth = await rows.evaluate((el) => el.scrollWidth);
			expect(scrollWidth).toBeGreaterThan(0);
		});
	},
);

test.describe(
	'staff profiles mobile cards',
	{ tag: ['@staff-profiles', '@744'] },
	() => {
		test.use({ viewport: { width: 390, height: 800 } });

		test('replaces the table with the list cards below md', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto(STAFF_PROFILES_PATH);
			await expect(page.getByTestId(`${TABLE}-rows`)).toHaveCount(0);
			await expect(
				page.getByRole('link', { name: /^(Open|Ouvrir) / }).first(),
			).toBeVisible();
		});
	},
);
