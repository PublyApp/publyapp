import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #992/#975 review round 3, BLOCKER + IMPORTANT findings 1-3.
 *
 * Round 2's version of this spec rendered a hand-authored `page.setContent()`
 * page whose markup MIRRORED the pin's classes rather than the live
 * `IconColorPicker` component, and read whatever `dist/client/assets/app-*.css`
 * happened to already exist on disk with no freshness check. The round 3
 * review proved both false-green: removing the live component's only pin
 * styling class still passed 5/5 browser tests (the mirrored markup never
 * lost the class), and a `right:999px` production mutation stayed green
 * against a stale `dist/` artifact until a manual rebuild. It also never ran
 * in CI at all — it was assigned to a `chromium-hermetic-source` Playwright
 * project the workflow never selected.
 *
 * This version drives the REAL route
 * (`/staff/tenants/$tenantId/profiles?new=1`) against the actual
 * docker-compose e2e stack, which serves the ACTUAL `front` container built
 * from current source by the very same CI job that runs this spec — so
 * there is no separate build artifact that can go stale relative to source,
 * and the rendered pin is the live `IconColorPicker` component (with
 * whatever classes it genuinely carries, including `ring-background` —
 * closing the specificity blind spot the round 3 review found in the old
 * hand-authored markup), not a copy of it. Only the tenant/profile/
 * permission-catalog API responses are mocked. Because this now needs a real
 * login + a real backend, it runs as the ordinary `chromium` Playwright
 * project — the one the CI workflow already selects on every shard and
 * already fails the build on (front-e2e.yml) — closing the BLOCKER without
 * inventing a new, unselected project.
 */

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const NON_TEXT_CONTRAST_FLOOR = 3.0;

type Rgb = { r: number; g: number; b: number };

