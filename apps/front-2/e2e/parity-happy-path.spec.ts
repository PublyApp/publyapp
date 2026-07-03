import { expect, test, type Page } from '@playwright/test';

import {
	getInviteStaffUserButton,
	loginAsStaffAdmin,
	setLocaleCookie,
} from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const AUTHED_STAFF_USERS_PATH = '/staff/users';
const STAFF_TABLE_TEST_ID = 'staff-users-table';

const EXPECTED_SEEDED_STAFF_EMAILS = [
	'staff-admin@example.com',
	'staff-user@example.com',
	'owner@publyapp.local',
] as const;

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

const tableRows = (page: Page) =>
	page
		.getByRole('row')
		.filter({ hasText: /(?:@example\.com|@publyapp\.local)/ });

const staffUserRow = (page: Page, email: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });

const searchInput = (page: Page) =>
	page.getByTestId(`${STAFF_TABLE_TEST_ID}-search`);

const getThemeState = async (page: Page) =>
	page.locator('html').evaluate((html) => ({
		hasDarkClass: html.classList.contains('dark'),
		dataTheme: html.getAttribute('data-theme'),
	}));

const extractSeededEmails = async (response: {
	json: () => Promise<unknown>;
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

const assertColumnShape = (page: Page) =>
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
		expect(page.getByRole('columnheader', { name: /^Email$/ })).toHaveCount(0),
	]);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('staff-users parity happy path', () => {
	test('login renders seeded staff rows and required columns', async ({
		page,
	}) => {
		await loginAndWaitForSeededRows(page);
		await assertColumnShape(page);
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
		await expect(staffUserRow(page, 'staff-user@example.com')).toBeVisible();
	});

	test('invite button navigates to invitations route', async ({ page }) => {
		await loginAndWaitForSeededRows(page);

		const invite = getInviteStaffUserButton(page);
		await Promise.all([
			page.waitForURL(/\/staff\/invitations\/new$/),
			invite.click(),
		]);
		await expect(page).toHaveURL(/\/staff\/invitations\/new$/);
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
		await expect(getInviteStaffUserButton(page)).toBeVisible();
	});
});
