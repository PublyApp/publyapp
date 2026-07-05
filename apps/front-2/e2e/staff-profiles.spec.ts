import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
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
	json: () => Promise<unknown>;
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('staff profiles route', () => {
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
			page.getByRole('columnheader', { name: 'Name' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Description' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'User accounts' }),
		).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Actions' }),
		).toBeVisible();

		for (const profile of profiles.slice(0, 3)) {
			await expect(profileRow(page, profile.name)).toBeVisible();
		}
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

		const excludedProfile = initialProfiles.find((profile) => {
			return !filteredProfiles.some((filtered) => filtered.id === profile.id);
		});
		if (excludedProfile) {
			await expect(profileRow(page, excludedProfile.name)).toHaveCount(0);
		}

		const resetResponse = waitForStaffProfilesGetResponse(page);
		await search.fill('');
		await expect
			.poll(() => new URL(page.url()).searchParams.get('q'))
			.toBeNull();
		await resetResponse;

		for (const profile of initialProfiles.slice(0, 3)) {
			await expect(profileRow(page, profile.name)).toBeVisible();
		}
	});
});
