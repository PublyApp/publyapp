import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import {
	getInviteStaffUserButton,
	loginAsStaffAdmin,
	setLocaleCookie,
} from './helpers/login';

const AUTHED_STAFF_USERS_PATH = '/staff/users';
const STAFF_INVITATIONS_NEW_PATH = '/staff/invitations/new';
const STAFF_INVITATIONS_BULK_PATH = '/staff/invitations/bulk';
const STAFF_PROFILES_PATH = '/staff/profiles';
const STAFF_TABLE_TEST_ID = 'staff-users-table';
const STAFF_INVITATIONS_CREATE_TEST_ID = 'staff-invitations-create-page';

const EXPECTED_SEEDED_STAFF_EMAILS = [
	'staff-admin@example.com',
	'staff-user@example.com',
	'owner@publyapp.local',
] as const;

type StaffProfileFixture = {
	id: string;
	name: string;
};

const isStaffUsersResponse = (url: string): boolean => {
	const parsed = new URL(url);
	return (
		parsed.origin === API_BASE_URL &&
		parsed.pathname === AUTHED_STAFF_USERS_PATH
	);
};

const waitForStaffUsersGetResponse = (page: Page) =>
	page.waitForResponse(
		(response) =>
			isStaffUsersResponse(response.url()) &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);

const waitForStaffProfilesGetResponse = (page: Page) =>
	page.waitForResponse(
		(response) =>
			new URL(response.url()).origin === API_BASE_URL &&
			new URL(response.url()).pathname === STAFF_PROFILES_PATH &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);

const tableRows = (page: Page) =>
	page
		.getByRole('row')
		.filter({ hasText: /(?:@example\.com|@publyapp\.local)/ });

const staffUserRow = (page: Page, email: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });

const searchInput = (page: Page) =>
	page.getByTestId(`${STAFF_TABLE_TEST_ID}-search`);

const invitationEmailInput = (page: Page) =>
	page.locator('input[name="invitations.0.email"]');

const invitationSubmitButton = (page: Page) =>
	page.getByTestId('staff-invitations-submit');

const getThemeState = async (page: Page) =>
	page.locator('html').evaluate((html) => ({
		hasDarkClass: html.classList.contains('dark'),
		dataTheme: html.getAttribute('data-theme'),
	}));

const extractSeededEmails = async (response: {
	json: () => Promise<{ data?: unknown }>;
}): Promise<string[]> => {
	const payload = (await response.json()) as {
		data?: unknown;
	};
	const rows = Array.isArray(payload.data) ? payload.data : [];
	return mapRowsEmails(rows).map((email) => email.toLowerCase());
};

const mapRowsEmails = (rows: unknown[]): string[] => {
	const emails: string[] = [];
	for (const row of rows) {
		if (row && typeof row === 'object' && 'email' in row) {
			const value = row.email;
			if (typeof value === 'string' && value.length > 0) {
				emails.push(value);
			}
		}
	}
	return emails;
};

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
			profiles.push({
				id: row.id,
				name: row.name,
			});
		}
	}

	return profiles;
};

const assertSeededRowsVisible = async (page: Page) => {
	for (const email of EXPECTED_SEEDED_STAFF_EMAILS) {
		await expect(staffUserRow(page, email)).toBeVisible();
	}

	await expect(tableRows(page)).toHaveCount(
		EXPECTED_SEEDED_STAFF_EMAILS.length,
	);
};

const loginAndWaitForSeededRows = async (page: Page) => {
	const staffUsersResponse = waitForStaffUsersGetResponse(page);
	await loginAsStaffAdmin(page);
	const response = await staffUsersResponse;
	const seededEmails = await extractSeededEmails(response);

	for (const email of EXPECTED_SEEDED_STAFF_EMAILS) {
		expect(seededEmails, 'harness seeded staff emails').toContain(email);
	}
	expect(
		seededEmails,
		'verify seeded staff count against harness for parity assertion baseline',
	).toHaveLength(EXPECTED_SEEDED_STAFF_EMAILS.length);

	await expect(page.getByTestId(STAFF_TABLE_TEST_ID)).toBeVisible();
	await expect(getInviteStaffUserButton(page)).toBeVisible();
};

const navigateToInviteUsersPage = async (
	page: Page,
): Promise<StaffProfileFixture[]> => {
	const profilesResponse = waitForStaffProfilesGetResponse(page);
	await Promise.all([
		page.waitForURL(new RegExp(`${STAFF_INVITATIONS_NEW_PATH}$`)),
		getInviteStaffUserButton(page).click(),
	]);
	const response = await profilesResponse;
	const profiles = await extractProfiles(response);

	await expect(
		page.getByTestId(STAFF_INVITATIONS_CREATE_TEST_ID),
	).toBeVisible();
	return profiles;
};

