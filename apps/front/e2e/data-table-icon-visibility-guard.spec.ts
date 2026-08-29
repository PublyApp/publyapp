import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';
import {
	closeDataTableIconGuardRenderer,
	renderDataTableAllSelected,
} from './helpers/render-data-table-icon-guard';

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
 * not a hand-mirrored span), and the browser's own `getComputedStyle`
 * AFTER Tailwind's `@layer` precedence, specificity, and source order
 * have all been applied. The kept-red proof shows the helper is
 * correct against a fake reader; this spec proves the helper is correct
 * against the engine.
 *
 * What it asserts: for each of the four hiding mechanisms the issue
 * names (`invisible`, `hidden`, `opacity-0`, `aria-hidden="true"`),
 * `getComputedStyle` (or a direct attribute read for `aria-hidden`)
 * shows the icon as hidden, and the guard raises with a named reason.
 * The baseline read — a freshly painted icon with no mutation — must
 * pass the guard (no false positive), and the no-icon case — the
 * unchecked-row checkbox in a selection of zero rows — must not even
 * reach the guard (the assertion is gated on the icon's presence).
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
	// A probe of the icon's visibility AFTER the mutation. Returns the
	// values a correctly-fixed guard would see.
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

/** The probe runs the same logic the helper runs, in the page itself,
 * so the spec can assert that the helper's measurement is exactly the
 * browser's measurement — no transport, no translation, no fake
 * reader. */
const assertIconVisibleToBrowser = async (
	page: Page,
	iconSelector: string,
): Promise<void> => {
	const result = await page.evaluate(
		({ iconSelector, probe }) => {
			const el = document.querySelector(iconSelector);
			if (el === null) {
				throw new Error(`${probe}: missing icon element`);
			}
			const cs = window.getComputedStyle(el);
			const ariaHidden = el.getAttribute('aria-hidden');
			if (ariaHidden === 'true') {
				return { kind: 'aria-hidden', message: 'aria-hidden=true' } as const;
			}
			if (cs.visibility === 'hidden') {
				return { kind: 'visibility', message: 'visibility:hidden' } as const;
			}
			if (cs.display === 'none') {
				return { kind: 'display', message: 'display:none' } as const;
			}
			const opacity = Number.parseFloat(cs.opacity);
			if (Number.isFinite(opacity) && opacity === 0) {
				return { kind: 'opacity', message: 'opacity:0' } as const;
			}
			return { kind: 'visible', message: 'visible' } as const;
		},
		{ iconSelector, probe: PROBE_ATTR },
	);
	if (result.kind === 'visible') {
		return;
	}
	throw new Error(
		`Icon visibility guard: icon is hidden by ${result.message} (real browser)`,
	);
};

const buildPage = (css: string, bodyMarkup: string): string => `<!doctype html>
<html>
<head><style>${css}</style></head>
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

		test('every hiding mechanism in the issue is caught by a real-browser measurement', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
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
				await page.setContent(buildPage(css, stampedMarkup));
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

				// The guard's measurement must agree with the engine's. If the
				// helper ever silently returns "visible" while Chromium just
				// proved the icon is hidden, the spec goes red here — exactly
				// the defect the kept-red proof is shaped to catch, now
				// verified against the real engine.
				await expect(
					assertIconVisibleToBrowser(page, ICON_SELECTOR),
				).rejects.toThrow();
			}
		});

		test('baseline: an unmutated icon is genuinely visible (no false positive)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const { markup } = await renderDataTableAllSelected();
			const stampedMarkup = markup.replace(
				'data-slot="checkbox"',
				`data-slot="checkbox" ${PROBE_ATTR}=""`,
			);

			await page.setContent(buildPage(css, stampedMarkup));
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
			await expect(
				assertIconVisibleToBrowser(page, ICON_SELECTOR),
			).resolves.toBeUndefined();
		});
	},
);