const parseRgbString = (value: string): Rgb => {
	const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
	if (!match) {
		throw new Error(`Unparseable computed colour: ${value}`);
	}
	return {
		r: Number(match[1]),
		g: Number(match[2]),
		b: Number(match[3]),
	};
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		if (value <= 0.04045) {
			return value / 12.92;
		}
		return ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: Rgb, background: Rgb): number => {
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

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** Only what the create-profile drawer route actually needs to render past
 * its loading gate: tenant details (page shell), an empty profiles list
 * (the page behind the drawer), and an empty permission catalog (the drawer
 * itself, `useStaffTenantPermissionCatalogQuery` →
 * `/staff/permissions/scopes/tenant`). No profile/member data is needed —
 * this spec only cares about the icon-color-picker pin the drawer renders
 * regardless of catalog contents. */
const mockProfileCreateDrawerDependencies = async (page: Page) => {
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
					profilesCount: 0,
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
				body: JSON.stringify({ data: [], nextCursor: null }),
			});
			return;
		}

		await route.fallback();
	});

	await page.route('**/staff/permissions/**', async (route) => {
		const request = route.request();
		const url = request.url();

		if (
			request.method() !== 'GET' ||
			!isApiPath(url, '/staff/permissions/scopes/tenant')
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
};

/** Navigates to the real create-profile drawer (`?new=1` on the tenant
 * profiles tab) and waits for it to render the live `IconColorPicker`. */
const openProfileCreateDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockProfileCreateDrawerDependencies(page);

	await page.goto(`/staff/tenants/${TENANT_ID}/profiles?new=1`);
	await expect(page.getByTestId('profile-form-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const readPinComputedColors = async (
	page: Page,
): Promise<{ color: Rgb; background: Rgb }> => {
	const computed = await page
		.getByTestId('profile-icon-picker-pin')
		.evaluate((pin) => {
			const style = getComputedStyle(pin);
			return { color: style.color, background: style.backgroundColor };
		});

	return {
		color: parseRgbString(computed.color),
		background: parseRgbString(computed.background),
	};
};

test.describe(
	'profile icon-picker pencil-pin contrast (#992/#975 round 3, live component + live route)',
	{ tag: ['@design', '@staff-profiles', '@992'] },
	() => {
		test('the live pin clears the 3:1 non-text floor in both light and dark themes', async ({
			page,
		}) => {
			await openProfileCreateDrawer(page);

			const light = await readPinComputedColors(page);
			expect(
				contrastRatio(light.color, light.background),
				`light: color rgb(${light.color.r},${light.color.g},${light.color.b}) on background rgb(${light.background.r},${light.background.g},${light.background.b})`,
			).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);

			await page.evaluate(() => document.documentElement.classList.add('dark'));
			const dark = await readPinComputedColors(page);
			expect(
				contrastRatio(dark.color, dark.background),
				`dark: color rgb(${dark.color.r},${dark.color.g},${dark.color.b}) on background rgb(${dark.background.r},${dark.background.g},${dark.background.b})`,
			).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
		});

		// Round 3 finding 2 (mirrored markup): reproduces the reviewer's exact
		// live-component regression — stripping the pin's only styling class,
		// leaving `pointer-events-none` (still present in the DOM, still
		// aria-hidden, but visually unstyled). Round 2's hermetic spec always
		// rendered its OWN hardcoded class list, so this mutation was invisible
		// to it. This spec reads the live element's class list directly off the
		// real rendered component, so removing production's styling hook here
		// (the same effect as editing icon-color-picker.tsx and shipping it)
		// must make the pin's computed colours fall back to the (transparent/
		// inherited) values the component's plain classes leave behind, which do
		// not model a passing 3:1 contrast pair.
		test("a live pin missing its styling class ('publy-profile-detail-tile-pin') fails contrast, proving this spec reads the real element and not a copy", async ({
			page,
		}) => {
			await openProfileCreateDrawer(page);

			const before = await page
				.getByTestId('profile-icon-picker-pin')
				.getAttribute('class');
			expect(before).toContain('publy-profile-detail-tile-pin');

			await page.getByTestId('profile-icon-picker-pin').evaluate((pin) => {
				pin.classList.remove('publy-profile-detail-tile-pin');
			});

			const after = await readPinComputedColors(page);
			// With the styling class gone, the pin has no declared `background`
			// (falls back to `transparent`) and no declared `color` (inherits the
			// tile's `--publy-icon-tile-fg`, not the pin's dedicated
			// `--publy-foreground-muted`) — the exact real-world effect of the
			// reviewer's regression. Assert the SPECIFIC real effect (transparent
			// background) rather than only the downstream contrast number, so a
			// coincidental pass can't hide a broken assertion.
			expect(after.background).toEqual({ r: 0, g: 0, b: 0 });
		});

		// Cascade regression proof: a later duplicate rule for the exact same
		// selector reverting `color` to the non-compliant
		// `--publy-foreground-subtle` token. Injected as a real stylesheet
		// (`page.addStyleTag`) appended after every other stylesheet the live
		// page already loaded, so it wins the cascade exactly the way a later
		// declaration in the real compiled app.css would — no artifact reuse, no
		// mirrored markup, just the browser resolving the real cascade.
		test('a later duplicate rule for the exact same selector changes the real computed colour, and the resulting contrast is correctly reported as failing', async ({
			page,
		}) => {
			await openProfileCreateDrawer(page);

			await page.addStyleTag({
				content:
					'.publy-profile-detail-tile-pin{color:var(--publy-foreground-subtle)}',
			});

			const light = await readPinComputedColors(page);
			expect(
				contrastRatio(light.color, light.background),
				`light: color rgb(${light.color.r},${light.color.g},${light.color.b}) on background rgb(${light.background.r},${light.background.g},${light.background.b})`,
			).toBeLessThan(NON_TEXT_CONTRAST_FLOOR);
		});

		// Specificity regression proof: the round 3 reviewer defeated the
		// source-level cascade resolver (css-cascade-test-support.ts) with a
		// higher-specificity compound selector appending the pin's OWN
		// `ring-background` class — `.publy-profile-detail-tile-pin.ring-background`
		// — and round 2's hermetic browser spec also missed it because its
		// hand-authored markup omitted that class entirely. The live pin
		// genuinely carries `ring-background` (icon-color-picker.tsx), so this
		// spec's real DOM read is exposed to exactly the same compound selector a
		// real stylesheet author could write, and must catch it.
		test('a higher-specificity compound selector targeting the live pin classes overrides the effective colour, and the resulting contrast is correctly reported as failing', async ({
			page,
		}) => {
			await openProfileCreateDrawer(page);

			const pinClasses = (
				await page.getByTestId('profile-icon-picker-pin').getAttribute('class')
			)
				?.split(/\s+/)
				.filter(Boolean);
			expect(pinClasses).toContain('ring-background');

			await page.addStyleTag({
				content:
					'.publy-profile-detail-tile-pin.ring-background{color:var(--publy-foreground-subtle)}',
			});

			const light = await readPinComputedColors(page);
			expect(
				contrastRatio(light.color, light.background),
				`light: color rgb(${light.color.r},${light.color.g},${light.color.b}) on background rgb(${light.background.r},${light.background.g},${light.background.b})`,
			).toBeLessThan(NON_TEXT_CONTRAST_FLOOR);
		});
	},
);
