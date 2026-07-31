import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers/api';
import { loginAsStaffAdmin } from './helpers/login';

/**
 * #992/#975 review round 3, BLOCKER + IMPORTANT findings 1-3. See
 * profile-icon-picker-pin-contrast.spec.ts's header for the full story: round
 * 2's version of this spec rendered a hand-authored `page.setContent()` page
 * mirroring the drawer/tile/pin markup rather than the live components, and
 * read whatever `dist/client/assets/app-*.css` happened to already be on disk
 * with no freshness check — both proven false-green by the round 3 reviewer
 * (removing the live pin's styling class stayed green; a `right:999px`
 * mutation stayed green against a stale `dist/` asset). It also never ran in
 * CI (assigned to an unselected `chromium-hermetic-source` project).
 *
 * This version opens the REAL create-profile drawer
 * (`/staff/tenants/$tenantId/profiles?new=1`) against the real
 * docker-compose e2e stack — the actual `IconColorPicker` trigger + pin
 * inside the actual `Drawer`/`DrawerBody` chrome, styled by whatever CSS the
 * real `front` container (built fresh from current source by the same CI job
 * that runs this spec) actually serves. Only the tenant/profiles/permission-
 * catalog API responses are mocked. It runs as the ordinary `chromium`
 * Playwright project, which CI already selects and already blocks the build
 * on.
 */

const TENANT_ID = '0197b8f0-3333-7ccc-8ccc-cccccccccccc';

type Rect = { left: number; right: number; top: number; bottom: number };

type Measurements = {
	tile: Rect;
	pin: Rect;
	nameInput: Rect;
	hint: Rect;
	drawer: Rect;
	drawerBody: Rect;
	drawerBodyScrollWidth: number;
	drawerBodyClientWidth: number;
	pinCenterIsPainted: boolean;
};

const isApiPath = (url: string, path: string): boolean => {
	const parsed = new URL(url);
	return parsed.origin === API_BASE_URL && parsed.pathname === path;
};

/** Same minimal mock set as the contrast spec's sibling helper — tenant
 * details (page shell), an empty profiles list, and an empty permission
 * catalog. Duplicated rather than shared: each spec file owns its exact
 * network contract, mirroring how every other e2e spec in this repo already
 * defines its own `mock*` helper rather than importing one across files. */
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

const openProfileCreateDrawer = async (page: Page): Promise<void> => {
	await loginAsStaffAdmin(page);
	await mockProfileCreateDrawerDependencies(page);

	await page.goto(`/staff/tenants/${TENANT_ID}/profiles?new=1`);
	await expect(page.getByTestId('profile-form-drawer')).toBeVisible({
		timeout: 10_000,
	});
};

const readMeasurements = (page: Page): Promise<Measurements> =>
	page.evaluate(() => {
		const rectOf = (el: Element): Rect => {
			const rect = el.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			};
		};

		const tileEl = document.querySelector('.publy-profile-detail-tile');
		const pinEl = document.querySelector(
			'[data-testid="profile-icon-picker-pin"]',
		);
		const drawerEl = document.querySelector('.publy-drawer');
		const drawerBodyEl = document.querySelector('.publy-drawer-body');

		if (!tileEl || !pinEl || !drawerEl || !drawerBodyEl) {
			throw new Error(
				'Missing one of tile/pin/drawer/drawer-body in the live DOM',
			);
		}

		// The name field sits in the same grid row as the tile
		// (_profile-form-drawer.tsx / _profile-edit-details-drawer.tsx: `grid
		// items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]`) — locate it
		// structurally (the first input in that row) rather than by a
		// guessable id, since Field.Text generates its input id via `useId()`.
		const row = tileEl.closest('.grid');
		const nameField = row?.querySelector('input');
		if (!nameField) {
			throw new Error('Missing the profile name input');
		}

		// The hint paragraph is the next block after the tile's grid row,
		// inside the same `space-y-1.5` wrapper.
		const hintEl = row?.parentElement?.querySelector('p');
		if (!hintEl) {
			throw new Error('Missing the icon-picker hint paragraph');
		}

		const pinRect = pinEl.getBoundingClientRect();
		const pinCenterX = pinRect.left + pinRect.width / 2;
		const pinCenterY = pinRect.top + pinRect.height / 2;
		// The pin is intentionally `pointer-events: none` in production (it
		// must not be hit-testable — a nested interactive element would be
		// invalid HTML inside the trigger button, per the issue). That also
		// makes it invisible to elementFromPoint()/hit-testing by design, so a
		// hit test at its default pointer-events value can never resolve to it
		// regardless of whether it is clipped or covered. Toggle
		// pointer-events on just for this measurement to ask the real question
		// — "is this pixel actually part of the pin's painted, unclipped box"
		// — then restore it so the rest of the measurement reflects the real
		// production styling.
		const pinElement = pinEl as HTMLElement;
		const originalPointerEvents = pinElement.style.pointerEvents;
		pinElement.style.pointerEvents = 'auto';
		const elementAtPinCenter = document.elementFromPoint(
			pinCenterX,
			pinCenterY,
		);
		pinElement.style.pointerEvents = originalPointerEvents;

		return {
			tile: rectOf(tileEl),
			pin: rectOf(pinEl),
			nameInput: rectOf(nameField),
			hint: rectOf(hintEl),
			drawer: rectOf(drawerEl),
			drawerBody: rectOf(drawerBodyEl),
			drawerBodyScrollWidth: drawerBodyEl.scrollWidth,
			drawerBodyClientWidth: drawerBodyEl.clientWidth,
			pinCenterIsPainted:
				elementAtPinCenter === pinEl || pinEl.contains(elementAtPinCenter),
		};
	});

