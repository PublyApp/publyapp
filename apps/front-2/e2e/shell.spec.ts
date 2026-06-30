import { expect, type Page, test } from '@playwright/test';

import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
import { THEME_TOGGLE_TEST_ID } from '../src/components/app-shell/theme/theme-toggle';

type ColorScheme = 'dark' | 'light';

const readStoredTheme = async (page: Page): Promise<string | null> => {
	return page.evaluate((key) => {
		const rawValue = window.localStorage.getItem(key);
		if (!rawValue) {
			return null;
		}

		try {
			const parsed = JSON.parse(rawValue) as {
				state?: { colorScheme?: unknown };
				colorScheme?: unknown;
			};

			if (
				typeof parsed?.state?.colorScheme === 'string' ||
				typeof parsed?.colorScheme === 'string'
			) {
				return (parsed.state?.colorScheme ??
					parsed.colorScheme ??
					null) as string | null;
			}
		} catch {
			return rawValue;
		}

		return rawValue;
	}, COLOR_SCHEME_STORAGE_KEY);
};

const getThemeFromStorage = async (page: Page): Promise<string | null> => {
	const rawStoredTheme = await readStoredTheme(page);
	if (rawStoredTheme === 'dark' || rawStoredTheme === 'light') {
		return rawStoredTheme;
	}

	return null;
};

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
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute('data-mode', 'marketing');
	await expect(page.getByTestId(THEME_TOGGLE_TEST_ID)).toBeVisible();
});

test('theme toggle persists across page reload', async ({ page }) => {
	await page.goto('/');

	const initialTheme = await readThemeMode(page);
	const initialStorageTheme = await getThemeFromStorage(page);
	const expectedInitialTheme: ColorScheme = initialStorageTheme ?? initialTheme;

	expect(['light', 'dark']).toContain(expectedInitialTheme);

	await page.getByTestId(THEME_TOGGLE_TEST_ID).click();

	const toggledTheme = await readThemeMode(page);
	const expectedToggledTheme =
		expectedInitialTheme === 'light' ? 'dark' : 'light';

	expect(toggledTheme).toBe(expectedToggledTheme);
	expect(
		await getThemeFromStorage(page),
	).toBe(expectedToggledTheme);

	await page.reload();

	expect(await readThemeMode(page)).toBe(expectedToggledTheme);
	expect(
		await getThemeFromStorage(page),
	).toBe(expectedToggledTheme);
});
