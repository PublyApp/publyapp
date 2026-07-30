import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';

/**
 * #992 review round 2, IMPORTANT finding C. Issue #992 requires the pencil
 * pin to overhang the tile's bottom-right corner ("as in the mockup") and
 * separately names overflow clipping as the real risk: the tile's row
 * (icon-color-picker.tsx) sits inside `DrawerBody`
 * (drawer.tsx, `.publy-drawer-body` → `overflow-y-auto`), and per spec a
 * non-`visible` value on one axis forces the OTHER axis to compute to
 * `auto` rather than staying `visible` — so an overhanging element can be
 * clipped, or provoke an unwanted horizontal scrollbar.
 *
 * jsdom (the vitest-side component test, icon-color-picker.test.tsx) has no
 * layout engine at all, so it can only assert the pin's DOM
 * existence/semantics — never its geometry. This spec is the real-browser
 * geometry/clipping proof the issue explicitly asked for. It renders a
 * `page.setContent()` page built from the REAL compiled production CSS
 * (dist/client/assets/app-*.css — see helpers/compiled-app-css.ts) plus
 * markup that mirrors the actual rendered structure and class names of:
 *  - the trigger + pin (icon-color-picker.tsx)
 *  - the surrounding grid row + hint text
 *    (_profile-edit-details-drawer.tsx / _profile-form-drawer.tsx, which
 *    share the identical structure)
 *  - the drawer chrome the row actually sits inside
 *    (`.publy-drawer[data-width='736']` / `.publy-drawer-body`, drawer.tsx)
 * No login, backend, or docker-compose stack is needed — see the
 * `chromium-hermetic-source` Playwright project in playwright.config.ts.
 */

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

const buildDrawerPage = (css: string): string => `<!doctype html>
<html>
<head><style>${css}</style></head>
<body>
	<div class="publy-drawer" data-width="736">
		<div class="publy-drawer-body" id="drawer-body">
			<div class="space-y-1.5">
				<div class="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
					<button
						type="button"
						id="tile"
						class="publy-profile-detail-tile cursor-pointer transition-[filter,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
						data-tone="0"
					>
						<span aria-hidden="true" class="size-6"></span>
						<span
							aria-hidden="true"
							id="pin"
							data-testid="profile-icon-picker-pin"
							class="publy-profile-detail-tile-pin pointer-events-none ring-2 ring-background"
						></span>
					</button>
					<div class="space-y-1.5">
						<label class="flex items-center gap-2 text-[13px] leading-none font-medium select-none">Profile name</label>
						<input
							id="name-input"
							value="Example profile"
							class="md:h-9 h-11 w-full min-w-0 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3.5 py-1 text-base shadow-[var(--publy-shadow-input)] outline-none md:text-[13px]"
						/>
					</div>
				</div>
				<div class="flex min-h-6 items-center justify-between gap-3 text-xs sm:pl-[68px]">
					<p id="hint" class="text-muted-foreground">Tap the tile to change icon &amp; color</p>
				</div>
			</div>
			<div class="space-y-1.5">
				<label class="flex items-center gap-2 text-[13px] leading-none font-medium select-none">Description</label>
				<textarea class="w-full min-w-0 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3.5 py-2 text-base" rows="5"></textarea>
			</div>
		</div>
	</div>
</body>
</html>`;

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
		const requireEl = (id: string): HTMLElement => {
			const el = document.getElementById(id);
			if (!el) {
				throw new Error(`Missing #${id}`);
			}
			return el;
		};

		const tileEl = requireEl('tile');
		const pinEl = requireEl('pin');
		const nameInputEl = requireEl('name-input');
		const hintEl = requireEl('hint');
		const drawerBodyEl = requireEl('drawer-body');
		const drawerEl = document.querySelector('.publy-drawer');
		if (!drawerEl) {
			throw new Error('Missing .publy-drawer');
		}

		const pinRect = pinEl.getBoundingClientRect();
		const pinCenterX = pinRect.left + pinRect.width / 2;
		const pinCenterY = pinRect.top + pinRect.height / 2;
		// The pin is intentionally `pointer-events: none` in production (it
		// must not be hit-testable — a nested interactive element would be
		// invalid HTML inside the trigger button, per the issue). That also
		// makes it invisible to elementFromPoint()/hit-testing by design, so
		// a hit test at its default pointer-events value can never resolve to
		// it regardless of whether it is clipped or covered. Toggle
		// pointer-events on just for this measurement to ask the real
		// question — "is this pixel actually part of the pin's painted,
		// unclipped box" — then restore it so the rest of the measurement
		// reflects the real production styling.
		//
		// The hit test point is the pin's own CENTER, not a point near the
		// tile's square corner: the pin is `border-radius: circular`, and a
		// circle inscribed in its square bounding box does not cover that
		// box's corners at all (a circle only reaches its bounding box at
		// each edge's midpoint) — a corner-adjacent point can sit outside the
		// visible disc while still being inside the *bounding box* the
		// overhang/containment checks below use. The bounding-box comparisons
		// are what actually correspond to ancestor overflow-clipping (which
		// clips boxes, not the circular paint), so they are the real
		// authority on "does the overhang extend past the tile and stay
		// unclipped"; this hit test only needs to confirm the pin is
		// genuinely painted there at all (not `display: none`, not covered by
		// a later sibling), which its center unambiguously proves.
		const originalPointerEvents = pinEl.style.pointerEvents;
		pinEl.style.pointerEvents = 'auto';
		const elementAtPinCenter = document.elementFromPoint(
			pinCenterX,
			pinCenterY,
		);
		pinEl.style.pointerEvents = originalPointerEvents;

		return {
			tile: rectOf(tileEl),
			pin: rectOf(pinEl),
			nameInput: rectOf(nameInputEl),
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
 * against whatever CSS/viewport the caller has already set up on `page`. */
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

test.describe('profile icon-picker pencil-pin geometry (#992, real browser)', () => {
	test('the pin overhangs the tile, is not clipped by the drawer/drawer-body, and does not collide with neighbours (desktop width)', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.setContent(buildDrawerPage(css));

		await assertPinOverhangsAndIsNotClipped(page);
	});

	// Issue #992's own callout: "Check it at narrow widths too, where the
	// grid collapses to one column."
	test('still overhangs and is not clipped at the narrow single-column breakpoint', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		await page.setViewportSize({ width: 375, height: 800 });
		await page.setContent(buildDrawerPage(css));

		await assertPinOverhangsAndIsNotClipped(page);
	});

	// Geometry regression proof: reproduces the reviewer's exact mutation —
	// `right: 0` (this branch's `right: -4px`) changed to `right: 999px`,
	// displacing the pin far from the tile's corner. Both
	// icon-color-picker.test.tsx and profile-icon-picker-pin-contrast.test.ts
	// stayed green under this exact mutation (9/9) because neither asserts
	// geometry — this spec is the one that must fail.
	test('a right:999px mutation (displacing the pin far from the corner) is caught', async ({
		page,
	}) => {
		const css = readCompiledAppCss();
		const mutatedCss = `${css}\n.publy-profile-detail-tile-pin{right:999px}`;
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.setContent(buildDrawerPage(mutatedCss));

		await expect(assertPinOverhangsAndIsNotClipped(page)).rejects.toThrow();
	});
});
