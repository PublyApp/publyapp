import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const BASE_STAFF_PATH = '/staff/staff-users';
const TENANT_PATH = '/staff/tenants';
const TABLE_TEST_ID = 'staff-users-table';

test('asserts shell foundation dimensions and table heights', async ({
	page,
}) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(BASE_STAFF_PATH);

	const rail = page.getByTestId('app-shell-rail');
	const secondary = page.getByTestId('app-shell-secondary-panel');
	const topbar = page.getByTestId('app-shell-topbar');

	await expect(rail).toHaveCSS('width', '49px');
	await expect(secondary).toHaveCSS('width', '272px');
	await expect(topbar).toHaveCSS('height', '64px');
	await expect(topbar).toHaveCSS('border-bottom-width', '0px');

	await expect(page.getByRole('link', { name: /invite users/i })).toHaveCSS(
		'background-color',
		'rgb(253, 199, 0)',
	);

	await expect(page.getByTestId(`${TABLE_TEST_ID}-rows`)).toBeVisible();
	await expect(
		page
			.getByTestId(`${TABLE_TEST_ID}-rows`)
			.locator('[data-slot="table-sortable-column-header"]')
			.first(),
	).toHaveCSS('height', '40px');
	await expect(
		page
			.getByTestId(`${TABLE_TEST_ID}-rows`)
			.locator('[data-slot="table-cell"]')
			.first(),
	).toHaveCSS('height', '48px');
	await expect(page.getByTestId(`${TABLE_TEST_ID}-footer`)).toHaveCSS(
		'min-height',
		'48px',
	);
});

test('asserts confirm modal geometry uses handoff radius', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await page.setViewportSize({ width: 1280, height: 900 });

	await page.route('**/staff/tenants*', async (route) => {
		await route.fulfill({
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				data: [
					{
						id: 'tenant-for-handoff-modal',
						name: 'Handoff Tenant',
						status: 'Active',
						usersCount: 1,
						maxUsers: 10,
					},
				],
				nextCursor: null,
			}),
		});
	});

	await page.goto(TENANT_PATH);

	await page.getByTestId('tenant-actions-tenant-for-handoff-modal').click();
	await page.getByRole('menuitem', { name: 'Suspend' }).click();
	await expect(page.getByRole('alertdialog')).toBeVisible();
	await expect(page.getByRole('alertdialog')).toHaveCSS(
		'border-radius',
		'28px',
	);
});