const rectsIntersect = (a: Rect, b: Rect): boolean =>
	a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Runs the full set of geometry/clipping assertions the issue asked for
 * against the live drawer already open on `page`. */
const assertPinOverhangsAndIsNotClipped = async (
	page: Page,
	{ epsilon = 0.5 }: { epsilon?: number } = {},
): Promise<void> => {
	const m = await readMeasurements(page);

	// 1. Genuinely overhangs — the pin's own box extends past the tile's box
	// on both axes (not flush, not merely touching).
	expect(
		m.pin.right,
		'pin.right should extend past tile.right',
	).toBeGreaterThan(m.tile.right);
	expect(
		m.pin.bottom,
		'pin.bottom should extend past tile.bottom',
	).toBeGreaterThan(m.tile.bottom);

	// 2. Not clipped by either overflow-constrained ancestor (`.publy-drawer`
	// itself is `overflow-hidden`; `.publy-drawer-body` is `overflow-y-auto`,
	// which per spec forces the x-axis to compute to `auto` too) — the pin's
	// box must be fully contained within both, at the current (unscrolled)
	// position.
	for (const [name, ancestor] of [
		['drawer', m.drawer],
		['drawer-body', m.drawerBody],
	] as const) {
		expect(
			m.pin.left,
			`pin not clipped on the left by ${name}`,
		).toBeGreaterThanOrEqual(ancestor.left - epsilon);
		expect(
			m.pin.right,
			`pin not clipped on the right by ${name}`,
		).toBeLessThanOrEqual(ancestor.right + epsilon);
		expect(
			m.pin.top,
			`pin not clipped on top by ${name}`,
		).toBeGreaterThanOrEqual(ancestor.top - epsilon);
		expect(
			m.pin.bottom,
			`pin not clipped on bottom by ${name}`,
		).toBeLessThanOrEqual(ancestor.bottom + epsilon);
	}

	// 3. The issue's own named risk: the overhang must not provoke a
	// horizontal scrollbar inside the drawer body.
	expect(
		m.drawerBodyScrollWidth,
		'drawer body should not gain horizontal scroll from the overhang',
	).toBeLessThanOrEqual(m.drawerBodyClientWidth + epsilon);

	// 4. Does not collide with the neighbouring name field or the hint text
	// below (issue: "do not collide with the name field").
	expect(
		rectsIntersect(m.pin, m.nameInput),
		'pin should not overlap the name field',
	).toBe(false);
	expect(
		rectsIntersect(m.pin, m.hint),
		'pin should not overlap the hint text below',
	).toBe(false);

	// 5. Actually painted, not merely present in the DOM: a hit-test at the
	// pin's own center resolves to the pin, not to nothing (display:none,
	// zero size) or some other covering element.
	expect(m.pinCenterIsPainted, 'the pin should be genuinely painted').toBe(
		true,
	);
};

test.describe('profile icon-picker pencil-pin geometry (#992/#975 round 3, live component + live route)', () => {
	test('the pin overhangs the tile, is not clipped by the drawer/drawer-body, and does not collide with neighbours (desktop width)', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openProfileCreateDrawer(page);

		await assertPinOverhangsAndIsNotClipped(page);
	});

	// Issue #992's own callout: "Check it at narrow widths too, where the grid
	// collapses to one column."
	test('still overhangs and is not clipped at the narrow single-column breakpoint', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await openProfileCreateDrawer(page);

		await assertPinOverhangsAndIsNotClipped(page);
	});

	// Round 3 finding 3 (compiled CSS freshness): reproduces the reviewer's
	// exact mutation — `right: 0` (this branch's `right: -4px`) changed to
	// `right: 999px` — as a real stylesheet injected via `page.addStyleTag`
	// AFTER the live page has already loaded its real, server-served
	// stylesheet. There is no separate `dist/` artifact this spec reads: the
	// CSS driving the baseline assertions above came straight from the
	// running `front` container's HTTP response, so there is nothing here
	// that can go stale independently of what that container actually
	// serves. This override rule wins the cascade the same way a later
	// declaration in the real compiled app.css would.
	test('a right:999px mutation (displacing the pin far from the corner) is caught', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openProfileCreateDrawer(page);

		await page.addStyleTag({
			content: '.publy-profile-detail-tile-pin{right:999px}',
		});

		await expect(assertPinOverhangsAndIsNotClipped(page)).rejects.toThrow();
	});

	// Round 3 finding 2 (mirrored markup): reproduces the reviewer's exact
	// live-component regression — stripping the pin's only styling class.
	// Round 2's hermetic spec always rendered its own hardcoded class list,
	// so this mutation was invisible to it; this spec measures the real
	// rendered element, so the same DOM surgery a source edit + rebuild would
	// produce is directly visible here.
	test("removing the live pin's styling class is caught (no overhang left to measure)", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openProfileCreateDrawer(page);

		await page.getByTestId('profile-icon-picker-pin').evaluate((pin) => {
			pin.classList.remove('publy-profile-detail-tile-pin');
		});

		await expect(assertPinOverhangsAndIsNotClipped(page)).rejects.toThrow();
	});
});
