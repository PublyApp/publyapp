import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';
import {
	closeFocusRingRenderer,
	renderFocusProbeCases,
} from './helpers/render-focus-ring';

/**
 * #823 — the rendered focus-ring cascade proof.
 *
 * The vitest guard (`src/styles/focus-ring-contrast.test.ts`) simulated the
 * cascade from static class strings and therefore could not model `@layer`
 * precedence at all: an unlayered CSS rule setting `box-shadow`/`border`
 * unconditionally beats Tailwind's layered `focus-visible:*` ring utilities
 * in every real browser, yet the class strings still contain the utilities —
 * so the simulator kept certifying a focus indicator that was no longer
 * painted. Four independent reviewers converged on this exact blindness
 * (rounds 6 & 7 of the #806 review-fix loop). The product bug this guards
 * (missing indicators on primary buttons / page-size selects) was already
 * fixed; this spec exists so that CLASS of regression can never ship
 * silently again.
 *
 * What runs here instead: the REAL ui primitives (`ui/button`, `ui/badge`,
 * `ui/select` trigger, `ui/switch`, `ui/checkbox`, `ui/textarea`) rendered
 * through `react-dom/server` (via Vite's SSR module graph — see
 * `helpers/render-focus-ring-target.tsx`), painted inside a real Chromium
 * page against the REAL compiled production stylesheet
 * (`dist/client/assets/app-*.css` via `readCompiledAppCss()` — Tailwind v4
 * `@layer`s fully resolved BY THE ENGINE), traversed with REAL keyboard
 * events (`page.keyboard.press('Tab')`, so `:focus-visible` matches the way
 * it does for actual keyboard users), then measured with the browser's own
 * `getComputedStyle()` AFTER `@layer` precedence, specificity, and source
 * order have already been applied. No cascade is simulated anywhere in this
 * file.
 *
 * Hermetic like `breadcrumb-entity-name-truncation.spec.ts`: no login, no
 * backend, no docker-compose stack — runs in the dedicated
 * `chromium-hermetic-source` Playwright project. Scope note: this spec pins
 * the default rendered focus path of every shipping focusable primitive;
 * the `aria-invalid` ring combinations stay covered by the vitest guard's
 * token-contrast math, which needs no cascade model to compare two colours.
 */

/** WCAG 2.x non-text contrast floor for focus indicators — the same floor
 * the vitest token guard enforces on `--publy-focus-ring`. */
const CONTRAST_FLOOR = 3.0;

const PROBE_ATTR = 'data-e2e-focus-probe';

/** Paint-relevant engine styles shared by the resting baseline and the
 * focused read. */
type ProbePaint = {
	boxShadow: string;
	borderTopStyle: string;
	borderTopWidth: string;
	borderTopColor: string;
	backgroundColor: string;
};

/** Focused-path read: adds the html background so translucent probe
 * surfaces can be composited over the fixture's effective canvas. */
type FocusedProbeStyles = ProbePaint & {
	rootBackground: string;
};

/** The probe's OWN background composited over the page background — the
 * surface the focus indicator paints against. */
type SurfaceRgb = { r: number; g: number; b: number };

type Rgba = { r: number; g: number; b: number; a: number };

/** Chromium serialises a computed colour in ITS OWN colour space (CSS
 * Color 4): legacy `rgb()/rgba()` for sRGB-declared values, but `oklab()`,
 * `oklch()`, or `color(...)` when the winning declaration lived in another
 * space — and Tailwind v4's palette lives in oklch, so any token migration
 * can reintroduce these. All maths below therefore normalises through
 * sRGB. */
const CSS_COLOUR_FN_SOURCE = '(?:rgba?|oklab|oklch|color)\\(';

/** sRGB transfer function (WCAG 2.x): linear-light channel 0..1 → 0..255. */
const gammaEncodeSrgbChannel = (channel: number): number => {
	const clamped = Math.min(Math.max(channel, 0), 1);
	const encoded =
		clamped <= 0.0031308
			? clamped * 12.92
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	return encoded * 255;
};

const oklabToLinearSRGBChannels = (
	bigL: number,
	axisA: number,
	axisB: number,
): { r: number; g: number; b: number } => {
	const l = bigL + 0.3963377774 * axisA + 0.2158037573 * axisB;
	const m = bigL - 0.1055613458 * axisA - 0.0638541728 * axisB;
	const s = bigL - 0.0894841775 * axisA - 1.291485548 * axisB;
	return {
		r: 4.0767416621 * l ** 3 - 3.3077115913 * m ** 3 + 0.2309699292 * s ** 3,
		g: -1.2684380046 * l ** 3 + 2.6097574011 * m ** 3 - 0.3413193965 * s ** 3,
		b: -0.0041960863 * l ** 3 - 0.7034186147 * m ** 3 + 1.707614701 * s ** 3,
	};
};

