import { expect, type Page, test } from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { formatSessionCookie } from '@org/shared-ts/lib/session/parse';

import { THEME_TOGGLE_TEST_ID } from '../src/components/app-shell/theme/theme-toggle';
import { COLOR_SCHEME_STORAGE_KEY } from '../src/lib/store/ui-store';
import { loginAsStaffAdmin } from './helpers/login';

type ColorScheme = 'dark' | 'light';

const HYDRATION_ERROR_TEXT = ['hydration', 'did not match', 'server rendered'];

const trackHydrationConsoleErrors = (page: Page): (() => string[]) => {
	const errors: string[] = [];

	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}

		const text = message.text();
		for (const pattern of HYDRATION_ERROR_TEXT) {
			if (text.toLowerCase().includes(pattern)) {
				errors.push(text);
				return;
			}
		}
	});

	return () => errors;
};

const seedTheme = async (
	page: Page,
	colorScheme: ColorScheme,
): Promise<void> => {
	await page.evaluate(
		(payload) => {
			const { key, colorScheme } = payload;

			window.localStorage.setItem(
				key,
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
				return (parsed.state?.colorScheme ?? parsed.colorScheme ?? null) as
					| string
					| null;
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

const STAFF_TOKEN_VALUE = formatSessionCookie({
	staffToken: 'front2-demo-staff-token',
});

const setSessionCookie = async (page: Page) => {
	await page.goto('/');
	await page.evaluate(
		({ cookieName, value }) => {
			document.cookie = `${cookieName}=${value}; path=/`;
		},
		{ cookieName: SESSION_TOKEN_COOKIE_KEY, value: STAFF_TOKEN_VALUE },
	);
};

const mockAuthRedirectCode = async (page: Page) => {
	// design-system-ignore: no-single-star-route-glob — pre-existing collection-only mock; not yet audited for sub-path escapes (see BACKLOG: e2e glob audit)
	await page.route('**/auth/redirect-code*', async (route) => {
		await route.fulfill({
			body: JSON.stringify({ redirectCode: 'staff' }),
			headers: {
				'content-type': 'application/json',
			},
			status: 200,
		});
	});
};

const readThemeMode = async (page: Page): Promise<ColorScheme | null> => {
	return page.evaluate(() => {
		if (document.documentElement.classList.contains('dark')) {
			return 'dark';
		}

		if (document.documentElement.dataset.theme === 'light') {
			return 'light';
		}

		return null;
	});
};

const expectThemeMode = async (
	page: Page,
	colorScheme: ColorScheme,
): Promise<void> => {
	await expect.poll(() => readThemeMode(page)).toBe(colorScheme);
};

test('renders the front-2 shell', async ({ page }) => {
	const getHydrationConsoleErrors = trackHydrationConsoleErrors(page);

	await page.setViewportSize({ width: 390, height: 812 });
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: /welcome to the front-2 shell/i }),
	).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute(
		'data-mode',
		'marketing',
	);
	await expect(page.getByTestId(THEME_TOGGLE_TEST_ID)).toBeVisible();
	await expect(page.getByTestId('app-shell-mobile-menu-toggle')).toBeVisible();
	expect(getHydrationConsoleErrors()).toEqual([]);
});

test('theme toggle persists across page reload', async ({ page }) => {
	await page.goto('/');
	await seedTheme(page, 'dark');
	await page.reload();

	expect(await getThemeFromStorage(page)).toBe('dark');
	await expectThemeMode(page, 'dark');

	await page.getByTestId(THEME_TOGGLE_TEST_ID).click();

	await expectThemeMode(page, 'light');
	expect(await getThemeFromStorage(page)).toBe('light');

	await page.reload();

	await expectThemeMode(page, 'light');
	expect(await getThemeFromStorage(page)).toBe('light');
});

test('renders the authed shell for /staff', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff');

	await expect(page).toHaveURL('/staff/staff-users');
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute(
		'data-mode',
		'authed',
	);
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-topbar')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	// Handoff shell dimensions
	await expect(page.getByTestId('app-shell-rail')).toHaveCSS('width', '49px');
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCSS(
		'width',
		'272px',
	);
	await expect(page.getByTestId('app-shell-topbar')).toHaveCSS(
		'height',
		'64px',
	);
	await expect(page.getByTestId('app-shell-topbar')).toHaveCSS(
		'border-bottom-width',
		'0px',
	);

	await expect(
		page.getByTestId('app-shell-rail').getByRole('link', { name: 'Staff' }),
	).toHaveAttribute('aria-current', 'page');
});

test('redirects /staff/ to /staff/staff-users', async ({ page }) => {
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/');

	await expect(page).toHaveURL('/staff/staff-users');
});

test('renders the handoff staff rail and secondary panel', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users');

	const rail = page.getByTestId('app-shell-rail');
	await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Tenants' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Staff' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Audit logs' })).toBeVisible();

	const panel = page.getByTestId('app-shell-secondary-panel');
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('heading', { name: 'Staff' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'All users' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Invitations' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Profiles' })).toBeVisible();
});

