import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';

import { FRONT_URL } from './helpers/compose-env';

const DEFAULT_BASE_URL = FRONT_URL;

type ColorScheme = 'light' | 'dark';
type ControlFixture = 'outline-input' | 'outline-textarea' | 'outline-select';
type ComputedControlStyle = {
	backgroundColor: string;
	borderColor: string;
	boxShadow: string;
};
type ControlGeometry = {
	height: number;
	width: number;
	x: number;
	y: number;
};

const CONTROL_FIXTURES: readonly ControlFixture[] = [
	'outline-input',
	'outline-textarea',
	'outline-select',
];

const seedTheme = async (
	page: Page,
	colorScheme: ColorScheme,
): Promise<void> => {
	await page.evaluate(
		({ key, colorScheme }) => {
			window.localStorage.setItem(
				key,
				JSON.stringify({
					state: { colorScheme, sidebarOpen: true },
					version: 0,
				}),
			);
		},
		{ key: COLOR_SCHEME_STORAGE_KEY, colorScheme },
	);
};

const readControlStyle = (control: Locator): Promise<ComputedControlStyle> =>
	control.evaluate((element) => {
		const style = window.getComputedStyle(element);
		return {
			backgroundColor: style.backgroundColor,
			borderColor: style.borderColor,
			boxShadow: style.boxShadow,
		};
	});

const readControlGeometry = (control: Locator): Promise<ControlGeometry> =>
	control.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new TypeError('Expected an HTML form control');
		}

		return {
			height: element.offsetHeight,
			width: element.offsetWidth,
			x: element.offsetLeft,
			y: element.offsetTop,
		};
	});

const readExpectedStyle = async (
	page: Page,
	isInvalid: boolean,
): Promise<ComputedControlStyle> =>
	readControlStyle(
		page.getByTestId(
			isInvalid ? 'outline-expected-invalid-focus' : 'outline-expected-focus',
		),
	);

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

test.describe('field validation', { tag: ['@design', '@721'] }, () => {
	test('shows French InterZod message on invalid email, clears on valid input', async ({
		page,
		baseURL,
	}) => {
		const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
		await visitFieldValidation(page, 'fr', resolvedBaseUrl);

		await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email');
		await page.getByTestId('field-validation-submit').click();

		await expect(page.getByText('adresse e-mail invalide')).toBeVisible();

		await page
			.getByRole('textbox', { name: 'Email' })
			.fill('valid@example.com');
		await page.getByTestId('field-validation-submit').click();

		await expect(page.getByText('adresse e-mail invalide')).toBeHidden();

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

		await expect(page.getByText('Invalid email address')).toBeVisible();

		await page
			.getByRole('textbox', { name: 'Email' })
			.fill('valid@example.com');
		await page.getByTestId('field-validation-submit').click();

		await expect(page.getByText('Invalid email address')).toBeHidden();
	});

	test('shared controls match the Gray UI outline treatment in light and dark themes', async ({
		page,
		baseURL,
	}) => {
		const resolvedBaseUrl = baseURL || DEFAULT_BASE_URL;
		await page.setViewportSize({ width: 1280, height: 900 });

		for (const colorScheme of ['light', 'dark'] as const) {
			await page.goto('/');
			await seedTheme(page, colorScheme);
			await visitFieldValidation(page, 'en', resolvedBaseUrl);
			await expect(page.locator('html')).toHaveAttribute(
				'data-theme',
				colorScheme,
			);
			await expect(
				page.getByTestId('form-control-outline-fixture'),
			).toBeVisible();

			for (const fixture of CONTROL_FIXTURES) {
				const control = page.getByTestId(fixture);
				const beforeFocus = await readControlGeometry(control);

				await control.focus();
				await expect(control).toBeFocused();
				const afterFocus = await readControlGeometry(control);
				expect(afterFocus).toEqual(beforeFocus);

				const expectedFocus = await readExpectedStyle(page, false);
				await expect
					.poll(() => readControlStyle(control))
					.toEqual(expectedFocus);
				await page.screenshot({
					path: `test-results/gray-ui/form-controls-${colorScheme}-${fixture}-focus.png`,
					fullPage: true,
				});

				await control.evaluate((element) => {
					element.setAttribute('aria-invalid', 'true');
				});
				await expect(control).toHaveAttribute('aria-invalid', 'true');
				await expect(control).toBeFocused();
				const invalidFocusBox = await readControlGeometry(control);
				expect(invalidFocusBox).toEqual(beforeFocus);

				const expectedInvalid = await readExpectedStyle(page, true);
				await expect
					.poll(() => readControlStyle(control))
					.toEqual(expectedInvalid);
				await page.screenshot({
					path: `test-results/gray-ui/form-controls-${colorScheme}-${fixture}-invalid-focus.png`,
					fullPage: true,
				});

				await control.evaluate((element) => {
					element.removeAttribute('aria-invalid');
				});
			}
		}
	});
});
