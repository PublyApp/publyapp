import { expect, test, type Page } from '@playwright/test';

import {
	collectStaffUsersRequests,
	openStaffUsersAsStaffAdmin,
	waitForStaffUsersResponse,
} from './helpers/app';

const getSearchBox = (page: Page) => {
	return page.getByRole('textbox', { name: /search/i });
};

test('staff-users table renders seeded rows and the expected column shape', async ({
	page,
}) => {
	await openStaffUsersAsStaffAdmin(page);

	const table = page.getByRole('table');
	await expect(
		table.getByRole('columnheader', { name: /name/i }),
	).toBeVisible();
	await expect(
		table.getByRole('columnheader', { name: /level/i }),
	).toBeVisible();
	await expect(
		table.getByRole('columnheader', { name: /status/i }),
	).toBeVisible();
	await expect(
		table.getByRole('columnheader', { name: /actions/i }),
	).toBeVisible();
	await expect(table.getByText('owner@publyapp.local')).toBeVisible();
	await expect(table.getByText('staff-admin@example.com')).toBeVisible();
	await expect(table.getByText('staff-user@example.com')).toBeVisible();
});

test('staff-users q URL state hydrates the search input and filters rows', async ({
	page,
}) => {
	await openStaffUsersAsStaffAdmin(page);

	const responsePromise = waitForStaffUsersResponse(page, { q: 'staff-admin' });
	await page.goto('/staff/staff-users?q=staff-admin');
	await responsePromise;

	await expect(getSearchBox(page)).toHaveValue('staff-admin');
	await expect(
		page.getByRole('table').getByText('staff-admin@example.com'),
	).toBeVisible();
	await expect(
		page.getByRole('table').getByText('staff-user@example.com'),
	).toBeHidden();
});

test('staff-users search updates the URL, filters rows, and clears back to rows', async ({
	page,
}) => {
	await openStaffUsersAsStaffAdmin(page);

	const search = getSearchBox(page);
	const searchResponse = waitForStaffUsersResponse(page, { q: 'staff-admin' });
	await search.fill('staff-admin');
	await expect(page).toHaveURL(/[?&]q=staff-admin/);
	await searchResponse;
	await expect(
		page.getByRole('table').getByText('staff-admin@example.com'),
	).toBeVisible();
	await expect(
		page.getByRole('table').getByText('staff-user@example.com'),
	).toBeHidden();

	const noMatchResponse = waitForStaffUsersResponse(page, {
		q: 'zzz-no-match-xyz',
	});
	await search.fill('zzz-no-match-xyz');
	await expect(page).toHaveURL(/[?&]q=zzz-no-match-xyz/);
	await noMatchResponse;
	await expect(page.getByText('No staff members found')).toBeVisible();

	await search.fill('');
	await expect(page).not.toHaveURL(/[?&]q=/);
	await expect(
		page.getByRole('table').getByText('staff-user@example.com'),
	).toBeVisible();
});

test('staff-users clean load performs a single list GET', async ({ page }) => {
	const requests = collectStaffUsersRequests(page);

	await openStaffUsersAsStaffAdmin(page);

	expect(requests.urls).toHaveLength(1);
	expect(requests.urls[0]?.searchParams.get('limit')).toBe('100');
	expect(requests.urls[0]?.searchParams.has('q')).toBe(false);
});

test('staff-users debounced search performs a single filtered list GET', async ({
	page,
}) => {
	await openStaffUsersAsStaffAdmin(page);

	const requests = collectStaffUsersRequests(page);
	const searchResponse = waitForStaffUsersResponse(page, { q: 'staff-admin' });
	await getSearchBox(page).fill('staff-admin');
	await searchResponse;
	await page.waitForTimeout(750);

	const filteredRequests = requests.urls.filter((url) => {
		return url.searchParams.get('q') === 'staff-admin';
	});
	expect(filteredRequests).toHaveLength(1);
});
