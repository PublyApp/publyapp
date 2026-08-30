import { expect, test, type Page } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const SEEDED_STAFF_EMAIL = 'staff-user@example.com';
const OVERVIEW_ONLY_TEXT = 'Contact details';
const PLACEHOLDER_TEXT = 'This section is not built yet.';

const escapeRegExp = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const staffUserRow = (page: Page, email: string) =>
	page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });

test.describe(
	'staff user detail tabs are routes',
	{ tag: ['@staff-users', '@806'] },
	() => {
		test('tabs are deep-linkable, survive a hard reload, and follow the back button', async ({
			page,
		}) => {
			await loginAsStaffAdmin(page);

			await staffUserRow(page, SEEDED_STAFF_EMAIL).getByRole('link').click();
			await expect(page.getByTestId('staff-user-details-page')).toBeVisible();
			await expect(page.getByText(OVERVIEW_ONLY_TEXT)).toBeVisible();

			const detailPath = new URL(page.url()).pathname;
			const permissionsPath = `${detailPath}/permissions`;

			// Hard load directly into a nested tab route (this is the whole point of the change).
			await page.goto(permissionsPath);
			await expect(page.getByTestId('staff-user-details-page')).toBeVisible();
			await expect(
				page.getByRole('tab', { name: 'Permissions' }),
			).toHaveAttribute('aria-selected', 'true');
			await expect(page.getByText(PLACEHOLDER_TEXT)).toBeVisible();
			await expect(page.getByText(OVERVIEW_ONLY_TEXT)).not.toBeVisible();

			await page.getByRole('tab', { name: 'Overview' }).click();
			await expect(page).toHaveURL(
				new RegExp(`${escapeRegExp(detailPath)}/?$`),
			);
			await expect(page.getByText(OVERVIEW_ONLY_TEXT)).toBeVisible();
			await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
				'aria-selected',
				'true',
			);

			await page.goBack();
			await expect(page).toHaveURL(
				new RegExp(`${escapeRegExp(permissionsPath)}$`),
			);
			await expect(
				page.getByRole('tab', { name: 'Permissions' }),
			).toHaveAttribute('aria-selected', 'true');
			await expect(page.getByText(PLACEHOLDER_TEXT)).toBeVisible();
		});
	},
);
