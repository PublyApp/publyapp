import { expect, type Page, test } from '@playwright/test';

import { THEME_TOGGLE_TEST_ID } from '../src/components/app-shell/theme/theme-toggle';

const COLOR_SCHEME_KEY = 'publyapp:color-scheme';

const readThemeMode = async (page: Page): Promise<string> => {
	return page.evaluate(() => {
		if (document.documentElement.classList.contains('dark')) {
			return 'dark';
		}

		if (document.documentElement.classList.contains('light')) {
			return 'light';
		}

		return 'light';
	});
};

test('renders the front-2 shell', async ({ page }) => {
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: /welcome to the front-2 shell/i }),
	).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toBeVisible();
	await expect(page.getByTestId(THEME_TOGGLE_TEST_ID)).toBeVisible();
});

test('theme toggle persists across page reload', async ({ page }) => {
	await page.goto('/');

	const initialTheme = await readThemeMode(page);
	const initialStorageTheme = await page.evaluate((key) => {
		return window.localStorage.getItem(key);
	}, COLOR_SCHEME_KEY);
	const expectedInitialTheme =
		initialStorageTheme === 'dark' || initialStorageTheme === 'light'
			? initialStorageTheme
			: initialTheme;

	expect(['light', 'dark']).toContain(expectedInitialTheme);

	await page.getByTestId(THEME_TOGGLE_TEST_ID).click();

	const toggledTheme = await readThemeMode(page);
	const expectedToggledTheme =
		expectedInitialTheme === 'light' ? 'dark' : 'light';

	expect(toggledTheme).toBe(expectedToggledTheme);
	expect(
		await page.evaluate((key) => {
			return window.localStorage.getItem(key);
		}, COLOR_SCHEME_KEY),
	).toBe(expectedToggledTheme);

	await page.reload();

	expect(await readThemeMode(page)).toBe(expectedToggledTheme);
	expect(
		await page.evaluate((key) => {
			return window.localStorage.getItem(key);
		}, COLOR_SCHEME_KEY),
	).toBe(expectedToggledTheme);
});
