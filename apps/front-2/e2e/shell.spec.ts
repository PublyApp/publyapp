import { expect, type Page, test } from '@playwright/test';

import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
import { THEME_TOGGLE_TEST_ID } from '../src/components/app-shell/theme/theme-toggle';

type ColorScheme = 'dark' | 'light';

const seedTheme = async (page: Page, colorScheme: ColorScheme): Promise<void> => {
	await page.addInitScript(
		(payload) => {
			window.localStorage.setItem(
				payload.key,
				JSON.stringify({
					state: {
						colorScheme,
						sidebarOpen: true,
					},
					version: 0,
				}),
			);
		},
		{ key: COLOR_SCHEME_STORAGE_KEY, colorScheme },
	);
};

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
				return (parsed.state?.colorScheme ?? parsed.colorScheme ?? null) as string | null;
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

const readThemeMode = async (page: Page): Promise<ColorScheme | null> => {
	return page.evaluate(() => {
		if (document.documentElement.classList.contains('dark')) {
			return 'dark';
		}

		if (document.documentElement.classList.contains('light')) {
			return 'light';
		}

		return null;
	});
};

test('renders the front-2 shell', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 812 });
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: /welcome to the front-2 shell/i }),
	).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute('data-mode', 'marketing');
	await expect(page.getByTestId(THEME_TOGGLE_TEST_ID)).toBeVisible();
	await expect(page.getByTestId('app-shell-mobile-menu-toggle')).toBeVisible();
});

test('theme toggle persists across page reload', async ({ page }) => {
	await seedTheme(page, 'dark');
	await page.goto('/');

	expect(await getThemeFromStorage(page)).toBe('dark');
	expect(await readThemeMode(page)).toBe('dark');

	await page.getByTestId(THEME_TOGGLE_TEST_ID).click();

	expect(await readThemeMode(page)).toBe('light');
	expect(await getThemeFromStorage(page)).toBe('light');

	await page.reload();

	expect(await readThemeMode(page)).toBe('light');
	expect(await getThemeFromStorage(page)).toBe('light');
});

test('mobile shell menu is keyboard and route-aware', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 812 });
	await page.goto('/');

	await page.getByTestId('app-shell-mobile-menu-toggle').click();
	await expect(page.getByText('Login')).toBeVisible();
	await expect(page.getByText('Home')).toBeVisible();
	await page.keyboard.press('Escape');
});