const assertColumnHeaders = (page: Page) =>
	Promise.all([
		expect(
			page.getByRole('columnheader', {
				name: /^Name$/,
			}),
		).toBeVisible(),
		expect(
			page.getByRole('columnheader', {
				name: /^Level$/,
			}),
		).toBeVisible(),
		expect(
			page.getByRole('columnheader', {
				name: /^Status$/,
			}),
		).toBeVisible(),
		expect(
			page.getByRole('columnheader', {
				name: /^Actions$/,
			}),
		).toBeVisible(),
		// Owner-approved two-column split (2026-07-09): Email is its own column
		// like the gray-ui template's /customers, superseding email-in-name-cell.
		expect(
			page.getByRole('columnheader', {
				name: /^Email$/,
			}),
		).toBeVisible(),
	]);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe(
	'staff-users parity happy path',
	{ tag: ['@staff-dashboard', '@723'] },
	() => {
		test('login renders seeded staff rows and required columns', async ({
			page,
		}) => {
			await loginAndWaitForSeededRows(page);
			await assertColumnHeaders(page);
			await assertSeededRowsVisible(page);
		});

		test('search filters and clears', async ({ page }) => {
			await loginAndWaitForSeededRows(page);
			await assertSeededRowsVisible(page);

			const search = searchInput(page);
			await search.fill('admin');
			await expect(page).toHaveURL(/[?&]q=admin/);
			await expect(staffUserRow(page, 'staff-admin@example.com')).toBeVisible();
			await expect(staffUserRow(page, 'staff-user@example.com')).toHaveCount(0);
			await expect(staffUserRow(page, 'owner@publyapp.local')).toHaveCount(0);

			await search.fill('');
			await expect(page).not.toHaveURL(/[?&]q=/);
			await assertSeededRowsVisible(page);
		});

		test('invite button navigates to invitations route', async ({ page }) => {
			await loginAndWaitForSeededRows(page);

			const invite = getInviteStaffUserButton(page);
			await Promise.all([
				page.waitForURL(new RegExp(`${STAFF_INVITATIONS_NEW_PATH}$`)),
				invite.click(),
			]);
			await expect(page).toHaveURL(
				new RegExp(`${STAFF_INVITATIONS_NEW_PATH}$`),
			);
		});

		test('invite form shows English invalid email validation', async ({
			page,
		}) => {
			await loginAndWaitForSeededRows(page);
			await navigateToInviteUsersPage(page);

			await invitationEmailInput(page).fill('invalid-email');
			await invitationSubmitButton(page).click();

			await expect(page.getByText('Invalid email address')).toBeVisible();
		});

		test('invite form shows French invalid email validation', async ({
			page,
		}) => {
			await setLocaleCookie(page, 'fr');
			await loginAndWaitForSeededRows(page);
			await navigateToInviteUsersPage(page);

			await invitationEmailInput(page).fill('invalid-email');
			await invitationSubmitButton(page).click();

			await expect(page.getByText('adresse e-mail invalide')).toBeVisible();
		});

		test('invite form requires a profile and submits with intercepted bulk create', async ({
			page,
		}) => {
			await loginAndWaitForSeededRows(page);
			const profiles = await navigateToInviteUsersPage(page);
			const firstProfile = profiles[0];

			expect(
				firstProfile,
				'seeded staff profile for invite flow',
			).toBeDefined();
			if (!firstProfile) {
				return;
			}

			let capturedBody:
				| {
						invitations?: Array<{
							email?: string;
							profileIds?: string[];
						}>;
				  }
				| undefined;
			await page.route(`**${STAFF_INVITATIONS_BULK_PATH}`, async (route) => {
				capturedBody = route.request().postDataJSON() as typeof capturedBody;
				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify({ created: 1 }),
				});
			});

			await invitationEmailInput(page).fill('new-staff@example.com');
			await invitationSubmitButton(page).click();
			await expect(
				page.getByText('At least one profile is required'),
			).toBeVisible();

			const profileCheckbox = page.getByRole('checkbox', {
				name: firstProfile.name,
			});
			await profileCheckbox.press('Space');
			await expect(profileCheckbox).toBeChecked();
			await invitationSubmitButton(page).click();

			await expect(
				page.getByText('Invitations sent successfully'),
			).toBeVisible();
			await page.waitForURL(/\/staff\/invitations$/);
			expect(capturedBody?.invitations?.[0]?.email).toBe(
				'new-staff@example.com',
			);
			expect(capturedBody?.invitations?.[0]?.profileIds).toEqual([
				firstProfile.id,
			]);
		});

		test('theme toggle persists across reload', async ({ page }) => {
			await loginAndWaitForSeededRows(page);

			const themeToggle = page.getByTestId('theme-toggle');
			await expect(themeToggle).toHaveAttribute(
				'aria-label',
				'Switch to dark mode',
			);
			await themeToggle.click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
			await expect
				.poll(() => getThemeState(page))
				.toMatchObject({ hasDarkClass: true, dataTheme: 'dark' });

			await page.reload({ waitUntil: 'domcontentloaded' });

			await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
			await expect
				.poll(() => getThemeState(page))
				.toMatchObject({ hasDarkClass: true, dataTheme: 'dark' });
		});

		test('configured locale renders French copy', async ({ page }) => {
			await setLocaleCookie(page, 'fr');
			await loginAndWaitForSeededRows(page);

			await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
			await expect(getInviteStaffUserButton(page)).toHaveText(
				'Inviter des utilisateurs',
			);
		});
	},
);
