import { expect, test, type Page } from '@playwright/test';

import { readCompiledAppCss } from './helpers/compiled-app-css';
import {
	CHECKBOX_RING_PX,
	FOCUS_RING_FAMILY_PX,
	OUTLINE_TOKEN_ALLOWLIST,
} from './helpers/compiled-focus-ring-pins';
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
 *
 * #1379 additionally pins the `outline` member of `:focus-visible`: every
 * probed primitive must paint the contractual outline (`2px solid
 * var(--publy-focus-ring)`, DESIGN.md "Focus rings") unless it is explicitly
 * allowlisted as a box-shadow-ring-only primitive. The allowlist carries the
 * DESIGN.md citation, so a silent drift in EITHER direction goes red.
 */

/** WCAG 2.x non-text contrast floor for focus indicators — the same floor
 * the vitest token guard enforces on `--publy-focus-ring`. */
const CONTRAST_FLOOR = 3.0;

const PROBE_ATTR = 'data-e2e-focus-probe';

/** #1379/#1415 — probes allowed to rely on the box-shadow ring ALONE at
 * `:focus-visible`, i.e. allowed to paint NO outline. Lives in
 * `helpers/compiled-focus-ring-pins.ts` so the structural half of the same
 * contract (`assertFocusRingUtilitiesPinned`) and this rendered half read
 * ONE list: adding a primitive here silently opts it out of BOTH the
 * outline-absence assertion below AND the ring-presence assertion — exactly
 * why the list carries the DESIGN.md citation next to every entry. Every
 * member is documented there as the Tailwind ring family (`ring-3` at 3px,
 * `ring-2` for checkbox) over an `outline-none` reset. A probe NOT listed
 * here must paint the full contractual outline triad (solid, 2px,
 * `--publy-focus-ring`) — see `assertOutlineMemberOfFocusVisible`.
 */

/** Computed colours are compared channel-wise against the token with a 1/255
 * slack for engine-side gamma/colour-space rounding — Chromium may serialise
 * the winning declaration in oklch and resample it on the way out. Anything
 * looser would stop being a token assertion. */
const OUTLINE_TOKEN_CHANNEL_TOLERANCE = 1;

/** Paint-relevant engine styles shared by the resting baseline and the
 * focused read. */
