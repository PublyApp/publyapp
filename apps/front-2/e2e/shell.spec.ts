import { expect, type Page, test } from '@playwright/test';

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

/**
 * A real, navigated-to detail path (never a hardcoded id) — a fabricated id
 * like `t-1` is not a GUID, so the real API answers 400 malformed-id and the
 * route renders the error view instead of the shell chrome under test, which
 * would make every rail-only assertion pass for the wrong reason (see F4).
 */
const getRealTenantDetailPath = async (page: Page): Promise<string> => {
	await page.goto('/staff/tenants');
	await expect(page.getByTestId('staff-tenants-table-rows')).toBeVisible();
	await page.getByTestId('staff-tenants-table-search').fill('Acme Corporation');
	const acmeLink = page.getByRole('link', { name: 'Acme Corporation' }).first();
	await expect(acmeLink).toBeVisible();
	await acmeLink.click();
	await page.waitForURL(/\/staff\/tenants\/[0-9a-f-]{36}$/);
	return new URL(page.url()).pathname;
};

const getRealStaffUserDetailPath = async (page: Page): Promise<string> => {
	await page.goto('/staff/staff-users');
	await expect(page.getByTestId('staff-users-table')).toBeVisible();
	await page
		.getByRole('row', { name: /staff-user@example\.com/ })
		.getByRole('link')
		.click();
	await page.waitForURL(/\/staff\/staff-users\/[0-9a-f-]{36}$/);
	return new URL(page.url()).pathname;
};

test('renders the front-2 shell', async ({ page }) => {
	const getHydrationConsoleErrors = trackHydrationConsoleErrors(page);

	await page.setViewportSize({ width: 390, height: 812 });
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: /welcome to publyapp/i }),
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
	await loginAsStaffAdmin(page);
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
	await loginAsStaffAdmin(page);
	await page.goto('/staff/');

	await expect(page).toHaveURL('/staff/staff-users');
});

test('renders the handoff staff rail and secondary panel', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	const rail = page.getByTestId('app-shell-rail');
	await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Tenants' })).toBeVisible();
	await expect(rail.getByRole('link', { name: 'Staff' })).toBeVisible();

	const panel = page.getByTestId('app-shell-secondary-panel');
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('heading', { name: 'Staff' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'All users' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Invitations' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Profiles' })).toBeVisible();
});

test('secondary panel follows persisted preference on detail routes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await getRealStaffUserDetailPath(page);

	// A real shell anchor — the pending skeleton never carries this testid —
	// proves the shell actually painted before asserting the panel's absence.
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
});

test('tenants route shows tenants panel destinations', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
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
	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);
});

test('rail navigation preserves collapsed sidebar preference', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Collapse navigation panel' }),
	).toBeVisible();

	await page.getByRole('button', { name: 'Collapse navigation panel' }).click();

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();

	await page.goto('/staff/invitations');

	await expect(page).toHaveURL('/staff/invitations');
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();
});

test('staff detail route follows persisted sidebar preference', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await getRealTenantDetailPath(page);

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(page.getByTestId('app-shell-sidebar-toggle')).toBeVisible();
	await expect(page.getByTestId('app-shell-sidebar-toggle')).toHaveAttribute(
		'aria-label',
		'Collapse navigation panel',
	);
});

test('detail-route toggle controls the panel on a tenant detail route', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await getRealTenantDetailPath(page);

	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	const toggle = page.getByTestId('app-shell-sidebar-toggle');
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute(
		'aria-label',
		'Collapse navigation panel',
	);

	await toggle.click();

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();
	await expect(toggle).toHaveAttribute('aria-label', 'Expand navigation panel');

	await toggle.click();

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(toggle).toHaveAttribute(
		'aria-label',
		'Collapse navigation panel',
	);
});

