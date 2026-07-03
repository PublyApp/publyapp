import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

const DEFAULT_BASE_URL = 'https://front-2.localhost:8443';

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

const visitFieldValidation = async (
	page: Page,
	locale: 'en' | 'fr',
	baseUrl: string,
): Promise<void> => {
	await setLocaleCookie(page, locale, baseUrl);
	await page.goto('/field-validation');
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('field-validation-title')).toBeVisible();
};

const runAxe = async (page: Page) => {
	const axe = new AxeBuilder({ page });
	const result = await axe.analyze();

	expect(result.violations).toEqual([]);
};

test('shows French InterZod message on invalid email, clears on valid input', async ({
	page,
	baseURL,
}) => {
	const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
	await visitFieldValidation(page, 'fr', resolvedBaseUrl);

	await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email');
	await page.getByTestId('field-validation-submit').click();

	await expect(page.getByText('e-mail non valide')).toBeVisible();

	await page.getByRole('textbox', { name: 'Email' }).fill('valid@example.com');
	await page.getByTestId('field-validation-submit').click();

	await expect(page.getByText('e-mail non valide')).toBeHidden();

	await runAxe(page);
});

test('shows English InterZod message on invalid email, clears on valid input', async ({
	page,
	baseURL,
}) => {
	const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
	await visitFieldValidation(page, 'en', resolvedBaseUrl);

	await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email');
	await page.getByTestId('field-validation-submit').click();

	await expect(page.getByText('Invalid email')).toBeVisible();

	await page.getByRole('textbox', { name: 'Email' }).fill('valid@example.com');
	await page.getByTestId('field-validation-submit').click();

	await expect(page.getByText('Invalid email')).toBeHidden();
});
