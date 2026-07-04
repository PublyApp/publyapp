import { expect, test } from '@playwright/test';

import {
	expectSessionCookie,
	fillLoginForm,
	getSessionCookie,
	loginAsStaffAdmin,
	openStaffUsersAsStaffAdmin,
	problemJson,
	STAFF_ADMIN_CREDENTIALS,
	waitForStaffUsersResponse,
} from './helpers/app';

test('invalid credentials render the localized login error without a session', async ({
	page,
}) => {
	await page.goto('/login');
	await fillLoginForm(page, {
		email: 'staff-admin@example.com',
		password: 'wrong-password-123',
	});
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('alert')).toContainText(
		'Invalid email or password',
	);
	await expect(page).toHaveURL(/\/login\/?(?:[?#].*)?$/);
	await expectSessionCookie(page, 'absent');
});

test('valid staff login follows redirect-code into the staff shell', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);

	await expect(page).toHaveURL(/\/staff\/?(?:[?#].*)?$/);
	await expect(page.getByText('Active tenants (30d)')).toBeVisible();
	await expectSessionCookie(page, 'present');
});

test('auth-surface login failure does not run authenticated logout or clear an existing session', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	const sessionCookie = await getSessionCookie(page);
	expect(sessionCookie?.value.length ?? 0).toBeGreaterThan(0);
	if (!sessionCookie) {
		throw new Error('Expected a session cookie after staff login');
	}

	await page.context().clearCookies();
	await page.goto('/login');
	await fillLoginForm(page, {
		email: STAFF_ADMIN_CREDENTIALS.email,
		password: 'wrong-password-123',
	});
	await page.context().addCookies([sessionCookie]);

	let clearSessionRequests = 0;
	await page.route('**/auth/clear-session', async (route) => {
		clearSessionRequests += 1;
		await route.continue();
	});

	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/login\/?(?:[?#].*)?$/);
	await expect(page.getByRole('alert')).toContainText(
		'Invalid email or password',
	);
	await expectSessionCookie(page, 'present');
	expect(clearSessionRequests).toBe(0);
});

test('authed staff query 401 clears the session through a single logout flow', async ({
	page,
}) => {
	await openStaffUsersAsStaffAdmin(page);

	let clearSessionRequests = 0;
	await page.route('**/auth/clear-session', async (route) => {
		clearSessionRequests += 1;
		await route.continue();
	});
	await page.route('**/staff/users**', async (route) => {
		await route.fulfill({
			status: 401,
			headers: {
				'content-type': 'application/problem+json',
			},
			body: problemJson(401, 'Forced e2e invalid session'),
		});
	});

	const responsePromise = waitForStaffUsersResponse(page, { status: 401 });
	await page.goto('/staff/staff-users?q=forced-401');
	await responsePromise;

	await expect(page).toHaveURL(/\/login\/?\?rc=invalid_session$/);
	await expectSessionCookie(page, 'absent');
	expect(clearSessionRequests).toBe(1);
});

test('authed staff query 403 does not logout the user', async ({ page }) => {
	await openStaffUsersAsStaffAdmin(page);

	let clearSessionRequests = 0;
	await page.route('**/auth/clear-session', async (route) => {
		clearSessionRequests += 1;
		await route.continue();
	});
	await page.route('**/staff/users**', async (route) => {
		await route.fulfill({
			status: 403,
			headers: {
				'content-type': 'application/problem+json',
			},
			body: problemJson(403, 'Forced e2e forbidden response'),
		});
	});

	const responsePromise = waitForStaffUsersResponse(page, { status: 403 });
	await page.goto('/staff/staff-users?q=forced-403');
	await responsePromise;

	await expect(page).toHaveURL(/\/staff\/staff-users\?q=forced-403$/);
	await expect(page.getByText('Error loading staff members')).toBeVisible();
	await expectSessionCookie(page, 'present');
	expect(clearSessionRequests).toBe(0);
});