const parseComputedColor = (value: string): Rgba => {
	const match = /^(rgba?|oklab|oklch|color)\(([^)]*)\)$/.exec(value.trim());
	if (!match) {
		throw new Error(`Unparseable computed colour value: "${value}"`);
	}
	const [, fn, inner] = match;
	const [channelPart, alphaPart] = inner.split('/');
	const alpha = alphaPart === undefined ? 1 : Number(alphaPart.trim());

	if (fn === 'oklab') {
		const [bigL, axisA, axisB] = channelPart.trim().split(/\s+/).map(Number);
		return {
			...gammaEncodeAll(oklabToLinearSRGBChannels(bigL, axisA, axisB)),
			a: alpha,
		};
	}
	if (fn === 'oklch') {
		const [bigL, chroma, hueDeg] = channelPart.trim().split(/\s+/).map(Number);
		const hueRad = (hueDeg * Math.PI) / 180;
		return {
			...gammaEncodeAll(
				oklabToLinearSRGBChannels(
					bigL,
					chroma * Math.cos(hueRad),
					chroma * Math.sin(hueRad),
				),
			),
			a: alpha,
		};
	}
	if (fn === 'color') {
		// `color(srgb R G B / a)` — drop the colourspace word, channels 0..1.
		const [, r, g, b] = channelPart.trim().split(/\s+/).map(Number);
		return {
			r: gammaEncodeSrgbChannel(r),
			g: gammaEncodeSrgbChannel(g),
			b: gammaEncodeSrgbChannel(b),
			a: alpha,
		};
	}
	// Legacy rgb()/rgba(): computed channels 0..255, alpha as 4th argument.
	const [r, g, b, legacyAlpha] = channelPart.trim().split(',').map(Number);
	return { r, g, b, a: legacyAlpha ?? alpha };
};

