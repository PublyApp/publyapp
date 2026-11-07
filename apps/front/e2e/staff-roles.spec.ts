import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

const STAFF_ROLES_PATH = '/staff/roles';
const TABLE = 'staff-roles-table';

type StaffRoleFixture = {
	id: string;
	name: string;
};

const isStaffRolesResponse = (url: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === STAFF_ROLES_PATH;
};

const waitForStaffRolesGetResponse = (page: Page, expectedQuery?: string) =>
	page.waitForResponse((response) => {
		if (
			!isStaffRolesResponse(response.url()) ||
			response.request().method() !== 'GET' ||
			response.status() !== 200
		) {
			return false;
		}

		const query = new URL(response.url()).searchParams.get('q');
		return (query ?? undefined) === expectedQuery;
	});

const extractRoles = async (response: {
	json: () => Promise<{ data?: unknown }>;
}): Promise<StaffRoleFixture[]> => {
	const payload = (await response.json()) as {
		data?: unknown;
	};
	const rows = Array.isArray(payload.data) ? payload.data : [];
	const roles: StaffRoleFixture[] = [];

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
			roles.push({ id: row.id, name: row.name });
		}
	}

	return roles;
};

const roleRow = (page: Page, roleName: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(roleName)) });

const escapeRegExp = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

test.describe('staff roles route', { tag: ['@staff-roles', '@744'] }, () => {
	test('renders seeded roles and the expected column shape', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const rolesResponse = waitForStaffRolesGetResponse(page);
		await page.goto(STAFF_ROLES_PATH);
		const roles = await extractRoles(await rolesResponse);

		expect(roles.length, 'seeded staff roles from harness').toBeGreaterThan(0);

		await expect(page.getByTestId(TABLE)).toBeVisible();
		await expect(
			page.getByRole('columnheader', { name: 'Role' }),
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

		// The honest 4-column grid: role / description / members / actions.
		// `Permissions` and `Updated` are deliberately GONE (review-r3-users-auth.md
		// F1, fixed in W3-E `a709628f`): the staff-roles API returns neither
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

		for (const role of roles.slice(0, 3)) {
			await expect(roleRow(page, role.name)).toBeVisible();
		}
	});

	test('filters roles by member presence through the filter menu', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);
		await page.goto(STAFF_ROLES_PATH);
		await expect(page.getByTestId(TABLE)).toBeVisible();

		const panel = page.getByTestId('app-shell-secondary-panel');
		await expect(
			panel.getByRole('button', { name: /Roles\s+\d+/ }),
		).toBeVisible();
		// The prototype's list moved member presence from the Team panel
		// shortcuts into the generic filter menu (Types stays a panel filter).
		await page.getByRole('button', { name: /^Filters/ }).click();
		const withMembers = page.getByRole('checkbox', {
			name: 'With members',
			exact: true,
		});
		await withMembers.click();
		await expect(withMembers).toBeChecked();
		await expect
			.poll(() => new URL(page.url()).searchParams.get('members'))
			.toBe('with');
	});

	test('search filters seeded roles and clearing search restores the list', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const initialResponse = waitForStaffRolesGetResponse(page);
		await page.goto(STAFF_ROLES_PATH);
		const initialRoles = await extractRoles(await initialResponse);

		expect(
			initialRoles.length,
			'need seeded roles to exercise search parity',
		).toBeGreaterThan(0);

		const primaryRole = initialRoles[0];
		expect(primaryRole, 'seeded role to search for').toBeDefined();
		if (!primaryRole) {
			return;
		}

		const filteredResponse = waitForStaffRolesGetResponse(
			page,
			primaryRole.name,
		);
		const search = page.getByTestId(`${TABLE}-search`);
		await search.fill(primaryRole.name);
		await expect
			.poll(() => new URL(page.url()).searchParams.get('q'))
			.toBe(primaryRole.name);

		const filteredRoles = await extractRoles(await filteredResponse);
		expect(
			filteredRoles.map((role) => role.name),
			'API-filtered staff roles for the current query',
		).toContain(primaryRole.name);

		for (const role of filteredRoles) {
			await expect(roleRow(page, role.name)).toBeVisible();
		}

		// Unconditional: if server-side filtering silently no-ops and returns
		// every role, filteredRoles === initialRoles and the excluded-
		// row check below would be skipped entirely, letting a broken filter
		// pass in full (review-r1-tests.md F14). The seed guarantees at least
		// two distinct role names, so a real filter on the first role's
		// name must exclude at least one other.
		expect(
			filteredRoles.length,
			'a real filter must narrow the result set',
		).toBeLessThan(initialRoles.length);

		const excludedRole = initialRoles.find((role) => {
			return !filteredRoles.some((filtered) => filtered.id === role.id);
		});
		expect(excludedRole, 'expected at least one excluded role').toBeDefined();
		if (excludedRole) {
			await expect(roleRow(page, excludedRole.name)).toHaveCount(0);
		}

		// Clearing the search restores the unfiltered list from the still-fresh
		// query cache (30s staleTime) — instantly and WITHOUT a network request,
		// so assert on the restored rows, not on a refetch.
		await search.fill('');
		await expect
			.poll(() => new URL(page.url()).searchParams.get('q'))
			.toBeNull();

		for (const role of initialRoles.slice(0, 3)) {
			await expect(roleRow(page, role.name)).toBeVisible();
		}
	});
});

test.describe(
	'staff roles responsive',
	{ tag: ['@staff-roles', '@744'] },
	() => {
		test.use({ viewport: { width: 768, height: 800 } });

		test('the table keeps a real, horizontally scrollable body at md', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto(STAFF_ROLES_PATH);
			const rows = page.getByTestId(`${TABLE}-rows`);
			await expect(rows).toBeVisible();
			const scrollWidth = await rows.evaluate((el) => el.scrollWidth);
			expect(scrollWidth).toBeGreaterThan(0);
		});
	},
);

test.describe(
	'staff roles mobile cards',
	{ tag: ['@staff-roles', '@744'] },
	() => {
		test.use({ viewport: { width: 390, height: 800 } });

		test('replaces the table with the list cards below md', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);
			await page.goto(STAFF_ROLES_PATH);
			await expect(page.getByTestId(`${TABLE}-rows`)).toHaveCount(0);
			await expect(
				page.getByRole('link', { name: /^(Open|Ouvrir) / }).first(),
			).toBeVisible();
		});
	},
);