type ProbePaint = {
	boxShadow: string;
	borderTopStyle: string;
	borderTopWidth: string;
	borderTopColor: string;
	outlineStyle: string;
	outlineWidth: string;
	outlineColor: string;
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
) => {
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

const gammaEncodeAll = ({ r, g, b }: { r: number; g: number; b: number }) => ({
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
				outlineStyle: styles.outlineStyle,
				outlineWidth: styles.outlineWidth,
				outlineColor: styles.outlineColor,
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
 * Reads `--publy-focus-ring` the way any consumer of the cascade would: off
 * `<html>` (where app.css defines it, `.dark` override included) through
 * `getComputedStyle`, then resolved to a computed colour on a scratch
 * element that is removed again. Deliberately NOT hard-coded here: a token
 * re-tune (or the landing-page local override pattern) can never stale-date
 * this assertion, and a renamed/removed token throws instead of comparing
 * loose.
 */
const readFocusRingTokenRgb = async (page: Page): Promise<Rgba> => {
	const serialized = await page.evaluate(() => {
		const value = window
			.getComputedStyle(document.documentElement)
			.getPropertyValue('--publy-focus-ring')
			.trim();
		if (!value) {
			throw new Error(
				'--publy-focus-ring is not defined on <html> — the token the ' +
					'outline focus contract is written against was renamed or removed',
			);
		}
		const scratch = document.createElement('div');
		document.body.appendChild(scratch);
		scratch.style.color = 'rgb(1, 2, 3)';
		const fallback = window.getComputedStyle(scratch).color;
		scratch.style.color = value;
		const resolved = window.getComputedStyle(scratch).color;
		scratch.remove();
		if (resolved === fallback) {
			throw new Error(
				`--publy-focus-ring did not resolve to a colour (raw: "${value}")`,
			);
		}
		return resolved;
	});
	return parseComputedColor(serialized);
};

/**
 * #1379 — the `outline` member of `:focus-visible`, read from the SAME
 * engine-resolved focused-path paint the box-shadow indicator is measured
 * from. The design-system contract is `outline: 2px solid
 * var(--publy-focus-ring)`; a primitive either paints exactly that, or it is
 * in `OUTLINE_TOKEN_ALLOWLIST` (box-shadow-ring-only per DESIGN.md) and must
 * paint NO outline at all. Both directions are asserted so the contract
 * cannot rot quietly in either direction: an outline beaten by a cascade
 * override fails HERE even when the shadow ring still paints, and an
 * allowlisted primitive growing an outline fails too — that is a design
 * decision someone must record, then move the id out of the list.
 */
const assertOutlineMemberOfFocusVisible = (
	probeId: string,
	focused: ProbePaint,
	tokenRgb: Rgba,
): void => {
	if (OUTLINE_TOKEN_ALLOWLIST.has(probeId)) {
		expect(
			focused.outlineStyle === 'none' ||
				Number.parseFloat(focused.outlineWidth) === 0,
			`${probeId}: allowlisted as a box-shadow-ring-only primitive ` +
				'(DESIGN.md "Focus rings": the ring utilities over ' +
				'`outline-none`) yet :focus-visible now computes outline ' +
				`${focused.outlineStyle} ${focused.outlineWidth} — a design ` +
				'decision changed the contract; move the id out of ' +
				'OUTLINE_TOKEN_ALLOWLIST deliberately.',
		).toBe(true);
		return;
	}

	const deviations: string[] = [];
	if (focused.outlineStyle !== 'solid') {
		deviations.push(
			`outlineStyle is "${focused.outlineStyle}", expected "solid"`,
		);
	}
	if (focused.outlineStyle !== 'none') {
		// Width only means anything when a style would actually paint; a
		// `none` style already failed above.
		const width = Number.parseFloat(focused.outlineWidth);
		if (!Number.isFinite(width) || Math.round(width) !== 2) {
			deviations.push(
				`outlineWidth is "${focused.outlineWidth}", expected "2px"`,
			);
		}
	}
	let paintedColor: Rgba | undefined;
	try {
		paintedColor = parseComputedColor(focused.outlineColor);
	} catch {
		deviations.push(
			`outlineColor "${focused.outlineColor}" is not a parseable computed ` +
				'colour',
		);
	}
	if (paintedColor) {
		const channelDelta = Math.max(
			Math.abs(paintedColor.r - tokenRgb.r),
			Math.abs(paintedColor.g - tokenRgb.g),
			Math.abs(paintedColor.b - tokenRgb.b),
		);
		if (
			channelDelta > OUTLINE_TOKEN_CHANNEL_TOLERANCE ||
			paintedColor.a !== tokenRgb.a
		) {
			deviations.push(
				`outlineColor is "${focused.outlineColor}", expected the ` +
					'--publy-focus-ring token resolved through getComputedStyle',
			);
		}
	}

	expect(
		deviations,
		`${probeId}: :focus-visible does not paint the contractual outline ` +
			'(`2px solid var(--publy-focus-ring)`) — ' +
			deviations.join('; '),
	).toHaveLength(0);
};

/**
 * Spread (px) of one serialized box-shadow layer: Chromium serialises
 * `<colour> <offset-x> <offset-y> <blur> <spread>`, so the spread is the last
 * whitespace-separated token.
 */
const boxShadowLayerSpreadPx = (rawLayer: string): number => {
	const parts = rawLayer.trim().split(/\s+/);
	return Number.parseFloat(parts[parts.length - 1] ?? '');
};

/**
 * #1415 adversarial round — the paint-existence bar for a candidate ring
 * layer, in whole 1/255 channel steps. A ring layer qualifies only if
 * compositing it over the surface shifts some channel by at least this much.
 *
 * Why 8: calibrated against the shipped treatments — the weakest is the
 * input/select/textarea halo (`ring-ring/30`), whose composited shift over
 * its own translucent surface measures in the tens of steps, so everything
 * the design system ships clears this bar with wide margin, while anything
 * below ~3% channel shift is imperceptible glow rather than an indicator.
 * This closes the fade hole found in the adversarial round: a ring faded to
 * a 2%-alpha tint of the ring token
 * (`red-m4-near-invisible-colour.txt`) kept its full 3px geometry yet
 * composites to a ~2-step shift, which slid under the original >=1-step
 * test — and a strict `alpha === 0` equality would have been an arbitrary
 * cliff just above it.
 */
const RING_MEMBER_MIN_CHANNEL_DELTA = 8;

/** Whether the layer colour composites to a visibly different surface —
 * the paint-existence test for a candidate ring layer. A fully (or
 * effectively) transparent or surface-matching ring colour must not count
 * toward the ring-width pin below. */
const layerPaintsOverSurface = (color: Rgba, surface: SurfaceRgb): boolean => {
	const composited = compositeOver(color, surface);
	const delta = Math.max(
		Math.abs(composited.r - surface.r),
		Math.abs(composited.g - surface.g),
		Math.abs(composited.b - surface.b),
	);
	return Math.floor(delta) >= RING_MEMBER_MIN_CHANNEL_DELTA;
};

/**
 * #1415 — the box-shadow-ring member of `:focus-visible` for the SAME
 * allowlisted probes whose outline absence `assertOutlineMemberOfFocusVisible`
 * asserts. The allowlist's bargain has two halves: such a primitive paints no
 * outline BECAUSE its documented focus indicator is the ring
 * (`focus-visible:ring-3` / `ring-2` + `focus-visible:border-ring`, DESIGN.md
 * "Focus rings"). Until #1415 only the outline half was measured, so a
 * primitive could keep `outline: none` and silently lose the ring — focus
 * becomes invisible while the guard stays green (the exact defect report).
 *
 * Measured as PAINT, not class strings: among the box-shadow layers that
 * APPEAR at focus relative to rest (same definition the contrast assertion
 * uses), at least one must actually paint over the element's surface (a
 * transparent ring colour composites to nothing and cannot qualify) AND its
 * spread must reach the probe's pinned ring width (3px family, checkbox 2px)
 * — so `ring-0`/`ring-1` regressions go red too. A later-layer rule shadowing
 * the ring utilities shows up here as missing or undersized paint by
 * construction, because this reads the engine-resolved result after the real
 * cascade.
 */
const assertBoxShadowRingMemberOfFocusVisible = (
	probeId: string,
	focused: ProbePaint,
	rest: ProbePaint,
	surface: SurfaceRgb,
): void => {
	if (!OUTLINE_TOKEN_ALLOWLIST.has(probeId)) {
		return;
	}
	const requiredPx =
		probeId === 'checkbox' ? CHECKBOX_RING_PX : FOCUS_RING_FAMILY_PX;

	const restKeys = new Set(
		parseBoxShadowLayers(rest.boxShadow).map((layer) => layer.key),
	);
	const qualifyingSpreadsPx = parseBoxShadowLayers(focused.boxShadow)
		.filter((layer) => !restKeys.has(layer.key))
		.filter((layer) => layerPaintsOverSurface(layer.color, surface))
		.map((layer) => boxShadowLayerSpreadPx(layer.key))
		.filter((spread) => Number.isFinite(spread));
	const widestNewLayerPx =
		qualifyingSpreadsPx.length > 0 ? Math.max(...qualifyingSpreadsPx) : 0;

	expect(
		widestNewLayerPx >= requiredPx,
		`${probeId}: missing focus ring at :focus-visible — the probe is ` +
			'allowlisted as a box-shadow-ring-only primitive (DESIGN.md ' +
			'"Focus rings"), so its focus indicator IS the ring, but the ' +
			'focused-path box-shadow gained no VISIBLE ring layer of at least ' +
			`${requiredPx}px spread (widest new painting layer: ` +
			`${widestNewLayerPx}px). The ring utilities were likely dropped, ` +
			'shrunk, recoloured to transparent, or shadowed in the cascade.',
	).toBe(true);
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
 *
 * Since #1379 every probe must ALSO satisfy the outline member: the
 * contractual `2px solid var(--publy-focus-ring)` at `:focus-visible`, or an
 * explicit `OUTLINE_TOKEN_ALLOWLIST` entry (see that constant).
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

	// The outline contract's reference colour, resolved straight from <html>
	// AFTER the compiled CSS is in the page — see readFocusRingTokenRgb for
	// why it is never hard-coded.
	const focusRingTokenRgb = await readFocusRingTokenRgb(page);

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
					outlineStyle: styles.outlineStyle,
					outlineWidth: styles.outlineWidth,
					outlineColor: styles.outlineColor,
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

		assertOutlineMemberOfFocusVisible(probeCase.id, styles, focusRingTokenRgb);
		assertBoxShadowRingMemberOfFocusVisible(
			probeCase.id,
			styles,
			rest,
			surface,
		);
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
		 * real cascade over Tailwind's layered `focus-visible:*` utilities —
		 * plus, since #1379, the `outline:none !important` half of the same
		 * defect class on the outline-contract primitives — and the assertion
		 * above must go red on BOTH. This is the property the old vitest
		 * simulator could never have: its class-string model saw no difference
		 * at all.
		 */
		test('is caught by an unlayered rule beating the ring/outline utilities (CSS-mutation proof)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const mutatedCss = [
				css,
				/* NOTE: the planted hex below is deliberate test-only mutation
				 * content inside a spec fixture string — it is the defect being
				 * proven caught, not shipped styling. */
				'[data-e2e-focus-probe]{box-shadow:none;border:2px solid rgba(228,228,231,1)!important;outline:none!important}',
			].join('\n');

			await expect(
				assertRenderedFocusRingCompliant(page, mutatedCss),
			).rejects.toThrow(
				/NO visible focus indicator|focus-indicator colour|does not paint the contractual outline/,
			);
		});

		/**
		 * #1415 mutation proof, paired with the defect report: an allowlisted
		 * box-shadow-ring primitive that KEEPS `outline: none` (and even keeps
		 * the `focus-visible:border-ring` repaint) but loses its RING must go
		 * red naming the primitive and the missing ring. The defect is
		 * reproduced at cascade level on the REAL compiled stylesheet: an
		 * appended UNLAYERED rule resets the probe's `--tw-ring-shadow` to the
		 * property's invisible initial (`0 0 #0000`), which wins over the
		 * layered `focus-visible:ring-3` utility — the focused box-shadow then
		 * carries only the same ring layer it already had at rest (i.e. NO
		 * ring appeared) while the border repaint keeps the older assertions
		 * satisfied. Exactly the #1415 blind spot: before this change the
		 * guard stayed green here (see
		 * `.dump/red-baseline-guard-green-with-defect.txt`; the paired
		 * source-level drop of `focus-visible:ring-3` from input.tsx goes red
		 * with the same message — `.dump/red-input-ring-dropped.txt`).
		 */
		test('is caught when an allowlisted primitive loses its ring but keeps outline:none (ring-drop mutation proof)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const mutatedCss = [
				css,
				/* NOTE: the planted rule below is deliberate test-only mutation
				 * content inside a spec fixture string — it reproduces the #1415
				 * defect (invisible keyboard focus on input) to prove it caught. */
				'[data-e2e-focus-probe="input"]{--tw-ring-shadow:0 0 #0000}',
			].join('\n');

			await expect(
				assertRenderedFocusRingCompliant(page, mutatedCss),
			).rejects.toThrow(/input.*missing focus ring|missing focus ring/i);
		});

		/**
		 * #1415 adversarial-round pin (see
		 * `.dump/red-m4-near-invisible-colour.txt`): the ring can survive
		 * GEOMETRICALLY (full 3px spread, layered utilities intact) yet be
		 * faded to imperceptibility — here recoloured to a 2%-alpha tint of
		 * the ring token, which kept the full 3px spread while compositing to
		 * a ~2-step channel shift, sliding under the guard's original >=1
		 * paint-existence step. The ring member now requires a meaningful
		 * composited shift (RING_MEMBER_MIN_CHANNEL_DELTA), so a fade like
		 * this names the primitive and the missing ring instead of passing.
		 */
		test('is caught when the ring keeps its width but fades below perceptibility (colour-fade mutation proof)', async ({
			page,
		}) => {
			const css = readCompiledAppCss();
			const mutatedCss = [
				css,
				/* NOTE: the planted rule below is deliberate test-only mutation
				 * content inside a spec fixture string — it reproduces the fade
				 * hole found in the #1415 adversarial round to prove it closed. */
				'[data-e2e-focus-probe="input"]{' +
					'--tw-ring-color:color-mix(in oklab,var(--ring) 2%,transparent)}',
			].join('\n');

			await expect(
				assertRenderedFocusRingCompliant(page, mutatedCss),
			).rejects.toThrow(/input.*missing focus ring|missing focus ring/i);
		});
	},
);
