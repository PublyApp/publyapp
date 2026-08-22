import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import {
	DRAWER_FORM_CALL_SITES,
	type DrawerFormCallSiteId,
} from './helpers/drawer-form-call-sites';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #990 / PR #1054 browser-side guard. Earlier source-level checks could prove
 * the authored parent chain and rule order, but not the effective cascade:
 * higher specificity or Tailwind utilities could still turn the real form or
 * body back into an unconstrained block and clip the footer.
 *
 * This spec follows profile-icon-picker-pin-geometry.spec.ts's live-route
 * pattern. It opens every inventoried REAL DrawerForm call site against the
 * real docker-compose `front` container at both baseline and short viewports,
 * then measures their actual DOM and computed CSS in the ordinary `chromium`
 * project. It never mirrors the drawer with `page.setContent()` and never
 * reads a possibly stale `dist/` stylesheet. The small mock below is
 * deliberately local: each e2e spec owns the exact network contract needed by
 * its real routes.
 */

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';
const PROFILE_ID = '0197b8f0-4444-7ccc-8ccc-cccccccccccc';
const STAFF_USER_ID = '0197b8f0-5555-7ccc-8ccc-cccccccccccc';
const FORCED_CONTENT_HEIGHT = 1_200;
const GEOMETRY_EPSILON = 0.5;
const DRAWER_VIEWPORTS = [
	{ name: 'baseline', width: 900, height: 600 },
	// Keep width fixed to isolate height-dependent cascade defects. 560px is
	// below the review mutation's 599px ceiling while retaining enough room for
	// a meaningful header/body/footer layout instead of a near-degenerate case.
	{ name: 'short', width: 900, height: 560 },
	// A second width closes the width blind spot: all the other samples share
	// one finite width, so a later author rule scoped to a narrow breakpoint
	// could override the form geometry, stay inactive in every measurement,
	// and still escape the CSS source assertion (which only models rule order).
	// 600px sits below the app's `sm` breakpoint (app.css uses
	// `@media (max-width: 639px)`), so any such narrow-breakpoint rule is live
	// here and the computed-style assertions below would see it.
	{ name: 'narrow', width: 600, height: 560 },
	// Round 21's IMPORTANT 3 + round 24's IMPORTANT 4: the source-level CSS
	// guard ranks only the UNCONDITIONAL selectors — which rule a
	// `min-width`-gated rule wins inside its viewport depends on the real
	// viewport, not the source. Round 24 closes the conditional side BY
	// CONSTRUCTION at the source lane (see `findConditionalDrawerFormGeometryRules`
	// in drawer-form.test.tsx: a conditional rule that changes the drawer
	// form's geometry is a violation regardless of which widths this lane
	// samples), so this spec verifies the real computed geometry rather than
	// chasing ever-more breakpoints. The 1024px sample sits above every
	// `min-width` app.css currently declares for the drawer, so a wide-
	// breakpoint rule that somehow shipped would be live here too.
	{ name: 'wide', width: 1024, height: 700 },
] as const;

type Rect = {
	bottom: number;
	height: number;
	left: number;
	right: number;
	top: number;
	width: number;
};

type FlexChainItem = {
	element: string;
	minHeight: string;
	parentDisplay: string;
};

type DrawerMeasurements = {
	bodyClientHeight: number;
	bodyOverflowY: string;
	bodyScrollHeight: number;
	bodyScrollTopAfter: number;
	bodyScrollTopBefore: number;
	drawerDisplay: string;
	flexChain: FlexChainItem[];
	footerAfterScroll: Rect;
	footerBeforeScroll: Rect;
	formClientHeight: number;
	formDisplay: string;
	formFlexDirection: string;
	formMinHeight: string;
	viewportHeight: number;
	viewportWidth: number;
};

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

