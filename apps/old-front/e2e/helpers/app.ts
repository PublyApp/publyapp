import {
	expect,
	type Page,
	type Request,
	type Response,
} from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

export const STAFF_USERS_PATH = '/staff/users';

export const STAFF_ADMIN_CREDENTIALS = {
	email: process.env.E2E_STAFF_ADMIN_EMAIL ?? 'staff-admin@example.com',
	password: process.env.E2E_STAFF_ADMIN_PASSWORD ?? 'ChangeMe123!@3#lol',
};

type StaffUsersWaitOptions = {
	q?: string;
	withoutQ?: boolean;
	status?: number;
};

const isStaffUsersUrl = (value: string): boolean => {
	const url = new URL(value);

	return url.pathname === STAFF_USERS_PATH;
};

export const isStaffUsersRequest = (request: Request): boolean => {
	return request.method() === 'GET' && isStaffUsersUrl(request.url());
};

export const getStaffUsersUrl = (request: Request): URL => {
	return new URL(request.url());
};

export const waitForStaffUsersResponse = (
	page: Page,
	options: StaffUsersWaitOptions = {},
): Promise<Response> => {
	return page.waitForResponse((response) => {
		const request = response.request();
		if (!isStaffUsersRequest(request)) {
			return false;
		}

		if (options.status != null && response.status() !== options.status) {
			return false;
		}

		const url = getStaffUsersUrl(request);
		if (options.q != null && url.searchParams.get('q') !== options.q) {
			return false;
		}

		if (options.withoutQ && url.searchParams.has('q')) {
			return false;
		}

		return true;
	});
};

export const collectStaffUsersRequests = (page: Page) => {
	const urls: URL[] = [];

	page.on('request', (request) => {
		if (isStaffUsersRequest(request)) {
			urls.push(getStaffUsersUrl(request));
		}
	});

	return {
		urls,
		clear: () => {
			urls.length = 0;
		},
	};
};

export const fillLoginForm = async (
	page: Page,
	credentials = STAFF_ADMIN_CREDENTIALS,
): Promise<void> => {
	await expect(
		page.getByRole('textbox', { name: 'Email address' }),
	).toBeVisible();
	await page
		.getByRole('textbox', { name: 'Email address' })
		.fill(credentials.email);
	await page
		.getByRole('textbox', { name: 'Password' })
		.fill(credentials.password);
};

export const loginAsStaffAdmin = async (page: Page): Promise<void> => {
	await page.goto('/login');
	await fillLoginForm(page);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await page.waitForURL(/\/staff\/?(?:[?#].*)?$/, {
		waitUntil: 'domcontentloaded',
	});
};

export const openStaffUsersAsStaffAdmin = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
	await expect(
		page.getByRole('table').getByText(STAFF_ADMIN_CREDENTIALS.email),
	).toBeVisible({ timeout: 20_000 });
};

export const getSessionCookie = async (page: Page) => {
	const cookies = await page.context().cookies();

	return cookies.find((currentCookie) => {
		return currentCookie.name === SESSION_TOKEN_COOKIE_KEY;
	});
};

export const expectSessionCookie = async (
	page: Page,
	expected: 'present' | 'absent',
): Promise<void> => {
	const sessionCookie = await getSessionCookie(page);

	if (expected === 'present') {
		expect(sessionCookie?.value.length ?? 0).toBeGreaterThan(0);
		return;
	}

	expect(sessionCookie).toBeUndefined();
};

export const problemJson = (status: 401 | 403, detail: string): string => {
	const title = status === 401 ? 'Unauthorized' : 'Forbidden';

	return JSON.stringify({
		type: 'about:blank',
		title,
		status,
		detail,
	});
};