const gammaEncodeAll = ({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): { r: number; g: number; b: number } => ({
	r: gammaEncodeSrgbChannel(r),
	g: gammaEncodeSrgbChannel(g),
	b: gammaEncodeSrgbChannel(b),
});

const compositeOver = (fg: Rgba, bg: SurfaceRgb): SurfaceRgb => ({
	r: fg.r * fg.a + bg.r * (1 - fg.a),
	g: fg.g * fg.a + bg.g * (1 - fg.a),
	b: fg.b * fg.a + bg.b * (1 - fg.a),
});

const relativeLuminance = ({ r, g, b }: SurfaceRgb): number => {
	const linearize = (channel: number): number => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (a: SurfaceRgb, b: SurfaceRgb): number => {
	const lumA = relativeLuminance(a);
	const lumB = relativeLuminance(b);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Parses a computed `box-shadow` into its layers. Chromium serialises each
 * layer as `<colour> <offset-x> <offset-y> <blur> <spread>` and separates
 * layers with `, ` — colours themselves also contain `, ` but are followed
 * by a digit there, never by another `rgb(`/`rgba(`, so a lookahead on the
 * colour opener splits layers safely. The RAW layer string is kept as an
 * identity key so the rest/focus diff below compares whole layers, not
 * merely their colours.
 */
const parseBoxShadowLayers = (
	boxShadow: string,
): { key: string; color: Rgba }[] => {
	if (!boxShadow || boxShadow === 'none') {
		return [];
	}
	return boxShadow
		.split(new RegExp(`,\\s+(?=${CSS_COLOUR_FN_SOURCE})`))
		.map((rawLayer) => rawLayer.trim())
		.map((rawLayer) => {
			const colour = new RegExp(`${CSS_COLOUR_FN_SOURCE}[^)]*\\)`).exec(
				rawLayer,
			)?.[0];
			return colour
				? { key: rawLayer, color: parseComputedColor(colour) }
				: undefined;
		})
		.filter((layer): layer is { key: string; color: Rgba } => Boolean(layer));
};

type IndicatorCandidate = {
	label: string;
	color: Rgba;
};

/**
 * The paints that APPEAR or CHANGE at `:focus-visible`, compared against the
 * SAME element's resting state: new box-shadow layers plus a repaint of the
 * border colour. This is the honest engine-side definition of a focus
 * indicator — decorative shadows that already exist at rest (the buttons'
 * chrome treatment) are NOT the indicator and say nothing about cascade
 * health, while a ring beaten by an unlayered rule simply never shows up as
 * new paint at all.
 */
const focusIndicatorCandidates = (
	focused: ProbePaint,
	rest: ProbePaint,
): IndicatorCandidate[] => {
	const restKeys = new Set(
		parseBoxShadowLayers(rest.boxShadow).map((layer) => layer.key),
	);
	const candidates = parseBoxShadowLayers(focused.boxShadow)
		.filter((layer) => !restKeys.has(layer.key))
		.map((layer) => ({
			label: 'new box-shadow layer',
			color: layer.color,
		}));
	if (
		focused.borderTopStyle !== 'none' &&
		Number.parseFloat(focused.borderTopWidth) > 0 &&
		focused.borderTopColor !== rest.borderTopColor
	) {
		candidates.push({
			label: 'repainted focus border',
			color: parseComputedColor(focused.borderTopColor),
		});
	}
	return candidates;
};

/**
 * Reads the ENGINE-resolved styles for one probe. With `expectFocusVisible`
 * the probe must currently hold keyboard `:focus-visible` focus (the
 * focused-path read); without it the read captures the resting baseline.
 * Runs entirely browser-side after the cascade has been applied.
 */
const readProbeStyles = (
	page: Page,
	id: string,
	expectFocusVisible: boolean,
): Promise<FocusedProbeStyles> => {
	// The selector is built NODE-side (where PROBE_ATTR lives) and passed as
	// an argument — page.evaluate callbacks execute in the browser and can
	// only see their own arguments, never this module's constants.
	const selector = `[${PROBE_ATTR}="${id}"]`;
	return page.evaluate(
		({ probeSelector, expectFocus }) => {
			const el = document.querySelector(probeSelector);
			if (!(el instanceof HTMLElement)) {
				throw new Error(`probe ${probeSelector} disappeared from the DOM`);
			}
			if (
				expectFocus &&
				!(document.activeElement === el && el.matches(':focus-visible'))
			) {
				throw new Error(
					`probe ${probeSelector} does not hold :focus-visible focus at measure time`,
				);
			}
			const styles = window.getComputedStyle(el);
			return {
				boxShadow: styles.boxShadow,
				borderTopStyle: styles.borderTopStyle,
				borderTopWidth: styles.borderTopWidth,
				borderTopColor: styles.borderTopColor,
				backgroundColor: styles.backgroundColor,
				rootBackground: window.getComputedStyle(document.documentElement)
					.backgroundColor,
			};
		},
		{ probeSelector: selector, expectFocus: expectFocusVisible },
	);
};

/** The EFFECTIVE canvas behind a probe, resolved the way the engine paints:
 * a translucent element background composites over whatever is actually
 * behind it, and in this fixture that chain is html → body → the default
 * white canvas (`color-scheme: light`). Reading only one link of the chain
 * made translucent surfaces (e.g. `bg-input/50`) composite against black
 * and report phantom sub-floor ratios. */
const resolveEffectiveCanvasRgb = (pageBackgrounds: {
	body: string;
	root: string;
}): SurfaceRgb => {
	let canvas: SurfaceRgb = {
		r: 255,
		g: 255,
		b: 255,
	};
	for (const value of [pageBackgrounds.root, pageBackgrounds.body]) {
		const parsed = parseComputedColor(value);
		if (parsed.a > 0) {
			canvas = compositeOver(parsed, canvas);
		}
	}
	return canvas;
};

/**
 * The single load-bearing assertion of this spec, run against whatever
 * stylesheet the caller loaded into the page: every probe must be reachable
 * by a real keyboard Tab, satisfy `:focus-visible`, and GAIN a VISIBLE
 * focus indicator at focus time — measured as paint that appears or changes
 * relative to the same element's resting state, with the best new paint
 * clearing 3:1 against the element's actual surface. An unlayered override
 * that beat the layered utilities shows up here exactly as users experience
 * it: either no new paint at all, or only sub-floor paint, never a missing
 * utility in a class string.
 */
const assertRenderedFocusRingCompliant = async (
	page: Page,
	css: string,
): Promise<void> => {
	const probeCases = await renderFocusProbeCases();
	expect(
		probeCases.length,
		'the probe set must cover the shipping focusable primitives',
	).toBeGreaterThanOrEqual(6);

	await page.setContent(
		`<!doctype html><html><head><style>${css}</style></head><body>` +
			probeCases.map((probeCase) => probeCase.markup).join('\n') +
			'</body></html>',
	);
	await page.setViewportSize({ width: 1280, height: 720 });

	// Neutralise transitions/animations for THIS fixture only: the focused
	// reads below must observe the settled post-cascade paint, never a
	// mid-transition interpolation of it.
	await page.addStyleTag({
		content:
			'*, *::before, *::after { transition: none !important; animation: none !important; }',
	});

	// RESTING-state baselines, read from the pristine copy of every probe —
	// the indicator is defined as paint that APPEARS at focus, so the
	// before-state must be genuinely un-focused (keyboard traversal below
	// never touches these clones). The body backdrop colour is captured in
	// the same pass: translucent probe surfaces composite over it.
	const { restBySelector, restBodyBackground } = await page.evaluate(
		(selectors) => {
			const read = (el: Element) => {
				const styles = window.getComputedStyle(el);
				return {
					boxShadow: styles.boxShadow,
					borderTopStyle: styles.borderTopStyle,
					borderTopWidth: styles.borderTopWidth,
					borderTopColor: styles.borderTopColor,
					backgroundColor: styles.backgroundColor,
				};
			};
			return {
				restBySelector: Object.fromEntries(
					selectors.map((selector) => {
						const el = document.querySelector(selector);
						return [selector, el instanceof HTMLElement ? read(el) : null];
					}),
				),
				restBodyBackground: window.getComputedStyle(document.body)
					.backgroundColor,
			};
		},
		probeCases.map((probeCase) => `[${PROBE_ATTR}="${probeCase.id}"]`),
	);

	// Keyboard traversal in DOM order — the way real keyboard users reach
	// these controls. Each press MUST land on the next probe AND satisfy
	// :focus-visible; landing anywhere else means the probe set no longer
	// reflects the focusable surface and must fail loud, not drift silently.
	for (const probeCase of probeCases) {
		await page.keyboard.press('Tab');

		const probeSelector = `[${PROBE_ATTR}="${probeCase.id}"]`;
		const landedOnProbe = await page.evaluate((selector) => {
			const el = document.querySelector(selector);
			return (
				el instanceof HTMLElement &&
				document.activeElement === el &&
				el.matches(':focus-visible')
			);
		}, probeSelector);
		expect(
			landedOnProbe,
			`one keyboard Tab must land on probe ${probeCase.id} with ` +
				':focus-visible satisfied',
		).toBe(true);

		const styles = await readProbeStyles(page, probeCase.id, true);
		const rest = restBySelector[probeSelector];
		if (!rest) {
			throw new Error(`resting baseline missing for ${probeCase.id}`);
		}

		// The element's own background may be translucent (e.g.
		// `bg-input/50`); it composites over whatever the fixture's backdrop
		// actually paints — html/body when they declare a colour, else the
		// browser's white canvas.
		const surface = compositeOver(
			parseComputedColor(styles.backgroundColor),
			resolveEffectiveCanvasRgb({
				body: restBodyBackground,
				root: styles.rootBackground,
			}),
		);

		const candidates = focusIndicatorCandidates(styles, rest);

		expect(
			candidates.length,
			`${probeCase.id}: NO visible focus indicator survived the real ` +
				'cascade — no new box-shadow layer or repainted border appeared ' +
				'at :focus-visible (the exact #823 defect class)',
		).toBeGreaterThan(0);

		// One compliant boundary paint is enough: WCAG asks the indicator to
		// EXIST, not for every decorative layer that happens to appear with
		// it to clear the floor on its own.
		const bestRatio = Math.max(
			...candidates.map((candidate) =>
				contrastRatio(compositeOver(candidate.color, surface), surface),
			),
		);
		expect(
			bestRatio,
			`${probeCase.id}: best engine-resolved focus-indicator colour is ` +
				`${bestRatio.toFixed(2)}:1 against the element surface ` +
				`(floor ${CONTRAST_FLOOR}:1)`,
		).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
	}
};

test.describe(
	'focus ring cascade (#823, real browser)',
	{ tag: ['@design', '@823'] },
	() => {
		test.afterAll(async () => {
			await closeFocusRingRenderer();
		});

		test.setTimeout(180_000);

		test('every shipping primitive renders a >= 3:1 focus-visible indicator under the real compiled CSS', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			await assertRenderedFocusRingCompliant(page, css);
		});

		/**
		 * Mutation proof, mirroring `breadcrumb-entity-name-truncation.spec.ts`'s
		 * cascade-regression test. Rather than editing source (which would leave
		 * the working tree dirty for a test-only check), the #823 defect is
		 * reproduced EXACTLY as reviewers described it — an UNLAYERED appended
		 * rule setting `box-shadow`/`border` unconditionally, which wins the
		 * real cascade over Tailwind's layered `focus-visible:*` utilities — and
		 * the assertion above must go red on it. This is the property the old
		 * vitest simulator could never have: its class-string model saw no
		 * difference at all.
		 */
		test('is caught by an unlayered rule beating the ring utilities (CSS-mutation proof)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const mutatedCss = [
				css,
				/* NOTE: the planted hex below is deliberate test-only mutation
				 * content inside a spec fixture string — it is the defect being
				 * proven caught, not shipped styling. */
				'[data-e2e-focus-probe]{box-shadow:none;border:2px solid rgba(228,228,231,1)!important}',
			].join('\n');

			await expect(
				assertRenderedFocusRingCompliant(page, mutatedCss),
			).rejects.toThrow(/NO visible focus indicator|focus-indicator colour/);
		});
	},
);