const mockDrawerDependencies = async (page: Page): Promise<void> => {
	// A trailing single star cannot cross a path separator. `**` is required
	// so this handler owns both the tenant resource and its real sub-paths.
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
				body: JSON.stringify({
					data: [
						{
							id: PROFILE_ID,
							name: 'Publishing',
							description: 'Can publish tenant content.',
							icon: null,
							tone: null,
							isDefault: false,
							userAccountCount: 3,
							permissionsCount: 4,
						},
					],
					nextCursor: null,
				}),
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
				body: JSON.stringify({ assignedProfiles: [], maxProfilesPerUser: 25 }),
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

const measureDrawer = async (
	page: Page,
	drawerTestId: string,
): Promise<DrawerMeasurements> => {
	const drawer = page.getByTestId(drawerTestId);
	await expect(drawer).toHaveCSS('translate', 'none');

	return drawer.evaluate(
		async (surface, forcedContentHeight): Promise<DrawerMeasurements> => {
			const drawerElement = surface as HTMLElement;
			const form = drawerElement.querySelector('form.publy-drawer-form');
			const body = drawerElement.querySelector('[data-slot="drawer-body"]');
			const footer = drawerElement.querySelector('[data-slot="drawer-footer"]');

			if (
				!(form instanceof HTMLFormElement) ||
				!(body instanceof HTMLElement) ||
				!(footer instanceof HTMLElement) ||
				!drawerElement.classList.contains('publy-drawer')
			) {
				throw new Error(
					'Missing the real drawer form, body, footer, or surface',
				);
			}

			const spacer = document.createElement('div');
			spacer.dataset.drawerScrollTestSpacer = '';
			spacer.setAttribute('aria-hidden', 'true');
			spacer.style.flex = `0 0 ${forcedContentHeight}px`;
			spacer.style.height = `${forcedContentHeight}px`;
			spacer.style.minHeight = `${forcedContentHeight}px`;
			body.append(spacer);

			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});

			const rectOf = (element: Element): Rect => {
				const rect = element.getBoundingClientRect();
				return {
					bottom: rect.bottom,
					height: rect.height,
					left: rect.left,
					right: rect.right,
					top: rect.top,
					width: rect.width,
				};
			};

			const flexChain: FlexChainItem[] = [];
			let current: HTMLElement = body;
			while (current !== drawerElement) {
				// Round 21's IMPORTANT 4: a `display: contents` ancestor generates
				// no principal box of its own, so it never participates as a flex
				// container — skip past it (and any further boxless ancestors) to
				// the nearest ancestor that actually generates one, exactly like
				// the source-level guard treats it as transparent.
				let parent = current.parentElement;
				while (
					parent instanceof HTMLElement &&
					getComputedStyle(parent).display === 'contents'
				) {
					parent = parent.parentElement;
				}
				if (!(parent instanceof HTMLElement)) {
					throw new Error(
						'Drawer body ancestor chain did not reach the surface',
					);
				}

				const style = getComputedStyle(current);
				flexChain.push({
					element:
						current.getAttribute('data-slot') ?? current.tagName.toLowerCase(),
					minHeight: style.minHeight,
					parentDisplay: getComputedStyle(parent).display,
				});
				current = parent;
			}

			const formStyle = getComputedStyle(form);
			const bodyStyle = getComputedStyle(body);
			const footerBeforeScroll = rectOf(footer);
			const bodyScrollTopBefore = body.scrollTop;
			body.scrollTop = body.scrollHeight;

			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});

			return {
				bodyClientHeight: body.clientHeight,
				bodyOverflowY: bodyStyle.overflowY,
				bodyScrollHeight: body.scrollHeight,
				bodyScrollTopAfter: body.scrollTop,
				bodyScrollTopBefore,
				drawerDisplay: getComputedStyle(drawerElement).display,
				flexChain,
				footerAfterScroll: rectOf(footer),
				footerBeforeScroll,
				formClientHeight: form.clientHeight,
				formDisplay: formStyle.display,
				formFlexDirection: formStyle.flexDirection,
				formMinHeight: formStyle.minHeight,
				viewportHeight: window.innerHeight,
				viewportWidth: window.innerWidth,
			};
		},
		FORCED_CONTENT_HEIGHT,
	);
};