test('secondary panel stays visible on detail routes', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users/demo-user-id');

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
});

test('tenants route shows tenants panel destinations', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/tenants');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(
		page
			.getByTestId('app-shell-secondary-panel')
			.getByRole('heading', { name: 'Tenants' }),
	).toBeVisible();
	await expect(
		page
			.getByTestId('app-shell-secondary-panel')
			.getByRole('link', { name: 'All tenants' }),
	).toBeVisible();
	await expect(
		page
			.getByTestId('app-shell-secondary-panel')
			.getByRole('link', { name: 'Active' }),
	).toBeVisible();
	await expect(
		page
			.getByTestId('app-shell-secondary-panel')
			.getByRole('link', { name: 'Suspended' }),
	).toBeVisible();
	await expect(
		page
			.getByTestId('app-shell-secondary-panel')
			.getByRole('link', { name: 'Calendar' }),
	).toHaveCount(0);
});

test('collapses secondary panel when below 1024px', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);
});

test('rail navigation preserves collapsed sidebar preference', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Collapse navigation panel' }),
	).toBeVisible();

	await page.getByRole('button', { name: 'Collapse navigation panel' }).click();

	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

	await page.goto('/staff/invitations');

	await expect(page).toHaveURL('/staff/invitations');
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);
});

test('staff detail route keeps the secondary panel visible', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/invitations/i-1');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Collapse navigation panel' }),
	).toBeVisible();
});

test('secondary panel follows the persisted preference across list and detail navigation', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	await page.goto('/staff/staff-users/demo-user-id');
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	await page.getByRole('button', { name: 'Collapse navigation panel' }).click();
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

	await page.goto('/staff/invitations/i-1');
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);
});

test('detail grid sizes to the space left by the rail and panel, not the raw viewport', async ({
	page,
}) => {
	// At 1024px with the 49px rail + 272px secondary panel open, a viewport
	// media-query split leaves .publy-detail-grid's main column ~207px wide
	// — the grid must stay single-column here instead.
	await page.setViewportSize({ width: 1024, height: 900 });

	// Reach a real seeded user by clicking through the list. A synthetic id
	// like 'demo-user-id' is not a GUID, so the API answers 400 malformed-id
	// and the route renders the error view — which has no detail grid at all.
	await loginAsStaffAdmin(page);
	await page
		.getByRole('row', { name: /staff-user@example\.com/ })
		.getByRole('link')
		.click();

	const grid = page
		.getByTestId('staff-user-details-page')
		.locator('.publy-detail-grid')
		.first();
	await expect(grid).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	const tracksAt1024 = await grid.evaluate((element) =>
		getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
	);
	expect(tracksAt1024).toHaveLength(1);

	// At 1280px there's enough room for both columns; the main column must
	// stay usable (>= 400px), not squeezed to a sliver next to a fixed
	// 420px aside.
	await page.setViewportSize({ width: 1280, height: 900 });
	const tracksAt1280 = await grid.evaluate((element) =>
		getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
	);
	expect(tracksAt1280).toHaveLength(2);

	const [mainColumnWidth, asideColumnWidth] = tracksAt1280.map((track) =>
		Number.parseFloat(track),
	);
	expect(mainColumnWidth).toBeGreaterThanOrEqual(400);
	expect(asideColumnWidth).toBeCloseTo(420, 0);
});

test('no bottom rail on mobile and rail-hidden behavior is preserved', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 812 });
	await setSessionCookie(page);
	await mockAuthRedirectCode(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-rail')).not.toBeVisible();
	await expect(page.getByTestId('app-shell-topbar')).toBeVisible();
});

test('mobile shell menu is keyboard and route-aware', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 812 });
	await page.goto('/');

	await page.getByTestId('app-shell-mobile-menu-toggle').click();
	await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('link', { name: 'Home' })).toBeHidden();

	await page.getByTestId('app-shell-mobile-menu-toggle').click();
	await page.getByRole('link', { name: 'Login' }).click();

	await expect(page).toHaveURL('/login');
	await expect(page.getByTestId('app-shell-shell')).toHaveAttribute(
		'data-mode',
		'auth',
	);
	await expect(
		page.getByTestId('app-shell-mobile-menu-toggle'),
	).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByTestId('app-shell-mobile-links')).toBeHidden();

	await page.getByRole('button', { name: 'Open navigation' }).click();
	await expect(
		page.getByRole('button', { name: 'Close navigation' }),
	).toBeVisible();
	const mobileLinks = page.getByTestId('app-shell-mobile-links');
	await expect(mobileLinks).toBeVisible();
	await expect(
		mobileLinks.getByRole('link', { name: 'Sign in' }),
	).toBeVisible();
	await expect(
		mobileLinks.getByRole('link', { name: 'Sign in' }),
	).toHaveAttribute('aria-current', 'page');
});
