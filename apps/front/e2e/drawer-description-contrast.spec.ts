import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import {
	DESCRIPTION_SELECTORS,
	DRAWER_DESCRIPTION_CONSUMERS,
} from '../src/styles/drawer-description-inventory';
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
 *
 * The drawer cases are derived from the shared inventory
 * (src/styles/drawer-description-inventory.ts) — the SAME constant the source
 * guard enumerates against (round 5 I4) — so a drawer added to the app has to
 * be added to exactly one place to gain both guards.
 *
 * Round 5 B1: unlike the source guard, this spec measures every distinct
 * computed colour actually painting inside the description — the description's
 * own text AND every descendant text node's parent element (a `<strong>`, a
 * count, an emphasised fragment, a linked policy version). A colour override
 * one DOM node inward cannot hide here.
 *
 * Round 7 M7 declared limits: ancestor `opacity` and `filter` are genuinely
 * out of scope (neither is sampled), as is `text-shadow`-only text (no
 * colour to measure) and pseudo-element generated text (`::before`/`::after`
 * content is not a text node — today used only for decoration, never text).
 * A gradient/background-image drawer surface is NOT "unreachable": the
 * pattern is already live on `.publy-toast`, which paints a translucent tint
 * over a flat surface. The background sampler reads `backgroundColor` only,
 * so such a surface would be under-read silently the day a drawer adopts it.
 * There is no drawer surface doing this today — but that is "unused", not a
 * contract.
 */

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const PROFILE_ID = '0197b8f0-4444-7ccc-8ccc-cccccccccccc';
const STAFF_USER_ID = '0197b8f0-5555-7ccc-8ccc-cccccccccccc';
const GLOBAL_TENANT_USER_ID = '0197b8f0-6666-7ccc-8ccc-cccccccccccc';
const SMALL_TEXT_CONTRAST_FLOOR = 4.5;

// Round 8 M4: the linkage used to compare against BROWSER_COVERED_SELECTORS,
// a plain string[] nothing else read — adding a selector to the source list
// reddened the linkage, but the cheapest remedy was to TYPE the string into
// the second list, no measurement required. That list is gone. The selectors
// this spec measures are now live case DEFINITIONS (below, after the
// openers): each entry carries a real opener (navigates to a page) and a real
// locator (finds the element), and the tests are DRIVEN from this list.
// Satisfying the linkage for a fourth description class means writing a case
// that opens a page and measures a real element — the drawer-opener model,
// one list down.
//
// `.publy-drawer-description` is not a single case: it is covered by EVERY
// drawer case, each of which measures `[data-slot="drawer-description"]` and
// asserts (assertDrawerDescriptionContrast, live) that the slot actually
// carries the class — so that coverage is a measurement, not a comment.
const DRAWER_DESCRIPTION_SELECTOR = '.publy-drawer-description';

type DescriptionLiveCase = {
	// Round 10 M5: the case's `selector` IS the locator — the live test finds
	// the element with `page.locator(liveCase.selector)` and nothing else, so
	// a case can never claim a selector it does not measure (a fabricated
	// selector resolves to zero elements and `toBeVisible` fails).
	selector: string;
	name: string;
	open: (page: Page) => Promise<void>;
};

type Theme = 'light' | 'dark';
type Rgba = { r: number; g: number; b: number; a: number };
type BackgroundLayer = {
	color: string;
	element: string;
};
/** One distinct colour that actually paints inside the description, with the
 * element that carries it (for error messages) and its own opacity. */
