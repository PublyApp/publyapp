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

const DEFAULT_BASE_URL = 'https://front-2.localhost:8443';

const setLocaleCookie = async (
	page: BrowserContextLike,
	locale: string,
	baseUrl: string,
): Promise<void> => {
	await page.context().clearCookies();
	await page.context().addCookies([
		{
			name: LOCALE_COOKIE_KEY,
			value: locale,
			path: '/',
			url: baseUrl,
		},
	]);
};

test('renders / with locale from cookie and updates html lang', async ({
	page,
	baseURL,
}) => {
	const resolvedBaseUrl = baseURL ?? DEFAULT_BASE_URL;
	await setLocaleCookie(page, 'fr', resolvedBaseUrl);
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	await expect(page.getByTestId('i18n-greeting')).toHaveText('Bonjour');
});

test('falls back to English when locale cookie is unsupported', async ({
	page,
	baseURL,
}) => {
	const resolvedBaseUrl = baseURL ?? DEFAULT_BASE_URL;
	await setLocaleCookie(page, 'zz', resolvedBaseUrl);
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByTestId('i18n-greeting')).toHaveText('Hello');
});
