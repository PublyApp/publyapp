import { expect, test } from '@playwright/test';

import { loginAsStaffAdmin } from './helpers/login';

const otherLocale = (locale: string | null): 'en' | 'fr' =>
	locale === 'fr' ? 'en' : 'fr';

const LOGOUT_LABEL = {
	en: 'Log out',
	fr: 'Se déconnecter',
} satisfies Record<'en' | 'fr', string>;

test.describe('locale switch', { tag: ['@i18n', '@806'] }, () => {
	test('switching locale from the user menu updates html lang and translated copy, and persists across reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const initialLocale = await page.locator('html').getAttribute('lang');
		const targetLocale = otherLocale(initialLocale);

		await page.getByTestId('app-shell-user-menu-trigger').click();
		await expect(page.getByTestId('app-shell-user-menu')).toBeVisible();
		await page.getByTestId('app-shell-user-menu-language').click();
		await page
			.getByTestId(`app-shell-user-menu-language-${targetLocale}`)
			.click();

		await expect(page.locator('html')).toHaveAttribute('lang', targetLocale, {
			timeout: 10_000,
		});

		// The menu may or may not stay open after selecting a radio item — reopen
		// it to check translated copy regardless.
		await page.keyboard.press('Escape');
		await page.getByTestId('app-shell-user-menu-trigger').click();
		await expect(page.getByTestId('app-shell-user-menu-logout')).toHaveText(
			LOGOUT_LABEL[targetLocale],
		);
		await page.keyboard.press('Escape');

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
	});

	test('switching locale in one tab flips html lang in every other tab without a reload', async ({
		page,
	}) => {
		await loginAsStaffAdmin(page);

		const otherTab = await page.context().newPage();
		await otherTab.goto('/staff/staff-users');
		await expect(otherTab.getByTestId('staff-users-table')).toBeVisible();

		const otherTabLangBefore = await otherTab
			.locator('html')
			.getAttribute('lang');
		const targetLocale = otherLocale(otherTabLangBefore);

		await page.getByTestId('app-shell-user-menu-trigger').click();
		await page.getByTestId('app-shell-user-menu-language').click();
		await page
			.getByTestId(`app-shell-user-menu-language-${targetLocale}`)
			.click();

		await expect(page.locator('html')).toHaveAttribute('lang', targetLocale, {
			timeout: 10_000,
		});

		await expect
			.poll(async () => otherTab.locator('html').getAttribute('lang'), {
				timeout: 10_000,
			})
			.toBe(targetLocale);
	});
});
