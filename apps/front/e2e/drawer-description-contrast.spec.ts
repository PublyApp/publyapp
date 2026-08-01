import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #1043 / PR #1061 browser-side contrast guard.
 *
 * The source guard in drawer-description-contrast.test.ts protects the token
 * declarations cheaply, but source parsing cannot reproduce the browser's
 * cascade. This spec opens every real DrawerDescription consumer against the
 * docker-compose stack and measures the live elements after Chromium has
 * resolved utilities, specificity, opacity, and the overlay paint stack.
 */

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const PROFILE_ID = '0197b8f0-4444-7ccc-8ccc-cccccccccccc';
const STAFF_USER_ID = '0197b8f0-5555-7ccc-8ccc-cccccccccccc';
const SMALL_TEXT_CONTRAST_FLOOR = 4.5;

type Theme = 'light' | 'dark';
type Rgba = { r: number; g: number; b: number; a: number };
type BackgroundLayer = {
	color: string;
	element: string;
};
type BrowserComputedColors = {
	backgroundLayers: BackgroundLayer[];
	foreground: string;
};
type ContrastMeasurement = {
	background: Rgba;
	foreground: Rgba;
	ratio: number;
};

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockDrawerDependencies = async (page: Page): Promise<void> => {
	// A trailing single star cannot cross a path separator. `**` is required
	// so this handler owns both the tenant resource and every real sub-path.
	await page.route('**/staff/tenants/**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() !== 'GET') {
			await route.fallback();
			return;
		}

		if (isApiPath(url, `/staff/tenants/${TENANT_ID}`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tenantId: TENANT_ID,
					name: 'Acme Corporation',
					code: 'ACME',
					status: 'Active',
					usersCount: 12,
					maxUsers: 50,
					ownersCount: 2,
					pendingInvitationsCount: 0,
					expiringSoonInvitationsCount: 0,
					profilesCount: 1,
					logoUrl: null,
					legalName: 'Acme Corporation, Inc.',
					websiteUrl: 'https://www.acme.example/',
					lastActivityAt: '2020-06-01T09:00:00Z',
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		if (isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: PROFILE_ID,
							name: 'Publishing',
							description: 'Can publish tenant content.',
							icon: null,
							tone: null,
							isDefault: false,
							userAccountCount: 0,
							permissionsCount: 0,
						},
					],
					nextCursor: null,
				}),
			});
			return;
		}

		if (isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					profile: {
						id: PROFILE_ID,
						name: 'Publishing',
						description: 'Can publish tenant content.',
						icon: null,
						tone: null,
						isDefault: false,
						userAccountCount: 0,
						createdAt: '2026-07-01T09:00:00Z',
						updatedAt: '2026-07-02T10:00:00Z',
					},
				}),
			});
			return;
		}

		if (
			isApiPath(
				url,
				`/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}/permissions`,
			)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ permissionKeys: [] }),
			});
			return;
		}

		if (
			isApiPath(url, `/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}/users`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ users: [], count: 0 }),
			});
			return;
		}

		if (isApiPath(url, `/staff/tenants/${TENANT_ID}/users`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});

	await page.route('**/staff/permissions/**', async (route) => {
		const request = route.request();
		if (
			request.method() !== 'GET' ||
			!isApiPath(request.url(), '/staff/permissions/scopes/tenant')
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({}),
		});
	});

	await page.route('**/staff/users/**', async (route) => {
		const request = route.request();
		if (request.method() !== 'GET') {
			await route.fallback();
			return;
		}

		if (isApiPath(request.url(), `/staff/users/${STAFF_USER_ID}`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					id: STAFF_USER_ID,
					email: 'alex@example.com',
					firstName: 'Alex',
					lastName: 'User',
					avatarUrl: null,
					accountLevel: 'Admin',
					status: 'Active',
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: '2026-07-02T10:00:00Z',
				}),
			});
			return;
		}

		if (isApiPath(request.url(), `/staff/users/${STAFF_USER_ID}/profiles`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					assignedProfiles: [],
					maxProfilesPerUser: 25,
				}),
			});
			return;
		}

		await route.fallback();
	});

	await page.route('**/staff/profiles**', async (route) => {
		const request = route.request();
		if (
			request.method() !== 'GET' ||
			!isApiPath(request.url(), '/staff/profiles')
		) {
			await route.fallback();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: [], nextCursor: null }),
		});
	});
};

const openProfileCreateDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(`/staff/tenants/${TENANT_ID}/profiles?new=1`);
	await expect(page.getByTestId('profile-form-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openInviteUserDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(`/staff/tenants/${TENANT_ID}/users?invite=1`);
	await expect(page.getByTestId('invite-tenant-user-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openProfileEditDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(`/staff/tenants/${TENANT_ID}/profiles?edit=${PROFILE_ID}`);
	await expect(page.getByTestId('profile-edit-details-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openChangeEmailDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(`/staff/staff-users/${STAFF_USER_ID}/edit`);
	await page.getByRole('button', { name: 'Change email' }).click();
	await expect(page.getByTestId('change-staff-user-email-dialog')).toBeVisible({
		timeout: 10_000,
	});
};

const openAssignMembersDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(
		`/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}/users?assign=1`,
	);
	await expect(page.getByTestId('assign-members-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openCookiePrefsDrawer = async (page: Page): Promise<void> => {
	await page.goto('/');
	await page.getByTestId('marketing-manage-cookies').click();
	await expect(page.getByTestId('cookie-prefs-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openProfileOverview = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(`/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}`);
	await expect(
		page.getByTestId('staff-tenant-profile-overview-content'),
	).toBeVisible({ timeout: 10_000 });
};

const openFieldValidationFixture = async (page: Page): Promise<void> => {
	await page.goto('/field-validation');
	await expect(page.getByTestId('field-validation-title')).toBeVisible();
};

const parseComputedColor = (value: string): Rgba => {
	const match =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (!match) {
		throw new Error(`Unparseable computed colour: ${value}`);
	}

	return {
		r: Number(match[1]),
		g: Number(match[2]),
		b: Number(match[3]),
		a: match[4] === undefined ? 1 : Number(match[4]),
	};
};

const alphaComposite = (over: Rgba, under: Rgba): Rgba => {
	const resultAlpha = over.a + under.a * (1 - over.a);
	if (resultAlpha === 0) {
		return { r: 0, g: 0, b: 0, a: 0 };
	}

	const compositeChannel = (
		overChannel: number,
		underChannel: number,
	): number =>
		(overChannel * over.a + underChannel * under.a * (1 - over.a)) /
		resultAlpha;

	return {
		r: compositeChannel(over.r, under.r),
		g: compositeChannel(over.g, under.g),
		b: compositeChannel(over.b, under.b),
		a: resultAlpha,
	};
};

const relativeLuminance = ({ r, g, b }: Rgba): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: Rgba, background: Rgba): number => {
	const lighter = Math.max(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);
	const darker = Math.min(
		relativeLuminance(foreground),
		relativeLuminance(background),
	);

	return (lighter + 0.05) / (darker + 0.05);
};

const readBrowserComputedColors = async (
	text: Locator,
): Promise<BrowserComputedColors> =>
	text.evaluate((element) => {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Browser canvas colour resolver is unavailable');
		}

		const toSrgb = (color: string): string => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
			return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
		};

		const computedForeground = toSrgb(getComputedStyle(element).color);
		const rect = element.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const hitStack = document.elementsFromPoint(x, y);
		const targetIndex = hitStack.indexOf(element);
		if (targetIndex === -1) {
			throw new Error('Description is absent from its own painted hit stack');
		}

		const backgroundLayers: BackgroundLayer[] = [];
		const seen = new Set<Element>();
		for (const layer of hitStack.slice(targetIndex)) {
			if (seen.has(layer)) {
				continue;
			}
			seen.add(layer);

			const rawColor = getComputedStyle(layer).backgroundColor;
			const color = toSrgb(rawColor);
			const channels = color.match(/[\d.]+/g);
			const alpha = color.startsWith('rgba') ? Number(channels?.[3] ?? 1) : 1;
			if (alpha === 0) {
				continue;
			}

			backgroundLayers.push({
				color,
				element:
					layer.getAttribute('data-slot') ??
					layer.getAttribute('data-testid') ??
					layer.tagName.toLowerCase(),
			});
			if (alpha === 1) {
				break;
			}
		}

		return { backgroundLayers, foreground: computedForeground };
	});

const measureContrast = async (text: Locator): Promise<ContrastMeasurement> => {
	const computed = await readBrowserComputedColors(text);
	if (computed.backgroundLayers.length === 0) {
		throw new Error('No painted background layer found behind description');
	}

	const layers = computed.backgroundLayers.map((layer) =>
		parseComputedColor(layer.color),
	);
	let background = layers[layers.length - 1];
	for (let index = layers.length - 2; index >= 0; index -= 1) {
		background = alphaComposite(layers[index], background);
	}

	const rawForeground = parseComputedColor(computed.foreground);
	const foreground =
		rawForeground.a === 1
			? rawForeground
			: alphaComposite(rawForeground, background);

	return {
		background,
		foreground,
		ratio: contrastRatio(foreground, background),
	};
};

const setTheme = async (page: Page, theme: Theme): Promise<void> => {
	await page.evaluate((nextTheme) => {
		document.documentElement.classList.toggle('dark', nextTheme === 'dark');
	}, theme);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
};

const assertTextContrast = async ({
	label,
	page,
	testInfo,
	text,
}: {
	label: string;
	page: Page;
	testInfo: TestInfo;
	text: Locator;
}): Promise<void> => {
	await expect(text).toBeVisible();
	await text.scrollIntoViewIfNeeded();

	for (const theme of ['light', 'dark'] as const) {
		await setTheme(page, theme);
		for (const state of ['default', 'hover', 'active'] as const) {
			if (state === 'hover' || state === 'active') {
				await text.hover();
			} else {
				await page.mouse.move(0, 0);
			}

			if (state === 'active') {
				await page.mouse.down();
			}

			let measurement: ContrastMeasurement;
			try {
				measurement = await measureContrast(text);
			} finally {
				if (state === 'active') {
					await page.mouse.up();
				}
			}

			const description = `${label} ${theme} ${state}: ${measurement.ratio.toFixed(2)}:1`;
			testInfo.annotations.push({ type: 'contrast', description });
			expect(measurement.ratio, description).toBeGreaterThanOrEqual(
				SMALL_TEXT_CONTRAST_FLOOR,
			);
		}
	}
};

const assertDrawerDescriptionContrast = async (
	page: Page,
	testInfo: TestInfo,
	drawerTestId: string,
): Promise<void> => {
	const drawer = page.getByTestId(drawerTestId);
	await expect(drawer).toHaveCSS('translate', 'none');
	await assertTextContrast({
		label: drawerTestId,
		page,
		testInfo,
		text: drawer.locator('[data-slot="drawer-description"]'),
	});
};

const DRAWER_CASES = [
	{
		name: 'cookie preferences',
		testId: 'cookie-prefs-drawer',
		open: openCookiePrefsDrawer,
	},
	{
		name: 'change email',
		testId: 'change-staff-user-email-dialog',
		open: openChangeEmailDrawer,
	},
	{
		name: 'invite user',
		testId: 'invite-tenant-user-drawer',
		open: openInviteUserDrawer,
	},
	{
		name: 'assign members',
		testId: 'assign-members-drawer',
		open: openAssignMembersDrawer,
	},
	{
		name: 'create profile',
		testId: 'profile-form-drawer',
		open: openProfileCreateDrawer,
	},
	{
		name: 'edit profile',
		testId: 'profile-edit-details-drawer',
		open: openProfileEditDrawer,
	},
] as const;

test.describe('live description text contrast (#1043 / PR #1061)', () => {
	for (const drawerCase of DRAWER_CASES) {
		test(`${drawerCase.name} drawer clears 4.5:1 in both themes`, async ({
			page,
		}, testInfo) => {
			await drawerCase.open(page);
			await assertDrawerDescriptionContrast(page, testInfo, drawerCase.testId);
		});
	}

	test('the real danger-zone description clears 4.5:1 in both themes', async ({
		page,
	}, testInfo) => {
		await openProfileOverview(page);
		await assertTextContrast({
			label: 'profile-danger-zone',
			page,
			testInfo,
			text: page.locator('.publy-danger-zone-row-description'),
		});
	});

	test('the real Field.Switch description clears 4.5:1 in both themes', async ({
		page,
	}, testInfo) => {
		await openFieldValidationFixture(page);
		await assertTextContrast({
			label: 'field-switch-description',
			page,
			testInfo,
			text: page.locator('.publy-field-switch-description'),
		});
	});
});