const assertDrawerScrollGeometry = async (
	page: Page,
	testInfo: TestInfo,
	drawerTestId: string,
): Promise<void> => {
	const measurements = await measureDrawer(page, drawerTestId);

	await testInfo.attach(`${drawerTestId}-geometry`, {
		body: JSON.stringify(measurements, null, 2),
		contentType: 'application/json',
	});
	testInfo.annotations.push({
		type: 'drawer-geometry',
		description: JSON.stringify(measurements),
	});

	// 1. The real form is both the shrinking flex item and the column that
	// distributes its body/footer children.
	expect(measurements.formDisplay, 'form computed display').toBe('flex');
	expect(measurements.formFlexDirection, 'form computed flex direction').toBe(
		'column',
	);
	expect(measurements.formMinHeight, 'form computed min-height').toBe('0px');

	// 2. Overflow belongs to the body and the forced content genuinely makes
	// that exact element overflow vertically.
	expect(['auto', 'scroll'], 'body computed overflow-y').toContain(
		measurements.bodyOverflowY,
	);
	expect(
		measurements.bodyScrollHeight,
		'body scrollHeight should exceed clientHeight',
	).toBeGreaterThan(measurements.bodyClientHeight);

	// 3. Chromium accepted the scroll and no edge or dimension of the footer
	// travelled with the body contents.
	expect(
		measurements.bodyScrollTopAfter,
		'body scrollTop should change',
	).toBeGreaterThan(measurements.bodyScrollTopBefore);
	const rectKeys = [
		'bottom',
		'height',
		'left',
		'right',
		'top',
		'width',
	] as const;
	for (const key of rectKeys) {
		expect(
			Math.abs(
				measurements.footerAfterScroll[key] -
					measurements.footerBeforeScroll[key],
			),
			`footer ${key} should stay fixed while the body scrolls`,
		).toBeLessThanOrEqual(GEOMETRY_EPSILON);
	}

	// 4. The whole non-zero footer is inside the viewport on both axes. This is
	// the user-visible regression boundary from #990: the actions must not be
	// clipped below the short viewport or translated beyond a horizontal edge.
	expect(measurements.footerAfterScroll.height).toBeGreaterThan(0);
	expect(measurements.footerAfterScroll.width).toBeGreaterThan(0);
	expect(measurements.footerAfterScroll.top).toBeGreaterThanOrEqual(0);
	expect(measurements.footerAfterScroll.bottom).toBeLessThanOrEqual(
		measurements.viewportHeight,
	);
	expect(measurements.footerAfterScroll.left).toBeGreaterThanOrEqual(0);
	expect(measurements.footerAfterScroll.right).toBeLessThanOrEqual(
		measurements.viewportWidth,
	);

	// A rect can be on-screen while an overlay, disabled state, or pointer-event
	// rule still makes its action unreachable. Trial click runs Playwright's
	// full actionability checks without submitting the form.
	const primaryAction = page
		.getByTestId(drawerTestId)
		.locator('[data-slot="drawer-footer"] button[type="submit"]');
	await expect(primaryAction, 'one primary footer action').toHaveCount(1);
	await expect(
		primaryAction,
		'primary footer action should begin fully inside the viewport',
	).toBeInViewport({ ratio: 1 });
	await primaryAction.click({ trial: true });

	// 5. Starting at the body and stopping at the drawer surface, every node
	// must be a flex item whose automatic minimum cannot own unconstrained
	// height. This catches an intermediate block wrapper through computed
	// geometry rather than direct-parent identity.
	expect(measurements.drawerDisplay, 'drawer surface computed display').toBe(
		'flex',
	);
	expect(measurements.flexChain.length).toBeGreaterThanOrEqual(2);
	for (const item of measurements.flexChain) {
		expect(
			['flex', 'inline-flex'],
			`${item.element} should be a flex item`,
		).toContain(item.parentDisplay);
		expect(item.minHeight, `${item.element} computed min-height`).toBe('0px');
	}
};

const openDrawerByCallSiteId: Record<
	DrawerFormCallSiteId,
	(page: Page) => Promise<void>
> = {
	'profile-create': openProfileCreateDrawer,
	'profile-edit': openProfileEditDrawer,
	'tenant-user-invite': openInviteUserDrawer,
	'staff-user-email-change': openChangeEmailDrawer,
	'tenant-post-create': async () => {
		/* tenant-route drawer — no-op in staff e2e */
	},
};

test.describe(
	'form-bearing drawer scroll geometry (#990 / PR #1054)',
	{ tag: ['@design', '@990'] },
	() => {
		for (const viewport of DRAWER_VIEWPORTS) {
			test.describe(`${viewport.name} ${viewport.width}x${viewport.height} viewport`, () => {
				test.beforeEach(async ({ page }) => {
					await page.setViewportSize({
						width: viewport.width,
						height: viewport.height,
					});
				});

				for (const callSite of DRAWER_FORM_CALL_SITES) {
					test(`the real ${callSite.name} drawer scrolls its body and keeps its footer reachable`, async ({
						page,
					}, testInfo) => {
						await openDrawerByCallSiteId[callSite.id](page);
						await assertDrawerScrollGeometry(
							page,
							testInfo,
							callSite.drawerTestId,
						);
					});
				}
			});
		}
	},
);
