import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';
import {
	closeDataTableIconGuardRenderer,
	getIconGuardBrowserScript,
	renderDataTableAllSelected,
} from './helpers/render-data-table-icon-guard';

declare global {
	interface Window {
		/** The real guard bundle injected by `getIconGuardBrowserScript` — see
		 * `helpers/icon-guard-browser-entry.ts`. */
		__iconVisibilityGuard?: {
			assertIconIsVisible: (element: Element, context: string) => void;
		};
	}
}

/**
 * #1799 — the icon visibility guard's real-browser proof.
 *
 * The kept-red proof at
 * `apps/front/tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`
 * demonstrates the helper's measurement contract by feeding it a fake
 * `ComputedStyleReader` that returns the values Chromium would for each
 * mutation. That proof stays in the vitest lane (no browser required) so
 * every unit-lane contributor gets the red-then-green signal without
 * installing Chromium. The LOAD-BEARING check, however, is the one
 * here: a real Chromium page with the real compiled production
 * stylesheet, the real `DataTable` markup (rendered through Vite SSR
 * with the real `Checkbox` primitive and the real `IconCheck` icon —
 * not a hand-mirrored span), and the REAL guard module running in the
 * page: `getIconGuardBrowserScript` bundles
 * `src/components/table/data-table-icon-visibility-guard.ts` verbatim
 * (esbuild, once per worker) and the spec calls that bundle's
 * `assertIconIsVisible` against the live DOM, its default reader being
 * the page's own `window.getComputedStyle` — Chromium's measurement,
 * AFTER Tailwind's `@layer` precedence, specificity, and source order
 * have all been applied. The unit contract test at
 * `src/components/table/data-table-icon-visibility-guard.test.ts` proves
 * measurement-vs-enumeration with a fake reader; this spec proves the
 * real guard is correct against the engine.
 *
 * What it asserts: for each of the four hiding mechanisms the issue
 * names (`invisible`, `hidden`, `opacity-0`, `aria-hidden="true"`),
 * the raw engine probe (`getComputedStyle`, or a direct attribute read
 * for `aria-hidden`) shows the icon as hidden, AND the bundled real
 * guard raises with a named reason. The baseline read — a freshly
 * painted icon with no mutation — must pass the real guard (no false
 * positive). The spec never re-implements the measurement: it probes
 * raw engine values for the mutation sanity check and delegates the
 * decision to the guard's own bundled code.
 *
 * Hermetic like `breadcrumb-entity-name-truncation.spec.ts`: no login,
 * no backend, no docker-compose stack — runs in the dedicated
 * `chromium-hermetic-source` Playwright project. The single asset
 * `readCompiledAppCss()` pulls in is the same one the focus-ring
 * cascade spec already builds once per process, so the build cost is
 * shared.
 */

/** The four hiding mechanisms the brief names. Each entry names the
 * mutation applied to the icon and the `getComputedStyle` / DOM
 * attribute read that MUST agree the icon is hidden. */
type Mutation = {
	label: string;
	mutate: (page: Page, iconSelector: string) => Promise<void>;
	// A probe of the RAW ENGINE state AFTER the mutation. Returns the
	// values Chromium computed for the icon; the spec asserts these to
	// prove the mutation actually hid the icon, independent of the guard.
	readHiddenState: (
		page: Page,
		iconSelector: string,
	) => Promise<{
		visibility: string;
		display: string;
		opacity: number;
		ariaHidden: string | null;
	}>;
};

const PROBE_ATTR = 'data-icon-guard-probe';

