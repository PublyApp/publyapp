import { expect, test, type Page } from '@playwright/test';

import { getInviteStaffUserButton, loginAsStaffAdmin } from './helpers/login';

const API_BASE_URL = 'https://api.front-2.localhost:8443';
const AUTHED_STAFF_USERS_PATH = '/staff/users';
const LOCALE_COOKIE_NAME = 'publyapp-locale';

const SEEDED_STAFF_EMAILS = [
	'owner@publyapp.local',
	'staff-admin@example.com',
	'staff-user@example.com',
] as const;

const searchInput = (page: Page) =>
	page.getByRole('textbox', { name: /^Search staff users$/ });

const searchButton = (page: Page) =>
	page.getByRole('button', { name: /^Search$/ });

const staffRows = (page: Page) =>
	page
		.getByRole('row')
		.filter({ hasText: /(?:@example\.com|@publyapp\.local)/ });

const staffUserRow = (page: Page, email: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });

const emailInput = (page: Page) =>
	page.getByRole('textbox', { name: /^Email$/ });

const isStaffUsersResponse = (url: string): boolean => {
	const parsed = new URL(url);
	return (
		parsed.origin === API_BASE_URL &&
		parsed.pathname === AUTHED_STAFF_USERS_PATH
	);
};

const waitForStaffUsersGetResponse = async (page: Page) => {
	await page.waitForResponse(
		(response) =>
			isStaffUsersResponse(response.url()) &&
			response.request().method() === 'GET' &&
			response.status() === 200,
	);
};

const loginAndWaitForStaffUsers = async (page: Page) => {
	const staffUsersResponse = waitForStaffUsersGetResponse(page);
	await loginAsStaffAdmin(page);
	await staffUsersResponse;
	await expect(getInviteStaffUserButton(page)).toBeVisible();
};

const assertSeededStaffRowsVisible = async (page: Page) => {
	for (const email of SEEDED_STAFF_EMAILS) {
		await expect(staffUserRow(page, email)).toBeVisible();
	}

	await expect(staffRows(page)).toHaveCount(SEEDED_STAFF_EMAILS.length);
};

const setLocaleCookie = async (page: Page, locale: 'fr') => {
	await page.context().addCookies([
		{
			name: LOCALE_COOKIE_NAME,
			value: locale,
			domain: 'front-2.localhost',
			path: '/',
			secure: true,
			sameSite: 'Lax',
		},
	]);
};

const htmlThemeState = async (page: Page) =>
	page.locator('html').evaluate((html) => ({
		hasDarkClass: html.classList.contains('dark'),
		dataTheme: html.getAttribute('data-theme'),
	}));

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('valid staff login renders the seeded staff-users list', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);

	await expect(page.getByRole('grid')).toBeVisible();
	await assertSeededStaffRowsVisible(page);
	await expect(
		page.getByRole('columnheader', { name: /^Email$/ }),
	).toBeVisible();
	await expect(
		page.getByRole('columnheader', { name: /^Name$/ }),
	).toBeVisible();
	await expect(
		page.getByRole('columnheader', { name: /^Status$/ }),
	).toBeVisible();
	await expect(
		page.getByRole('columnheader', { name: /^Level$/ }),
	).toBeVisible();
});

test('staff-users search filters and clears back to the seeded list', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);
	await assertSeededStaffRowsVisible(page);

	const filteredResponse = waitForStaffUsersGetResponse(page);
	await searchInput(page).fill('admin');
	await searchButton(page).click();
	await filteredResponse;

	await expect(staffRows(page)).toHaveCount(1);
	await expect(staffUserRow(page, 'staff-admin@example.com')).toBeVisible();
	await expect(staffUserRow(page, 'staff-user@example.com')).toHaveCount(0);
	await expect(staffUserRow(page, 'owner@publyapp.local')).toHaveCount(0);

	await searchInput(page).fill('');
	await searchButton(page).click();

	await assertSeededStaffRowsVisible(page);
});

test('invite dialog validates email through localized RHF and Zod wiring', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);

	await getInviteStaffUserButton(page).click();
	await expect(
		page.getByRole('dialog', { name: /^Invite staff user$/ }),
	).toBeVisible();

	await emailInput(page).fill('not-an-email');
	await page.getByRole('button', { name: /^Save$/ }).click();
	await expect(page.getByText(/^Invalid email$/)).toBeVisible();

	await emailInput(page).fill('new-staff-user@example.com');
	await expect(page.getByText(/^Invalid email$/)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Save$/ })).toBeEnabled();
});

test('dark-mode toggle changes the html theme and persists after reload', async ({
	page,
}) => {
	await loginAndWaitForStaffUsers(page);

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.getByRole('button', { name: /^Toggle theme$/ }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect
		.poll(() => htmlThemeState(page))
		.toMatchObject({
			hasDarkClass: true,
			dataTheme: 'dark',
		});

	const reloadResponse = waitForStaffUsersGetResponse(page);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await reloadResponse;

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect
		.poll(() => htmlThemeState(page))
		.toMatchObject({
			hasDarkClass: true,
			dataTheme: 'dark',
		});
});

test('configured French locale renders localized copy and InterZod messages', async ({
	page,
}) => {
	await setLocaleCookie(page, 'fr');
	await loginAndWaitForStaffUsers(page);

	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	await expect(page.getByTestId('locale-greeting')).toHaveText(
		'Bonjour depuis le spike',
	);

	await getInviteStaffUserButton(page).click();
	await emailInput(page).fill('not-an-email');
	await page.getByRole('button', { name: /^Save$/ }).click();
	await expect(page.getByText(/^e-mail non valide$/)).toBeVisible();
});