test('an explicit open choice carries over across detail and list routes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	const tenantDetailPath = await getRealTenantDetailPath(page);

	const toggle = page.getByTestId('app-shell-sidebar-toggle');
	await toggle.click();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();
	await expect(toggle).toHaveAttribute('aria-label', 'Expand navigation panel');
	await toggle.click();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(toggle).toHaveAttribute(
		'aria-label',
		'Collapse navigation panel',
	);

	// The explicit open choice uses the persisted sidebarOpen state and must
	// survive client-side navigation.
	// Leave via the rail to a list route — panel stays visible there through the
	// persisted list preference (default open).
	await page.locator('[data-rail-item="staff"]').click();
	await expect(page).toHaveURL(/staff-users/);
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	// Client-side history back onto the rail-only route: the explicit choice
	// still holds for this session.
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`${tenantDetailPath}$`));
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	// A fresh document load retains the persisted open preference.
	await page.reload();
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
});

test('the collapsed-panel preference persists across list and detail navigation', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await page.goto('/staff/staff-users');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	// Detail routes follow the same sidebarOpen preference as list routes.
	await getRealStaffUserDetailPath(page);
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	// Back on a list route, the panel is visible again (preference untouched).
	await page.goto('/staff/staff-users');
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();

	await page.getByRole('button', { name: 'Collapse navigation panel' }).click();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();

	// The collapsed preference carries to the next list route too.
	await page.goto('/staff/tenants');
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();

	// And detail routes on another module still follow the same preference —
	// (tenants) than the one visited above (staff-users).
	await getRealTenantDetailPath(page);
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();
});

test('staff dashboard has a toggleable secondary panel that stays collapsed across navigation', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await loginAsStaffAdmin(page);
	await page.goto('/staff/dashboard');

	await expect(page.getByTestId('app-shell-secondary-panel')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Collapse navigation panel' }),
	).toBeVisible();

	await page.getByRole('button', { name: 'Collapse navigation panel' }).click();
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();

	await page.goto('/staff/staff-users');
	await expect(page).toHaveURL('/staff/staff-users');
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();

	await page.goto('/staff/dashboard');
	await expect(page).toHaveURL('/staff/dashboard');
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toBeHidden();
});

test('detail grid sizes to the space left by the rail, not the raw viewport', async ({
	page,
}) => {
	// Below the lg breakpoint (1024px) the shell hides the secondary panel
	// entirely regardless of sidebarOpen, so at 800px only the rail consumes
	// left-chrome space before the detail grid's container query sees the
	// remaining width. That still leaves too little room for two columns —
	// the grid must stay single-column here.
	await page.setViewportSize({ width: 800, height: 900 });

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
	await expect(page.getByTestId('app-shell-rail')).toBeVisible();
	await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCount(0);

	const tracksAt800 = await grid.evaluate((element) =>
		getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
	);
	expect(tracksAt800).toHaveLength(1);

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

test('detail heading stays flush with the body grid at wide viewports', async ({
	page,
}) => {
	// Owner decision R2-4: the heading/action cluster/tab strip used to
	// render at full width while only .publy-detail-grid was capped at
	// 1440px, so on a wide monitor the heading overhung the grid on both
	// sides. Both must now share the same measure and left offset.
	await loginAsStaffAdmin(page);
	await page
		.getByRole('row', { name: /staff-user@example\.com/ })
		.getByRole('link')
		.click();

	const heading = page.getByTestId('staff-user-details-heading');
	const grid = page
		.getByTestId('staff-user-details-page')
		.locator('.publy-detail-grid')
		.first();

	for (const width of [1440, 2560]) {
		await page.setViewportSize({ width, height: 900 });
		await expect(heading).toBeVisible();
		await expect(grid).toBeVisible();

		const headingBox = await heading.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return { width: rect.width, left: rect.left };
		});
		const gridBox = await grid.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return { width: rect.width, left: rect.left };
		});

		expect(headingBox.width).toBeCloseTo(gridBox.width, 0);
		expect(headingBox.left).toBeCloseTo(gridBox.left, 0);
	}
});

test('no bottom rail on mobile and rail-hidden behavior is preserved', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 812 });
	await loginAsStaffAdmin(page);
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

	// The auth surface is a standalone split-brand layout, not the app shell
	// (no rail/topbar/mobile menu) — see docs/guides/front-2/conventions.md.
	await expect(page).toHaveURL('/login');
	await expect(page.getByTestId('auth-layout')).toBeVisible();
	await expect(page.getByTestId('app-shell-shell')).toHaveCount(0);
});