type ForegroundSample = {
	color: string;
	opacity: number;
	source: string;
};
type BrowserComputedColors = {
	backgroundLayers: BackgroundLayer[];
	foregrounds: ForegroundSample[];
};
type ContrastMeasurement = {
	background: Rgba;
	foreground: Rgba;
	ratio: number;
	source: string;
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

	await page.route('**/staff/audit-logs**', async (route) => {
		const request = route.request();
		const url = request.url();

		// Origin guard, same as every sibling handler: only intercept API
		// calls to the real backend origin, never the front-origin document
		// navigation that `page.goto('/staff/audit-logs')` issues. Without
		// this the mock would fulfill the HTML page request with JSON and the
		// export trigger would never render.
		if (request.method() !== 'GET') {
			await route.fallback();
			return;
		}

		if (isApiPath(url, '/staff/audit-logs/actions')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ actions: [] }),
			});
			return;
		}

		// The list endpoint carries cursor/sort/filter query params; match
		// the bare path so the empty page response covers every variant.
		if (isApiPath(url, '/staff/audit-logs')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});

	// The link-companies drawer lives on the global tenant-user organizations
	// tab; same origin-guard pattern as every sibling handler so only real
	// API calls are intercepted, never document navigations.
	await page.route('**/staff/tenant-users/**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (request.method() !== 'GET') {
			await route.fallback();
			return;
		}

		if (isApiPath(url, `/staff/tenant-users/${GLOBAL_TENANT_USER_ID}`)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					id: GLOBAL_TENANT_USER_ID,
					email: 'member@acme.example',
					firstName: 'Ada',
					lastName: 'Lovelace',
					status: 'Active',
					avatarUrl: null,
					companyCount: 0,
					createdAt: '2026-07-01T09:00:00Z',
					updatedAt: null,
				}),
			});
			return;
		}

		if (
			isApiPath(url, `/staff/tenant-users/${GLOBAL_TENANT_USER_ID}/companies`)
		) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [],
					nextCursor: null,
					hasPreviousPage: false,
				}),
			});
			return;
		}

		if (isApiPath(url, '/staff/tenants')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: TENANT_ID,
							name: 'Acme Corporation',
							logoUrl: null,
							status: 'Active',
						},
					],
				}),
			});
			return;
		}

		await route.fallback();
	});
};

const openAuditLogExportDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto('/staff/audit-logs');
	await expect(page.getByTestId('staff-audit-logs-export-trigger')).toBeVisible(
		{
			timeout: 10_000,
		},
	);
	await page.getByTestId('staff-audit-logs-export-trigger').click();
	await expect(page.getByTestId('audit-log-export-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const openLinkCompaniesDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockDrawerDependencies(page);
	await page.goto(
		`/staff/tenant-users/details/${GLOBAL_TENANT_USER_ID}/organizations`,
	);
	await expect(page.getByTestId('link-companies-button')).toBeVisible({
		timeout: 10_000,
	});
	await page.getByTestId('link-companies-button').click();
	await expect(page.getByTestId('link-companies-drawer')).toBeVisible({
		timeout: 10_000,
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

// #819: the staff-scope profile edit drawer sits on its own detail route, so
// this opener intercepts that page's four read endpoints instead of relying
// on seeded rows. `mockDrawerDependencies` only covers `/staff/tenants/**`.
const STAFF_PROFILE_ID = '0197b8f0-7777-7ccc-8ccc-cccccccccccc';

const openStaffProfileEditDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await page.route('**/staff/profiles/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (
			request.method() !== 'GET' ||
			url.origin !== API_BASE_URL ||
			!url.pathname.startsWith('/staff/profiles/')
		) {
			await route.fallback();
			return;
		}

		const rest = url.pathname.slice('/staff/profiles/'.length);

		if (rest === `${STAFF_PROFILE_ID}/users`) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					count: 0,
					users: [],
				}),
			});
			return;
		}

		if (rest === `${STAFF_PROFILE_ID}/permissions`) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					permissionKeys: ['staff.users.read'],
				}),
			});
			return;
		}

		if (rest === STAFF_PROFILE_ID) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					profile: {
						id: STAFF_PROFILE_ID,
						name: 'Staff Admin',
						description: 'Platform administrator with management access',
						userAccountCount: 0,
						icon: null,
						tone: null,
					},
				}),
			});
			return;
		}

		await route.fallback();
	});
	// The permission catalog lives outside /staff/profiles/** and is only
	// needed once keys are assigned; with none assigned the page never reads
	// it, so no handler is registered here.
	await page.goto(`/staff/profiles/${STAFF_PROFILE_ID}?edit=1`);
	await expect(
		page.getByTestId('staff-profile-edit-details-drawer'),
	).toBeVisible({ timeout: 10_000 });
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
	await page.getByTestId('landing-cookie-band-customize').click();
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

