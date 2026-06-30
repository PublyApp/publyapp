import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

type BrowserContextLike = {
	context: () => {
		addCookies: (
			cookies: Array<{
				name: string;
				value: string;
				url: string;
				path: string;
			}>,
		) => Promise<void>;
		clearCookies: () => Promise<void>;
	};
};

const BASE_URL = 'https://front-2.localhost:8443';

const setLocaleCookie = async (
	page: BrowserContextLike,
	locale: string,
): Promise<void> => {
	await page.context().clearCookies();
	await page.context().addCookies([
		{
			name: LOCALE_COOKIE_KEY,
			value: locale,
			path: '/',
			url: BASE_URL,
		},
	]);
};

test('renders / with locale from cookie and updates html lang', async ({
	page,
}) => {
	await setLocaleCookie(page, 'fr');
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('falls back to English when locale cookie is unsupported', async ({
	page,
}) => {
	await setLocaleCookie(page, 'zz');
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
