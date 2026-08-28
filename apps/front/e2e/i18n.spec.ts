import { expect, test } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { FRONT_URL } from './helpers/compose-env';

type BrowserContextLike = {
	context: () => {
		addCookies: (
			cookies: Array<{
				name: string;
				value: string;
				url: string;
			}>,
		) => Promise<void>;
		clearCookies: () => Promise<void>;
	};
};

const DEFAULT_BASE_URL = FRONT_URL;

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
			url: new URL('/', baseUrl).origin,
		},
	]);
};

test.describe('i18n', { tag: ['@i18n', '@713'] }, () => {
	test('renders / with locale from cookie and updates html lang', async ({
		page,
		baseURL,
	}) => {
		const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
		await setLocaleCookie(page, 'fr', resolvedBaseUrl);
		await page.goto('/');

		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		// The landing page replaced the placeholder greeting element. The hero title
		// is real translated page copy, so it proves the same thing: the cookie's
		// locale decides what is rendered.
		await expect(page.getByTestId('landing-hero-title')).toHaveText(
			'Publiez partout où vivent vos marques',
		);
	});

	test('falls back to English when locale cookie is unsupported', async ({
		page,
		baseURL,
	}) => {
		const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
		await setLocaleCookie(page, 'zz', resolvedBaseUrl);
		await page.goto('/');

		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByTestId('landing-hero-title')).toHaveText(
			'Publish everywhere your brands live',
		);
	});
});