// Round 8 M4: the selectors this spec measures, as live case DEFINITIONS —
// each carries a real opener, and the live tests below are driven from this
// exact list (so is the linkage test). A selector added to the source guard's
// DESCRIPTION_SELECTORS fails the linkage until a real measurement case
// exists here; typing the string into a second list is no longer a remedy,
// because there is no second list. Round 10 M5: the selector itself is the
// locator, so the case measures exactly what it claims.
const DESCRIPTION_LIVE_CASES: readonly DescriptionLiveCase[] = [
	{
		selector: '.publy-danger-zone-row-description',
		name: 'danger-zone description',
		open: openProfileOverview,
	},
	{
		selector: '.publy-field-switch-description',
		name: 'Field.Switch description',
		open: openFieldValidationFixture,
	},
];

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
		if (value <= 0.04045) {
			return value / 12.92;
		}
		return ((value + 0.055) / 1.055) ** 2.4;
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
	text.evaluate((root) => {
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

		const elementLabel = (element: Element): string =>
			element.getAttribute('data-slot') ??
			element.getAttribute('data-testid') ??
			element.tagName.toLowerCase();

		// Round 5 B1: every distinct colour that actually PAINTS is a text
		// node's parent computed colour — the description's own text and every
		// descendant (a child `<span className="text-primary">` included). Each
		// sample also carries the carrying element's opacity (round 5 fourth
		// door: `opacity-*` on the text paints it translucent without changing
		// `color`, collapsing the effective contrast).
		const foregrounds = new Map<string, ForegroundSample>();
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node: Node | null;
		while ((node = walker.nextNode()) !== null) {
			if (!node.textContent || node.textContent.trim().length === 0) {
				continue;
			}
			const parent = node.parentElement;
			if (!parent) {
				continue;
			}
			const style = getComputedStyle(parent);
			// Round 7 M7: `-webkit-text-fill-color` paints the text in
			// WebKit/Blink instead of `color` when both are set; reading only
			// `color` would measure the wrong paint. Its computed value
			// resolves to `color` when unset (Chromium) or to `currentcolor`
			// in engines that leave it unresolved — both mean "the color
			// value", so only a resolvable fill colour is used.
			const webkitFill = style.webkitTextFillColor;
			const color = toSrgb(
				webkitFill !== '' && webkitFill !== 'currentcolor'
					? webkitFill
					: style.color,
			);
			const opacity = Number(style.opacity);
			if (!Number.isFinite(opacity)) {
				continue;
			}
			const key = `${color}@${opacity}`;
			if (!foregrounds.has(key)) {
				foregrounds.set(key, {
					color,
					opacity,
					source: elementLabel(parent),
				});
			}
		}

		const rect = root.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const hitStack = document.elementsFromPoint(x, y);
		const targetIndex = hitStack.indexOf(root);
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
				element: elementLabel(layer),
			});
			if (alpha === 1) {
				break;
			}
		}

		return { backgroundLayers, foregrounds: [...foregrounds.values()] };
	});