const MUTATIONS: ReadonlyArray<Mutation> = [
	{
		label: 'invisible (Tailwind → visibility:hidden)',
		mutate: async (page, iconSelector) => {
			await page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					el.classList.add('invisible');
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
		readHiddenState: async (page, iconSelector) => {
			return page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					const cs = window.getComputedStyle(el);
					return {
						visibility: cs.visibility,
						display: cs.display,
						opacity: Number.parseFloat(cs.opacity),
						ariaHidden: el.getAttribute('aria-hidden'),
					};
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
	},
	{
		label: 'hidden (Tailwind → display:none)',
		mutate: async (page, iconSelector) => {
			await page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					el.classList.add('hidden');
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
		readHiddenState: async (page, iconSelector) => {
			return page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					const cs = window.getComputedStyle(el);
					return {
						visibility: cs.visibility,
						display: cs.display,
						opacity: Number.parseFloat(cs.opacity),
						ariaHidden: el.getAttribute('aria-hidden'),
					};
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
	},
	{
		label: 'opacity-0 (Tailwind → opacity:0)',
		mutate: async (page, iconSelector) => {
			await page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					el.classList.add('opacity-0');
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
		readHiddenState: async (page, iconSelector) => {
			return page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					const cs = window.getComputedStyle(el);
					return {
						visibility: cs.visibility,
						display: cs.display,
						opacity: Number.parseFloat(cs.opacity),
						ariaHidden: el.getAttribute('aria-hidden'),
					};
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
	},
	{
		label: 'aria-hidden="true" on the icon',
		mutate: async (page, iconSelector) => {
			await page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					el.setAttribute('aria-hidden', 'true');
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
		readHiddenState: async (page, iconSelector) => {
			return page.evaluate(
				({ iconSelector, probe }) => {
					const el = document.querySelector(iconSelector);
					if (el === null) {
						throw new Error(`${probe}: missing icon element`);
					}
					const cs = window.getComputedStyle(el);
					return {
						visibility: cs.visibility,
						display: cs.display,
						opacity: Number.parseFloat(cs.opacity),
						ariaHidden: el.getAttribute('aria-hidden'),
					};
				},
				{ iconSelector, probe: PROBE_ATTR },
			);
		},
	},
];

/**
 * Calls the REAL guard module against the icon in the live DOM.
 *
 * The module (`data-table-icon-visibility-guard.ts`) is bundled verbatim
 * into the page by `getIconGuardBrowserScript` and exposed as
 * `window.__iconVisibilityGuard` by `icon-guard-browser-entry.ts` — see the
 * entry file for why this is the guard's own code, not a copy. The guard's
 * default reader is the page's `window.getComputedStyle`, Chromium's own
 * measurement. An `ok: false` verdict therefore means the real measurement
 * code, reading the real engine, reported a named reason.
 */
const assertRealIconGuard = async (
	page: Page,
	iconSelector: string,
): Promise<{ ok: boolean; message?: string }> => {
	return page.evaluate(
		({ iconSelector, probe }) => {
			const el = document.querySelector(iconSelector);
			if (el === null) {
				throw new Error(`${probe}: missing icon element`);
			}
			const guard = window.__iconVisibilityGuard;
			if (guard === undefined || guard.assertIconIsVisible === undefined) {
				throw new Error(
					`${probe}: the icon guard bundle was not injected into the page`,
				);
			}
			try {
				guard.assertIconIsVisible(el, 'e2e icon visibility guard');
				return { ok: true } as const;
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				} as const;
			}
		},
		{ iconSelector, probe: PROBE_ATTR },
	);
};

const buildPage = (
	css: string,
	bodyMarkup: string,
	guardScript: string,
): string => `<!doctype html>
<html>
<head><style>${css}</style><script>${guardScript}</script></head>
<body>${bodyMarkup}</body>
</html>`;

const ICON_SELECTOR = `[${PROBE_ATTR}] [data-icon="check"]`;

// This proof pays a real production-build cost: `readCompiledAppCss()`
// performs a build the first time any test in this file's dedicated
// `chromium-hermetic-source` Playwright project calls it, and with that
// project configured at `workers: 1` this means that on the passing path
// both tests share one process and one build. A failure in the first test
// can trigger a worker restart on the same file, so the second test may
// rebuild. Measured around 30s for that build on CI runners; 180s budget
// keeps 6× headroom.
test.setTimeout(180_000);

test.describe(
	'DataTable icon visibility guard (#1799, real browser)',
	{ tag: ['@design', '@1799'] },
	() => {
		test.afterAll(async () => {
			await closeDataTableIconGuardRenderer();
		});

		test('every hiding mechanism in the issue is caught by the real guard measured in-page', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const guardScript = await getIconGuardBrowserScript();
			const { markup } = await renderDataTableAllSelected();

			// Stamp the header checkbox so the spec's selector pinpoints the
			// real shipping element. The stamp carries the production
			// `data-slot="checkbox"` attribute the icon visibility guard
			// targets; we add ONE extra attribute (`data-icon-guard-probe`)
			// to the same node so the spec's selector is unambiguous without
			// overwriting anything the production code reads.
			const stampedMarkup = markup.replace(
				'data-slot="checkbox"',
				`data-slot="checkbox" ${PROBE_ATTR}=""`,
			);

			for (const mutation of MUTATIONS) {
				await page.setContent(buildPage(css, stampedMarkup, guardScript));
				await mutation.mutate(page, ICON_SELECTOR);

				// The engine-side measurement must show the icon as hidden.
				const state = await mutation.readHiddenState(page, ICON_SELECTOR);
				if (mutation.label.startsWith('invisible')) {
					expect(
						state.visibility,
						`${mutation.label}: real-browser visibility must be 'hidden'`,
					).toBe('hidden');
				} else if (mutation.label.startsWith('hidden')) {
					expect(
						state.display,
						`${mutation.label}: real-browser display must be 'none'`,
					).toBe('none');
				} else if (mutation.label.startsWith('opacity-0')) {
					expect(
						state.opacity,
						`${mutation.label}: real-browser opacity must be 0`,
					).toBe(0);
				} else if (mutation.label.startsWith('aria-hidden')) {
					expect(
						state.ariaHidden,
						`${mutation.label}: real-browser aria-hidden must be 'true'`,
					).toBe('true');
				}

				// The real guard's own code must agree with the engine's raw
				// probe. The spec calls the REAL bundle (Chromium's
				// `getComputedStyle` as the default reader); if the guard
				// ever silently returns "visible" while the engine just
				// proved the icon hidden, the spec goes red here, naming
				// the guard's own reason.
				const guardVerdict = await assertRealIconGuard(page, ICON_SELECTOR);
				expect(
					guardVerdict.ok,
					`${mutation.label}: the real guard must agree with the engine — ${guardVerdict.message ?? 'no reason reported'}`,
				).toBe(false);
			}
		});

		test('baseline: an unmutated icon is genuinely visible (no false positive)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const guardScript = await getIconGuardBrowserScript();
			const { markup } = await renderDataTableAllSelected();
			const stampedMarkup = markup.replace(
				'data-slot="checkbox"',
				`data-slot="checkbox" ${PROBE_ATTR}=""`,
			);

			await page.setContent(buildPage(css, stampedMarkup, guardScript));
			const state = await MUTATIONS[0].readHiddenState(page, ICON_SELECTOR);
			// No mutation: visibility is `visible`, display is `inline-block`
			// (the icon's own default — the `Checkbox.Indicator` is a
			// `grid place-content-center text-current` wrapper, the icon
			// itself is the inline child), opacity is 1, and aria-hidden is
			// null. The guard must agree the icon is visible.
			expect(state.visibility).toBe('visible');
			expect(state.display).not.toBe('none');
			expect(state.opacity).toBe(1);
			expect(state.ariaHidden).toBeNull();
			// The REAL guard, measured against Chromium's own
			// `getComputedStyle`, must not raise on the painted icon.
			const guardVerdict = await assertRealIconGuard(page, ICON_SELECTOR);
			expect(
				guardVerdict.ok,
				`baseline: the real guard must report the icon visible — ${guardVerdict.message ?? 'no reason reported'}`,
			).toBe(true);
		});
	},
);