const measureContrast = async (
	text: Locator,
): Promise<ContrastMeasurement[]> => {
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

	return computed.foregrounds.map(({ color, opacity, source }) => {
		const rawForeground = parseComputedColor(color);
		const foreground =
			rawForeground.a === 1 && opacity === 1
				? rawForeground
				: alphaComposite(
						{ ...rawForeground, a: rawForeground.a * opacity },
						background,
					);

		return {
			background,
			foreground,
			ratio: contrastRatio(foreground, background),
			source,
		};
	});
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

		// Round 5 M10: hover/active measurements were 100% redundant (the
		// reviewer's 48-measurement run showed 32 exact duplicates) — no
		// description or row ancestor paints a hover/active colour today, so
		// they are dropped in favour of the child-element walk (B1) and the
		// narrow-viewport run (I7), which actually catch something.
		const measurements = await measureContrast(text);
		for (const measurement of measurements) {
			const description =
				`${label} ${theme} ${measurement.source}: ` +
				`${measurement.ratio.toFixed(2)}:1`;
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
	const description = drawer.locator('[data-slot="drawer-description"]');
	// Round 8 M4: the drawer cases are the LIVE browser coverage of
	// `.publy-drawer-description` — asserted here, per drawer, so the
	// linkage's claim that the slot carries the class is a measurement, not
	// a comment.
	await expect(description).toHaveClass(/publy-drawer-description/);
	await assertTextContrast({
		label: drawerTestId,
		page,
		testInfo,
		text: description,
	});
};

// Round 5 I4: the drawer cases are DRIVEN by the shared inventory constant,
// keyed by testId. A new consumer in the inventory with no opener fails the
// linkage test below (and `DRAWER_OPENERS[testId]` being undefined would throw
// at module load). The source guard asserts the same inventory files are
// exactly its enumerated call sites, so one edit extends both guards.
const DRAWER_OPENERS = {
	'cookie-prefs-drawer': {
		name: 'cookie preferences',
		open: openCookiePrefsDrawer,
	},
	'change-staff-user-email-dialog': {
		name: 'change email',
		open: openChangeEmailDrawer,
	},
	'invite-tenant-user-drawer': {
		name: 'invite user',
		open: openInviteUserDrawer,
	},
	'assign-members-drawer': {
		name: 'assign members',
		open: openAssignMembersDrawer,
	},
	'profile-form-drawer': {
		name: 'create profile',
		open: openProfileCreateDrawer,
	},
	'profile-edit-details-drawer': {
		name: 'edit profile',
		open: openProfileEditDrawer,
	},
	'staff-profile-edit-details-drawer': {
		name: 'edit staff profile',
		open: openStaffProfileEditDrawer,
	},
	'audit-log-export-drawer': {
		name: 'export audit logs',
		open: openAuditLogExportDrawer,
	},
	'link-companies-drawer': {
		name: 'link companies',
		open: openLinkCompaniesDrawer,
	},
} satisfies Record<
	string,
	{ name: string; open: (page: Page) => Promise<void> }
>;

// A missing opener is deliberately NOT a module-load crash: it drops the case
// from DRAWER_CASES so the linkage test below can report it by name. Without
// this, `DRAWER_OPENERS[testId].name` on an undefined entry would error the
// whole file before any test ran.
const DRAWER_CASES = DRAWER_DESCRIPTION_CONSUMERS.flatMap((consumer) => {
	const opener = DRAWER_OPENERS[consumer.testId];
	if (opener === undefined) {
		return [];
	}
	return [
		{
			name: opener.name,
			testId: consumer.testId,
			open: opener.open,
		},
	];
});

test.describe(
	'live description text contrast (#1043 / PR #1061)',
	{ tag: ['@design', '@1043'] },
	() => {
		test('every inventory consumer has a live browser case', () => {
			expect(DRAWER_CASES.length).toBe(DRAWER_DESCRIPTION_CONSUMERS.length);
			for (const consumer of DRAWER_DESCRIPTION_CONSUMERS) {
				expect(
					DRAWER_OPENERS[consumer.testId],
					`no browser drawer opener for ${consumer.file} (${consumer.testId})`,
				).toBeDefined();
			}
		});

		// Round 8 M4: the source guard's DESCRIPTION_SELECTORS is its own list,
		// and this spec's explicit description cases used to be hardcoded with
		// nothing relating the two — a fourth description class gained source
		// coverage automatically and browser coverage never, and the old
		// BROWSER_COVERED_SELECTORS string[] was satisfiable by copy-paste. The
		// coverage is now the DESCRIPTION_LIVE_CASES definitions below (real
		// openers + real locators, driven into actual tests) plus the drawer
		// description class, whose live coverage every drawer case asserts via
		// toHaveClass. This fails the e2e until a live case exists.
		test('every source-guarded description selector has a live browser case', () => {
			const liveSelectors = new Set([
				DRAWER_DESCRIPTION_SELECTOR,
				...DESCRIPTION_LIVE_CASES.map((liveCase) => liveCase.selector),
			]);
			expect([...liveSelectors].sort()).toEqual(
				[...DESCRIPTION_SELECTORS].sort(),
			);
		});

		for (const drawerCase of DRAWER_CASES) {
			test(`${drawerCase.name} drawer clears 4.5:1 in both themes`, async ({
				page,
			}, testInfo) => {
				await drawerCase.open(page);
				await assertDrawerDescriptionContrast(
					page,
					testInfo,
					drawerCase.testId,
				);
			});
		}

		for (const liveCase of DESCRIPTION_LIVE_CASES) {
			test(`the real ${liveCase.name} clears 4.5:1 in both themes`, async ({
				page,
			}, testInfo) => {
				await liveCase.open(page);
				await assertTextContrast({
					label: liveCase.name,
					page,
					testInfo,
					// Round 10 M5: the selector is the locator — nothing else may
					// stand in for what a case claims to measure.
					text: page.locator(liveCase.selector),
				});
			});
		}

		// Round 5 I7: the source model deliberately drops `@media`-nested rules
		// (documented in css-cascade-test-support.ts) and defers to a real-browser
		// assertion — but every project runs at Desktop Chrome 1280×720, so the
		// deferral had nowhere to land. One narrow-viewport run of the change-email
		// drawer closes it: its description uses the DEFAULT primitive (no className
		// override), so a mobile-only override on `.publy-drawer-description` is
		// caught here and nowhere else. (The cookie drawer is not used because its
		// own muted utility override would mask a primitive-level media rule.)
		test.describe('mobile viewport', () => {
			test.use({ viewport: { width: 375, height: 667 } });

			test('change email drawer clears 4.5:1 in both themes at the narrow viewport', async ({
				page,
			}, testInfo) => {
				await openChangeEmailDrawer(page);
				await assertDrawerDescriptionContrast(
					page,
					testInfo,
					'change-staff-user-email-dialog',
				);
			});
		});
	},
);
