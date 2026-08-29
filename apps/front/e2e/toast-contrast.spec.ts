import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { toastVariantClassNames } from '../src/components/ui/toast-variants';
import {
	BROWSER_SCREENSHOT_DECODER_SNIPPET,
	BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET,
	SCREENSHOT_DATA_URL_PREFIX,
} from './helpers/toast-contrast-shared';

// The pixel reading measures the composited glyphs; at the default 1x render
// scale the fixture's 12px close glyph antialiases away its core colour and
// measures 2.7:1 while the product's computed fill is 4.05:1. Pin the render
// resolution so the guard measures the real, deterministic rendering (the
// WCAG floors hold at the pinned scale; a 1x probe would measure different
// absolute numbers, which is why the scale is fixed here rather than left to
// the runner).
test.use({ deviceScaleFactor: 2 });

// The suite's own leg under genuine contention is 19.9-24.0s of measurement
// work against the shipped 30s test timeout (round-15 I2, four legs at
// load 64-68 on 12 cores — ~80% occupancy, the round-13 flake). The
// `data-hydrated` wait is NOT the binding cost: it measured 0.31-1.20s in
// the same runs. This spec raises its own test timeout to 60s — 2.5x the
// measured leg, the cost that actually binds — and bounds the hydration
// wait at 30s in `openToastFixture`: a reachable bound, whose exhaustion
// surfaces as the locator's own diagnostic ~29s before the test timeout
// instead of the bare "Test timeout exceeded" that the 30s test timeout
// made of round 14's unreachable 30s attribute wait.
test.setTimeout(60_000);

/**
 * #998 browser-side toast contrast guard.
 *
 * This spec deliberately measures the real Sonner DOM after Chromium has
 * resolved the cascade. Sonner's un-layered stylesheet can beat app.css's
 * layered rules, so a source parser cannot know what the toast actually paints.
 *
 * Browser measurements: the hit-tested background stack at the sampled
 * point, flat computed gradients, resolved pseudo-element styles,
 * compositing properties on the whole ancestor chain, the close button's
 * actual offset parent/geometry, and — the reading that decides — a
 * screenshot of the target decoded to pixels. The sampled point is the
 * midpoint of the GLYPH AREA — the text's own line boxes (text targets) or
 * the painted shapes' boxes (glyph targets) — never the target box's
 * midpoint, which can sit well away from where the text actually is.
 * Modelled operations: the CSS painting algorithm (pseudo and overlay paint
 * order) and the WCAG 2 contrast formula. The model never reads or resolves
 * a source token, and it never asserts a colour: it only says which element
 * and which region to measure.
 *
 * THE CONTRAST NUMBER IS MEASURED, NOT MODELLED. It comes from the rendered
 * pixels of the screenshot: the surface is the modal colour of the target's
 * box (text targets) or of the ring immediately around the glyphs (glyph
 * targets), and the ink is the glyph-area pixel cluster with the strongest
 * contrast to that surface AMONG the pixels inside a reference glyph mask.
 * The mask is a reference render the browser itself paints: the target's own
 * text nodes re-rendered with the same computed font and letter-spacing into
 * an off-screen canvas (text targets), or the SVG's own markup re-rasterized
 * with its paint forced opaque (glyph targets). The mask answers the only
 * question the guard must ask — where does this pixel come from — by
 * provenance instead of shape: ink is what falls inside the mask, and any
 * paint outside it is not ink, however dense or fragmented it looks. A
 * contrast-donating overlay (one 1px bar, or two separated scanlines) is
 * foreign paint the moment it leaves the mask, and a thin legitimately
 * thin glyph — a title that is an em dash — is ink because the mask says so
 * (round-13 B1's false negative and false positive both die here). A wash
 * matching the modelled surface cannot inflate the number, because there is
 * no modelled surface in the measurement: the wash drags the measured ink to
 * its real contrast (round 9's α-sweep measured 1.36:1 at α 0.85, 1.03:1 at
 * α 0.99 while the model reported 15.64:1), and the guard fails it.
 *
 * The guard fails loudly, by element name, when it cannot determine the
 * painted result: opacity, filter, backdrop-filter or mix-blend-mode other
 * than the neutral values anywhere on the ancestor chain; inset shadows
 * whose band (offset, spread and blur) can reach the sampled point; text
 * shadows; background images that are not a flat linear gradient;
 * pseudo-elements that paint a background whose box, resolved from computed
 * styles, contains the sampled point and whose paint order is at or above
 * the opaque surface at that point — negative-z paint counts as above when
 * it lives inside the surface's own stacking context, where the CSS
 * painting algorithm places it between the surface's background and its
 * content; a pseudo that is transformed (`transform`, `translate`, `rotate`
 * or `scale`), whose painted box cannot be resolved from computed styles; a
 * click-through overlay (`pointer-events: none`) that paints a background,
 * is stacked above the opaque surface and intersects the glyph area; and
 *  the pixel reading itself: any glyph-area pixel that is neither the
 *  measured surface, nor the measured ink, nor a blend of the two is
 *  foreign paint — foreign pixels INSIDE the reference glyph mask, where
 *  the glyphs themselves paint, are an overlay and fail by name; foreign
 *  pixels that all fall OUTSIDE the mask mean the reference render and the
 *  paint disagree, and the guard says it cannot conclude rather than
 *  accusing an overlay (round-15 IMPORTANT 1 and MINOR 1). The measured
 *  contrast must stay above the legibility floor. The click-through scan and the pixel
 * reading are the checks that do not model the paint: the scan walks the
 * DOM unconditionally for overlays that hit testing cannot see at all, and
 * the pixel reading screenshots the target's box, decodes it in the page
 * and classifies every pixel inside the glyph area against the MEASURED
 * pair, naming anything else. Paint that reaches the glyphs but is
 * invisible to the model for any other reason — an outset shadow from a
 * neighbouring element, say — is exactly what the pixel reading exists to
 * see.
 *
 * What still escapes — declared, so the boundary is not mistaken for a
 * guarantee:
 * - Partial occlusion is bounded, not prohibited: an overlay that leaves the
 *   glyphs mostly legible passes, and the bound is a stated requirement, not
 *   a measured calibration — at least half of the glyph's OWN pixels (the
 *   strict reference mask, not the surrounding rectangle) must still show
 *   ink (`INK_SHARE_FLOOR`). A surface-coloured block that erases up to that
 *   bound still measures the surviving ink at its real ratio; WCAG says
 *   nothing about occlusion, so the ink share is the guard's own boundary
 *   and is declared as such, while the contrast RATIO stays the WCAG-derived
 *   legibility requirement.
 * - Pseudo-elements are resolved for background paint only; one that paints
 *   only glyphs or text without a background is not detected.
 * - `elementsFromPoint` cannot report pseudo-element boxes, so pseudo paint
 *   is read from resolved styles instead of hit tests; a positioned pseudo
 *   whose painted box cannot be resolved from computed styles fails loudly.
 * - The mask is only as faithful as the reference render: ink-coloured paint
 *   that lies exactly on the mask's own pixels is indistinguishable from the
 *   ink (which is also what legibility requires — the pixels the glyphs
 *   occupy, in the ink colour). A text configuration the reference cannot
 *   reproduce is detected, not enumerated: the paint and the mask disagree,
 *   the foreign pixels all fall outside the mask, and the guard reports the
 *   disagreement as an UNMODELLED outcome with the likely causes named,
 *   instead of asserting an overlay exists. The strongest-contrast rule
 *   still picks ONE ink cluster, so a target whose glyphs genuinely paint
 *   in more than one colour with differing contrast is measured at its
 *   strongest and needs its own measurement.
 * - Only mounted, opaque toasts are measured; enter/exit and hover
 *   intermediate states are out of scope.
 * - Text painted with `background-clip: text` resolves to a transparent
 *   computed fill and fails loudly rather than being measured.
 */

const TEXT_CONTRAST_FLOOR = 4.5;
const GLYPH_CONTRAST_FLOOR = 3;
// Ink attribution and the occlusion bound, in the same order the reading
// applies them:
//
// `MASK_INK_ALPHA`: the reference render's pixels at or above this opacity
// (0.5) are the glyph's OWN pixels — the stroke core, not the painter's
// antialiasing halo. The count of them is the denominator the ink share is
// measured against.
//
// `MASK_DILATION` (device px): the reference mask is dilated by this many
// device pixels before it decides what may be ink and what must be foreign,
// so the browser's own rasterization jitter (DOM text vs canvas text, the
// same font through two painters) never turns a pristine glyph edge into
// foreign paint. One device pixel at the pinned 2x scale is half a CSS
// pixel — enough slack for antialiasing drift, not enough to claim a
// neighbouring contrast-donating bar as glyph.
//
// `INK_SHARE_FLOOR`: the share of the glyph's OWN pixels that must still be
// ink — "ink" meaning on the ink side of the midpoint between the two
// measured colours (the antialiasing edge counts, a wash pushing toward the
// surface does not). This is a stated occlusion requirement, not a
// calibration from today's pixels and not a WCAG number (WCAG is silent on
// occlusion): "the glyph must still be more ink than erased". A wash of the
// surface colour, or a surface-coloured block, erases mask pixels
// one-for-one, so the share fires the moment more than half of a glyph's
// own pixels stop being ink. It is deliberately not a legibility floor —
// the contrast RATIO above is the legibility floor; this number only bounds
// how much of the glyph may be occluded before the reading refuses to
// report the survivor.
const MASK_INK_ALPHA = 0.5;
const MASK_DILATION = 1;
const INK_SHARE_FLOOR = 0.5;

const PIXEL_MATCH_TOLERANCE = 3;
const BLEND_MARGIN = 6;
const SURFACE_BAND_MARGIN = 4;
const THEMES = ['light', 'dark'] as const;
const VARIANTS = ['success', 'error', 'warning', 'info'] as const;
const VIEWPORTS = [
	{ height: 720, name: 'desktop', width: 1280 },
	{ height: 844, name: 'phone', width: 390 },
] as const;

type Theme = (typeof THEMES)[number];
type Variant = (typeof VARIANTS)[number];
type ViewportPreset = (typeof VIEWPORTS)[number];
type TargetKind = 'glyph' | 'text';
type Rgba = { r: number; g: number; b: number; a: number };
type BoxRect = { bottom: number; left: number; right: number; top: number };
type ContrastMeasurement = {
	background: Rgba;
	foreground: Rgba;
	ratio: number;
};

/**
 * The measured set must cover every semantic toast the product can raise —
 * including the neutral `default`. The `loading` class is the one deliberate
 * exception: the `ToastMethod` union has no `loading` member and nothing in
 * the product calls `toast.loading`/`toast.promise`, so the `loading` class
 * cannot be raised today and is excluded on that fact — not on what it
 * paints.
 *
 * The agreement is enforced at two levels, and both reject missing AND
 * extra members, so neither side can drift silently:
 * - type level: the raisable adapter's keys and the measured variant
 *   classes must name exactly the same members. This half is enforced by
 *   `pnpm --filter front typecheck` (a separate gate in the same
 *   `just ci-front` chain), not by this e2e run — Playwright strips types,
 *   so the type-level assignment below is a tautology at runtime. Growing
 *   `ToastMethod` together with the adapter (the paired product change)
 *   leaves the adapter with a method that has no measured class, which reds
 *   the type-level equality below; growing the union alone reds the
 *   adapter's own `satisfies Record<ToastMethod, …>` in `mutation-toast.ts`.
 * - runtime: the measured list is compared against the class map HERE, so a
 *   variant class with no measured toast reds this spec until one is
 *   measured.
 */
test('every product toast variant is contrast-measured', () => {
	type RaisableMethod =
		keyof typeof import('../src/lib/mutation-toast').toastLocalMutationResult;
	type MeasuredVariant = Exclude<
		keyof typeof toastVariantClassNames,
		'loading'
	>;
	type MissingMethods = Exclude<MeasuredVariant, RaisableMethod>;
	type ExtraMethods = Exclude<RaisableMethod, MeasuredVariant>;
	const exhaustive: [MissingMethods, ExtraMethods] extends [never, never]
		? true
		: false = true;
	expect(exhaustive).toBe(true);

	const measuredVariants = [...VARIANTS, 'default'];
	expect(measuredVariants.sort()).toEqual(
		Object.keys(toastVariantClassNames)
			.filter((name) => name !== 'loading')
			.sort(),
	);
	expect(Object.keys(toastVariantClassNames).sort()).toEqual(
		[...measuredVariants, 'loading'].sort(),
	);
});

const readBrowserPaint = async (
	target: Locator,
	kind: TargetKind,
): Promise<void> =>
	target.evaluate(
		(element, { classifierSnippet, targetKind }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Browser canvas colour resolver is unavailable');
			}

			// #1089: undecidable text paint (background-clip:text / transparent-fill / masked / opacity 0)
			// must fail BEFORE flat-tint or opacity measurements. Otherwise those generic messages win
			// and the round-4 shard goes red on the wrong reason. This is the preferred fix per brief.
			if (targetKind === 'text') {
				const earlyName = (layer: Element): string => {
					for (const [attr, fallback] of [
						['data-slot', ''],
						['data-testid', ''],
						['data-type', ''],
						['data-sonner-toast', 'toast'],
						['data-title', 'title'],
						['data-description', 'description'],
						['data-content', 'content'],
						['data-icon', 'icon'],
						['data-close-button', 'close button'],
						['data-button', 'button'],
					] as const) {
						if (layer.hasAttribute(attr)) {
							return layer.getAttribute(attr) || fallback;
						}
					}
					return layer.tagName.toLowerCase();
				};
				// eslint-disable-next-line no-new-func
				const earlyAssert = new Function(
					classifierSnippet + '\nreturn __publyAssertTextPaintIsMeasurable;',
				)() as (s: Record<string, string | undefined>, l: string) => void;
				const hasText = (c: Element): boolean =>
					Array.from(c.childNodes).some(
						(n) =>
							n.nodeType === Node.TEXT_NODE &&
							(n.textContent ?? '').trim() !== '',
					);
				const earlyPainters: Element[] = [element];
				for (const d of element.querySelectorAll('*')) {
					if (hasText(d)) {
						earlyPainters.push(d);
					}
				}
				for (const painter of earlyPainters) {
					const ps = getComputedStyle(painter);
					if (ps.display === 'none' || ps.visibility === 'hidden') {
						continue;
					}
					const label = earlyName(painter);
					earlyAssert(
						{
							backgroundClip: ps.backgroundClip,
							webkitBackgroundClip:
								ps.getPropertyValue('-webkit-background-clip') || undefined,
							webkitTextFillColor:
								ps.getPropertyValue('-webkit-text-fill-color') || undefined,
							color: ps.color,
							opacity: ps.opacity,
							maskImage: ps.getPropertyValue('mask-image') || undefined,
							mask: ps.getPropertyValue('mask') || undefined,
						},
						label,
					);
					for (
						let a: Element | null = painter.parentElement;
						a !== null;
						a = a.parentElement
					) {
						if (Number(getComputedStyle(a).opacity) === 0) {
							throw new Error(
								`${label} has undecidable text paint: transparent opacity 0 on ancestor ${earlyName(a)} — the glyphs are fully transparent and cannot be measured`,
							);
						}
						// Only need ancestors up to the toast; beyond toaster is page chrome not relevant but harmless.
						if (a === document.body) {
							break;
						}
					}
				}
			}

			const toSrgb = (color: string, source: string): string => {
				if (!CSS.supports('color', color)) {
					throw new Error(
						`${source} is not a browser-parseable colour: ${color}`,
					);
				}
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
				return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
			};

			/**
			 * The alpha of a raw computed colour. Every colour value is run
			 * through `toSrgb` FIRST so the alpha is read from a normalised
			 * `rgba(...)` string; indexing digits out of the raw value shifts on
			 * any colour function whose name contains a digit
			 * (`color(display-p3 1 0 0)` reads its blue channel as alpha) and
			 * would silently treat opaque wide-gamut paint as transparent.
			 * Unparseable values throw instead of reading as compliant.
			 */
			const paintAlpha = (color: string, source: string): number => {
				const normalised = toSrgb(color, source);
				const match = /^rgba\(\d+, \d+, \d+, ([\d.]+)\)$/u.exec(normalised);
				if (!match) {
					throw new Error(
						`${source} is not the expected normalised colour: ${normalised}`,
					);
				}
				return Number(match[1]);
			};

			const splitTopLevel = (value: string): string[] => {
				const parts: string[] = [];
				let depth = 0;
				let start = 0;
				for (let index = 0; index < value.length; index += 1) {
					const character = value[index];
					if (character === '(') {
						depth += 1;
					} else if (character === ')') {
						depth -= 1;
					} else if (character === ',' && depth === 0) {
						parts.push(value.slice(start, index).trim());
						start = index + 1;
					}
				}
				parts.push(value.slice(start).trim());
				return parts;
			};

			const colorFromStop = (stop: string): string => {
				const openingParenthesis = stop.indexOf('(');
				if (openingParenthesis === -1) {
					return stop.split(/\s+/u)[0] ?? '';
				}

				let depth = 0;
				for (let index = openingParenthesis; index < stop.length; index += 1) {
					const character = stop[index];
					if (character === '(') {
						depth += 1;
					} else if (character === ')') {
						depth -= 1;
						if (depth === 0) {
							return stop.slice(0, index + 1);
						}
					}
				}

				throw new Error(`Unbalanced computed gradient colour stop: ${stop}`);
			};

			const flatGradientColor = (image: string, source: string): string => {
				if (!image.startsWith('linear-gradient(') || !image.endsWith(')')) {
					throw new Error(
						`${source} has unsupported background image: ${image}`,
					);
				}

				const inner = image.slice('linear-gradient('.length, -1);
				const colors: string[] = [];
				for (const part of splitTopLevel(inner)) {
					const candidate = colorFromStop(part);
					if (CSS.supports('color', candidate)) {
						colors.push(toSrgb(candidate, `${source} gradient stop`));
					}
				}

				if (colors.length < 2) {
					throw new Error(
						`${source} gradient must have at least two parseable colour stops: ${image}`,
					);
				}
				if (colors.some((color) => color !== colors[0])) {
					throw new Error(
						`${source} gradient is not a flat painted tint: ${image}`,
					);
				}

				return colors[0];
			};

			/** Each comma-separated computed background-image layer, in paint order. */
			const backgroundImageLayers = (
				image: string,
				source: string,
			): string[] =>
				image === 'none'
					? []
					: splitTopLevel(image).map((layer) =>
							flatGradientColor(layer, source),
						);

			const elementName = (layer: Element): string => {
				for (const [attribute, fallback] of [
					['data-slot', ''],
					['data-testid', ''],
					['data-type', ''],
					['data-sonner-toast', 'toast'],
					['data-title', 'title'],
					['data-description', 'description'],
					['data-content', 'content'],
					['data-icon', 'icon'],
					['data-close-button', 'close button'],
					['data-button', 'button'],
				] as const) {
					if (layer.hasAttribute(attribute)) {
						return layer.getAttribute(attribute) || fallback;
					}
				}
				return layer.tagName.toLowerCase();
			};

			/**
			 * Whether an inset shadow's band can reach the sampled point. The
			 * shadow paints the whole border box except its un-shadowed interior
			 * (the border box translated by the shadow's offset and inset by its
			 * spread), and the band's inner edge is blurred by `blur` — so the
			 * point is reached when it lies inside the border box and either
			 * outside the interior at all (the solid band) or within `blur` of
			 * the interior's edge. A spread that inverts the interior
			 * (`left > right` or `top > bottom`) makes the entire border box the
			 * band, so it reaches any point inside the box.
			 */
			const insetShadowReachesPoint = (
				pointX: number,
				pointY: number,
				borderBox: { bottom: number; left: number; right: number; top: number },
				interior: { bottom: number; left: number; right: number; top: number },
				blur: number,
			): boolean => {
				const insideBorderBox =
					pointX >= borderBox.left &&
					pointX <= borderBox.right &&
					pointY >= borderBox.top &&
					pointY <= borderBox.bottom;
				if (!insideBorderBox) {
					return false;
				}
				if (interior.left > interior.right || interior.top > interior.bottom) {
					return true;
				}
				const outsideInterior =
					pointX <= interior.left ||
					pointX >= interior.right ||
					pointY <= interior.top ||
					pointY >= interior.bottom;
				if (outsideInterior) {
					return true;
				}
				return (
					Math.min(
						pointX - interior.left,
						interior.right - pointX,
						pointY - interior.top,
						interior.bottom - pointY,
					) < blur
				);
			};

			/**
			 * An inset shadow paints a band inside the box; it is rejected only
			 * when the band could reach the sampled point. Anything else — the
			 * ordinary menu shadow, an outset shadow, an edge highlight far from
			 * the sample — is paint the midpoint provably does not see.
			 */
			const assertInsetShadowsAvoidPoint = (
				style: CSSStyleDeclaration,
				rect: DOMRect,
				x: number,
				y: number,
				source: string,
			): void => {
				if (style.boxShadow === 'none') {
					return;
				}
				for (const shadow of splitTopLevel(style.boxShadow)) {
					if (!/\binset\b/u.test(shadow)) {
						continue;
					}
					const lengths = [...shadow.matchAll(/-?\d+(?:\.\d+)?px/gu)].map(
						(match) => Number(match[0].slice(0, -2)),
					);
					if (lengths.length < 4) {
						throw new Error(
							`${source} has an unparseable inset shadow ${shadow}`,
						);
					}
					const [offsetX, offsetY, blur, spread] = lengths;
					const interior = {
						left: rect.left + offsetX + spread,
						right: rect.right + offsetX - spread,
						top: rect.top + offsetY + spread,
						bottom: rect.bottom + offsetY - spread,
					};
					if (insetShadowReachesPoint(x, y, rect, interior, blur)) {
						throw new Error(
							`${source} has an inset shadow that can reach the sampled point: ${shadow}`,
						);
					}
				}
			};

			const assertSupportedPaint = (
				style: CSSStyleDeclaration,
				rect: DOMRect,
				x: number,
				y: number,
				source: string,
			): void => {
				if (style.opacity !== '1') {
					throw new Error(`${source} has unsupported opacity ${style.opacity}`);
				}
				if (style.filter !== 'none' || style.backdropFilter !== 'none') {
					throw new Error(
						`${source} has unsupported filter paint (${style.filter}; ${style.backdropFilter})`,
					);
				}
				if (style.mixBlendMode !== 'normal') {
					throw new Error(
						`${source} has unsupported mix-blend-mode ${style.mixBlendMode}`,
					);
				}
				assertInsetShadowsAvoidPoint(style, rect, x, y, source);
			};

			/**
			 * The pseudo-element's painted box in viewport coordinates, derived
			 * from its resolved styles. An absolutely positioned pseudo resolves
			 * against its originating element's containing block (its offset
			 * parent, or the viewport); a fixed one against the nearest
			 * transformed ancestor, or the viewport. An in-flow pseudo paints
			 * within the originating element's box, so that box is the
			 * conservative assumption — a backgrounded in-flow pseudo cannot be
			 * proven to avoid the point from computed styles alone. Returns
			 * `undefined` when a positioned pseudo's box is under-determined
			 * (the caller fails loudly rather than assume).
			 */
			const pseudoElementBox = (
				layer: Element,
				style: CSSStyleDeclaration,
			):
				| { bottom: number; left: number; right: number; top: number }
				| undefined => {
				const asPixels = (value: string): number | undefined => {
					if (value === 'auto') {
						return undefined;
					}
					const match = /^-?\d+(?:\.\d+)?px$/u.exec(value);
					if (match) {
						return Number(value.slice(0, -2));
					}
					return undefined;
				};

				let containing: BoxRect;
				if (style.position === 'absolute') {
					// An absolutely positioned pseudo's containing block is its
					// originating element's padding box when that element is
					// itself positioned, and only otherwise the nearest
					// positioned ancestor (the offset parent). Round 6 resolved
					// against the offset parent unconditionally, so a positioned
					// origin's band painted somewhere else entirely than the
					// resolved box said.
					const originPosition = getComputedStyle(layer).position;
					const offsetParent = (layer as HTMLElement).offsetParent;
					if (originPosition !== 'static') {
						containing = layer.getBoundingClientRect();
					} else if (offsetParent === null) {
						containing = {
							left: 0,
							right: innerWidth,
							top: 0,
							bottom: innerHeight,
						};
					} else {
						containing = offsetParent.getBoundingClientRect();
					}
				} else if (style.position === 'fixed') {
					containing = {
						left: 0,
						right: innerWidth,
						top: 0,
						bottom: innerHeight,
					};
					for (
						let candidate = layer.parentElement;
						candidate !== null;
						candidate = candidate.parentElement
					) {
						const candidateStyle = getComputedStyle(candidate);
						if (
							candidateStyle.transform !== 'none' ||
							candidateStyle.filter !== 'none' ||
							candidateStyle.backdropFilter !== 'none' ||
							candidateStyle.perspective !== 'none'
						) {
							containing = candidate.getBoundingClientRect();
							break;
						}
					}
				} else if (style.position === 'relative') {
					// A relatively positioned pseudo paints the origin's box
					// translated by its resolved offsets; when both inline
					// offsets are set the direction decides which one wins.
					const originRect = layer.getBoundingClientRect();
					const direction = getComputedStyle(layer).direction;
					const left = asPixels(style.left);
					const right = asPixels(style.right);
					const top = asPixels(style.top);
					const bottom = asPixels(style.bottom);
					let offsetX = 0;
					if (
						left !== undefined &&
						(right === undefined || direction === 'ltr')
					) {
						offsetX = left;
					} else if (right !== undefined) {
						offsetX = -right;
					}
					let offsetY = 0;
					if (top !== undefined) {
						offsetY = top;
					} else if (bottom !== undefined) {
						offsetY = -bottom;
					}
					return {
						left: originRect.left + offsetX,
						right: originRect.right + offsetX,
						top: originRect.top + offsetY,
						bottom: originRect.bottom + offsetY,
					};
				} else {
					return layer.getBoundingClientRect();
				}

				const left = asPixels(style.left);
				const right = asPixels(style.right);
				const top = asPixels(style.top);
				const bottom = asPixels(style.bottom);
				const width = asPixels(style.width);
				const height = asPixels(style.height);

				let leftEdge: number | undefined;
				let rightEdge: number | undefined;
				if (left !== undefined && width !== undefined) {
					leftEdge = containing.left + left;
					rightEdge = leftEdge + width;
				} else if (right !== undefined && width !== undefined) {
					rightEdge = containing.right - right;
					leftEdge = rightEdge - width;
				} else if (left !== undefined && right !== undefined) {
					leftEdge = containing.left + left;
					rightEdge = containing.right - right;
				}
				let topEdge: number | undefined;
				let bottomEdge: number | undefined;
				if (top !== undefined && height !== undefined) {
					topEdge = containing.top + top;
					bottomEdge = topEdge + height;
				} else if (bottom !== undefined && height !== undefined) {
					bottomEdge = containing.bottom - bottom;
					topEdge = bottomEdge - height;
				} else if (top !== undefined && bottom !== undefined) {
					topEdge = containing.top + top;
					bottomEdge = containing.bottom - bottom;
				}
				if (
					leftEdge === undefined ||
					rightEdge === undefined ||
					topEdge === undefined ||
					bottomEdge === undefined
				) {
					return undefined;
				}
				return {
					left: leftEdge,
					right: rightEdge,
					top: topEdge,
					bottom: bottomEdge,
				};
			};

			/**
			 * Pseudo-element paint is invisible to elementsFromPoint, so read the
			 * resolved pseudo styles directly. A pseudo-element that paints a
			 * background whose resolved box contains the sampled point would wash
			 * out the measured text — but only when its paint order is at or
			 * above the opaque surface that the point actually shows: a
			 * backgrounded pseudo stacked BELOW that surface (a `z-index: -1`
			 * decoration on an ancestor of the toast, say) changes no rendered
			 * pixel and must not fail the guard. One whose box cannot be resolved
			 * fails loudly rather than assume — including one whose paint is
			 * relocated by `transform`/`translate`/`rotate`/`scale`, whose box
			 * computed styles cannot describe (round-9 I1: a transform silently
			 * relocated the paint back onto the ink while the resolved box sat
			 * 400 px away and the guard substituted the compliant box). The
			 * shipped float (`::before` on the title) and sonner's own
			 * transparent hit-area pseudos pass, having no paint.
			 */
			const assertNoPseudoOverlay = (
				layer: Element,
				x: number,
				y: number,
				source: string,
				opaqueElement: Element,
			): void => {
				for (const pseudo of ['::before', '::after'] as const) {
					const style = getComputedStyle(layer, pseudo);
					if (style.content === 'none') {
						continue;
					}
					const image = style.backgroundImage;
					const backgroundColor = style.backgroundColor;
					const paint =
						image !== 'none' ||
						paintAlpha(backgroundColor, `${source}${pseudo} background`) !== 0;
					if (!paint) {
						continue;
					}
					if (
						!paintsAbove(
							pseudoPaintChain(layer, style),
							paintChain(opaqueElement),
						)
					) {
						continue;
					}
					const relocated = (
						[
							['transform', style.transform],
							['translate', style.translate],
							['rotate', style.rotate],
							['scale', style.scale],
						] as const
					).find(([, value]) => value !== 'none');
					if (relocated) {
						throw new Error(
							`${source}${pseudo} paints a background whose painted box cannot be resolved from computed styles (${relocated[0]}: ${relocated[1]}; position ${style.position}, width ${style.width}, height ${style.height}, inset ${style.top} ${style.right} ${style.bottom} ${style.left})`,
						);
					}
					const box = pseudoElementBox(layer, style);
					if (box === undefined) {
						throw new Error(
							`${source}${pseudo} paints a background whose painted box cannot be resolved from computed styles (position ${style.position}, width ${style.width}, height ${style.height}, inset ${style.top} ${style.right} ${style.bottom} ${style.left})`,
						);
					}
					if (
						x >= box.left &&
						x <= box.right &&
						y >= box.top &&
						y <= box.bottom
					) {
						throw new Error(
							`${source}${pseudo} paints a background over the sampled point: ${image !== 'none' ? image : backgroundColor}`,
						);
					}
				}
			};

			/**
			 * Paint-order resolution. An overlay — a pseudo-element, or a
			 * click-through element the scan finds — is only a defect when it is
			 * stacked at or above the opaque surface the point actually shows; a
			 * backgrounded decoration painted BELOW that surface changes no
			 * rendered pixel. Both `assertNoPseudoOverlay` and the click-through
			 * scan therefore compare stacking chains.
			 *
			 * A chain lists the element's own paint position and every
			 * context-creating ancestor's, innermost first. Each record names the
			 * stacking context the participant paints in (null = the root
			 * context), the painting step within it (negative-z < in-flow <
			 * positioned-auto < positive-z), the z-index and the DOM position.
			 * The root record of every chain participates in the root context,
			 * so two chains can be walked from the outside in; at the first
			 * divergent record the step decides, then the z-index, then the DOM
			 * position.
			 *
			 * When one chain is a proper prefix of the other (all of its records
			 * matched), the remaining records are all inside the DOM subtree of
			 * the element whose record just matched. Per the CSS painting
			 * algorithm a stacking context paints its element's own background
			 * first and everything else — including negative-z children — after
			 * it, so the verdict depends on which side holds the deeper records:
			 * - The overlay's chain still has records: the overlay paints inside
			 *   the opaque element's own stacking context (or a descendant of
			 *   it), hence over the surface's background — even at a negative
			 *   z-index, which the algorithm places between the background and
			 *   the in-flow content, exactly where it destroys text contrast.
			 * - The opaque element's chain still has records: the overlay is
			 *   itself a stacking-context ancestor of the surface, so its
			 *   background paints below the surface's own background.
			 */
			type PaintStep = 'negative' | 'in-flow' | 'positioned-auto' | 'positive';
			type PaintRecord = {
				context: Element | null;
				step: PaintStep;
				z: number;
				index: number;
			};
			const STEP_RANK = {
				negative: -1,
				'in-flow': 0,
				'positioned-auto': 1,
				positive: 2,
			} satisfies Record<PaintStep, number>;

			const paintStep = (position: string, zIndex: string): PaintStep => {
				if (position === 'static') {
					return 'in-flow';
				}
				if (zIndex === 'auto') {
					return 'positioned-auto';
				}
				if (Number(zIndex) < 0) {
					return 'negative';
				}
				return 'positive';
			};

			const paintZ = (position: string, zIndex: string): number => {
				if (position === 'static' || zIndex === 'auto') {
					return 0;
				}
				return Number(zIndex);
			};

			const createsStackingContext = (layer: Element | null): boolean => {
				if (layer === null) {
					return false;
				}
				const style = getComputedStyle(layer);
				if (style.position !== 'static' && style.zIndex !== 'auto') {
					return true;
				}
				if (style.transform !== 'none') {
					return true;
				}
				if (style.opacity !== '1') {
					return true;
				}
				if (style.filter !== 'none' || style.backdropFilter !== 'none') {
					return true;
				}
				if (style.perspective !== 'none') {
					return true;
				}
				return style.mixBlendMode !== 'normal';
			};

			const nearestStackingContext = (
				layer: Element | null,
			): Element | null => {
				for (
					let current = layer;
					current !== null;
					current = current.parentElement
				) {
					if (createsStackingContext(current)) {
						return current;
					}
				}
				return null;
			};

			const indexInParent = (layer: Element): number => {
				const parent = layer.parentElement;
				if (parent === null) {
					return -1;
				}
				return Array.prototype.indexOf.call(parent.children, layer);
			};

			const paintChain = (layer: Element): PaintRecord[] => {
				const ownStyle = getComputedStyle(layer);
				const records: PaintRecord[] = [
					{
						context: nearestStackingContext(layer.parentElement),
						step: paintStep(ownStyle.position, ownStyle.zIndex),
						z: paintZ(ownStyle.position, ownStyle.zIndex),
						index: indexInParent(layer),
					},
				];
				for (
					let current = layer.parentElement;
					current !== null;
					current = current.parentElement
				) {
					if (!createsStackingContext(current)) {
						continue;
					}
					const style = getComputedStyle(current);
					records.push({
						context: nearestStackingContext(current.parentElement),
						step: paintStep(style.position, style.zIndex),
						z: paintZ(style.position, style.zIndex),
						index: indexInParent(current),
					});
				}
				return records;
			};

			const pseudoPaintChain = (
				origin: Element,
				pseudoStyle: CSSStyleDeclaration,
			): PaintRecord[] => {
				const records: PaintRecord[] = [
					{
						context: createsStackingContext(origin)
							? origin
							: nearestStackingContext(origin.parentElement),
						step: paintStep(pseudoStyle.position, pseudoStyle.zIndex),
						z: paintZ(pseudoStyle.position, pseudoStyle.zIndex),
						// A pseudo paints as the originating element's first child.
						index: -1,
					},
				];
				for (
					let current: Element | null = origin;
					current !== null;
					current = current.parentElement
				) {
					if (!createsStackingContext(current)) {
						continue;
					}
					const style = getComputedStyle(current);
					records.push({
						context: nearestStackingContext(current.parentElement),
						step: paintStep(style.position, style.zIndex),
						z: paintZ(style.position, style.zIndex),
						index: indexInParent(current),
					});
				}
				return records;
			};

			const paintsAbove = (a: PaintRecord[], b: PaintRecord[]): boolean => {
				let aIndex = a.length - 1;
				let bIndex = b.length - 1;
				while (aIndex >= 0 && bIndex >= 0) {
					const aRecord = a[aIndex];
					const bRecord = b[bIndex];
					if (
						aRecord.context === bRecord.context &&
						aRecord.step === bRecord.step &&
						aRecord.z === bRecord.z &&
						aRecord.index === bRecord.index
					) {
						aIndex -= 1;
						bIndex -= 1;
						continue;
					}
					if (STEP_RANK[aRecord.step] !== STEP_RANK[bRecord.step]) {
						return STEP_RANK[aRecord.step] > STEP_RANK[bRecord.step];
					}
					if (aRecord.z !== bRecord.z) {
						return aRecord.z > bRecord.z;
					}
					return aRecord.index > bRecord.index;
				}
				if (aIndex < 0 && bIndex < 0) {
					return false;
				}
				if (aIndex >= 0) {
					return true;
				}
				return false;
			};

			const rect = element.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) {
				throw new Error('Contrast target has no painted box');
			}

			// The area the glyphs actually occupy: the text's own line boxes
			// (Range rects of every non-empty text node), or the painted shapes'
			// boxes. The model samples at ITS midpoint — a box midpoint can sit
			// 100+ px away from where the text is, which is where every paint
			// that matters would have to reach (round-7 B1), and the click-through
			// scan and the pixel cross-check intersect the same area.
			const computeGlyphArea = () => {
				const rects: DOMRect[] = [];
				if (targetKind === 'text') {
					const textNodes: Node[] = [];
					const collect = (candidate: Element): void => {
						for (const node of candidate.childNodes) {
							if (node.nodeType === Node.TEXT_NODE) {
								textNodes.push(node);
							}
						}
					};
					collect(element);
					for (const descendant of element.querySelectorAll('*')) {
						collect(descendant);
					}
					for (const node of textNodes) {
						if ((node.textContent ?? '').trim() === '') {
							continue;
						}
						const range = document.createRange();
						range.selectNodeContents(node);
						for (const textRect of range.getClientRects()) {
							rects.push(textRect);
						}
					}
				} else {
					for (const svgElement of element.querySelectorAll(
						'path, circle, ellipse, line, polyline, polygon, rect',
					)) {
						rects.push(svgElement.getBoundingClientRect());
					}
				}
				if (rects.length === 0) {
					throw new Error(
						`${elementName(element)} has no resolvable glyph area`,
					);
				}
				return {
					left: Math.min(...rects.map((textRect) => textRect.left)),
					right: Math.max(...rects.map((textRect) => textRect.right)),
					top: Math.min(...rects.map((textRect) => textRect.top)),
					bottom: Math.max(...rects.map((textRect) => textRect.bottom)),
				};
			};
			const glyphArea = computeGlyphArea();
			const x = glyphArea.left + (glyphArea.right - glyphArea.left) / 2;
			const y = glyphArea.top + (glyphArea.bottom - glyphArea.top) / 2;
			const hitStack = document.elementsFromPoint(x, y);
			const targetIndex = hitStack.indexOf(element);
			if (targetIndex === -1) {
				throw new Error(
					'Contrast target is absent from its own painted hit stack',
				);
			}
			// The opaque layer the point shows is resolved first: everything the
			// pseudo checks and the click-through scan compare against is stacked
			// relative to THIS surface. Walk the hit stack down and stop at the
			// first element that paints an opaque background.
			const seen = new Set<Element>();
			const findOpaqueElement = (): Element | null => {
				for (const layer of hitStack.slice(targetIndex)) {
					if (seen.has(layer)) {
						continue;
					}
					seen.add(layer);

					const name = elementName(layer);
					const style = getComputedStyle(layer);
					for (const layerColor of backgroundImageLayers(
						style.backgroundImage,
						name,
					)) {
						if (paintAlpha(layerColor, `${name} background-image`) === 1) {
							return layer;
						}
					}

					const backgroundColor = toSrgb(
						style.backgroundColor,
						`${name} background-color`,
					);
					if (paintAlpha(backgroundColor, `${name} background-color`) === 1) {
						return layer;
					}
				}
				return null;
			};
			const opaqueElement = findOpaqueElement();

			if (!opaqueElement) {
				throw new Error(
					'No opaque painted background found behind contrast target',
				);
			}

			// The hit stack above the target: only a painted background that hit
			// testing really sees can sit between the target and the surface.
			for (const paintedAbove of hitStack.slice(0, targetIndex)) {
				const aboveName = elementName(paintedAbove);
				assertNoPseudoOverlay(paintedAbove, x, y, aboveName, opaqueElement);
				if (element.contains(paintedAbove)) {
					const aboveStyle = getComputedStyle(paintedAbove);
					if (aboveStyle.backgroundImage !== 'none') {
						throw new Error(
							`${aboveName} paints a background over the sampled point: ${aboveStyle.backgroundImage}`,
						);
					}
					if (
						paintAlpha(
							aboveStyle.backgroundColor,
							`${aboveName} background`,
						) !== 0
					) {
						throw new Error(
							`${aboveName} paints a background over the sampled point: ${aboveStyle.backgroundColor}`,
						);
					}
					continue;
				}
				throw new Error(
					`${aboveName} unexpectedly paints above contrast target`,
				);
			}

			// From the target down to the opaque layer, everything the point sees:
			// assert the supported paint and the pseudo overlays of each layer.
			for (const layer of hitStack.slice(targetIndex)) {
				const name = elementName(layer);
				const style = getComputedStyle(layer);
				assertSupportedPaint(style, layer.getBoundingClientRect(), x, y, name);
				assertNoPseudoOverlay(layer, x, y, name, opaqueElement);
				if (layer === opaqueElement) {
					break;
				}
			}

			// Group compositing above the first opaque layer is invisible to the
			// paint stack below it, so walk the whole ancestor chain and assert
			// the properties that would composite the group over the page.
			for (
				let layer = element.parentElement;
				layer !== null;
				layer = layer.parentElement
			) {
				const name = elementName(layer);
				assertSupportedPaint(
					getComputedStyle(layer),
					layer.getBoundingClientRect(),
					x,
					y,
					name,
				);
				assertNoPseudoOverlay(layer, x, y, name, opaqueElement);
			}

			// The pixel reading decides the ink colour; the model's remaining job
			// here is to fail loudly on paint that would corrupt the reading —
			// opacity/filter/inset-shadow properties on every text-bearing
			// painter, and a text shadow. An unparseable computed fill also fails
			// loud (the pixels cannot be trusted to tell the story alone).
			if (targetKind === 'text') {
				const hasTextContent = (candidate: Element): boolean =>
					Array.from(candidate.childNodes).some(
						(node) =>
							node.nodeType === Node.TEXT_NODE &&
							(node.textContent ?? '').trim() !== '',
					);

				const textPainters: Element[] = [element];
				for (const descendant of element.querySelectorAll('*')) {
					if (hasTextContent(descendant)) {
						textPainters.push(descendant);
					}
				}

				// Shared classifier — browser twin injected via BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET.
				// The snippet is evaluated inside the page context via the outer `classifierSnippet` string.
				const evaluateClassifier = (
					style: Record<string, string | undefined>,
					label: string,
				): void => {
					// This closure runs inside page.evaluate — `classifierSnippet` is the outer arg.
					// We eval it here to define __publyAssertTextPaintIsMeasurable in this scope.
					// eslint-disable-next-line no-new-func
					const defs = new Function(
						classifierSnippet + '\nreturn __publyAssertTextPaintIsMeasurable;',
					)() as (s: Record<string, string | undefined>, l: string) => void;
					defs(style, label);
				};
				for (const painter of textPainters) {
					const painterStyle = getComputedStyle(painter);
					const painterName = elementName(painter);
					if (
						painterStyle.display === 'none' ||
						painterStyle.visibility === 'hidden'
					) {
						continue;
					}
					assertSupportedPaint(
						painterStyle,
						painter.getBoundingClientRect(),
						x,
						y,
						painterName,
					);
					evaluateClassifier(
						{
							backgroundClip: painterStyle.backgroundClip,
							webkitBackgroundClip:
								painterStyle.getPropertyValue('-webkit-background-clip') ||
								undefined,
							webkitTextFillColor:
								painterStyle.getPropertyValue('-webkit-text-fill-color') ||
								undefined,
							color: painterStyle.color,
							opacity: painterStyle.opacity,
							maskImage:
								painterStyle.getPropertyValue('mask-image') || undefined,
							mask: painterStyle.getPropertyValue('mask') || undefined,
						},
						painterName,
					);
					// Walk ancestors for opacity:0 — text inherits invisibility even if painter itself is opaque
					for (
						let ancestor: Element | null = painter.parentElement;
						ancestor !== null;
						ancestor = ancestor.parentElement
					) {
						const ancestorStyle = getComputedStyle(ancestor);
						if (Number(ancestorStyle.opacity) === 0) {
							throw new Error(
								`${painterName} has undecidable text paint: transparent opacity 0 on ancestor ${elementName(ancestor)} — the glyphs are fully transparent and cannot be measured`,
							);
						}
						if (ancestor === document.body) {
							break;
						}
					}
					if (painterStyle.textShadow !== 'none') {
						throw new Error(
							`${painterName} has unsupported text shadow ${painterStyle.textShadow}`,
						);
					}
					toSrgb(
						painterStyle.webkitTextFillColor || painterStyle.color,
						`${painterName} text fill colour`,
					);
				}
			} else {
				const svgElements = element.querySelectorAll(
					'path, circle, ellipse, line, polyline, polygon, rect',
				);
				let paintedCount = 0;
				for (const svgElement of svgElements) {
					const style = getComputedStyle(svgElement);
					assertSupportedPaint(
						style,
						svgElement.getBoundingClientRect(),
						x,
						y,
						`${elementName(element)} ${svgElement.tagName}`,
					);
					for (const property of ['fill', 'stroke'] as const) {
						const paint = style[property];
						if (paint === 'none') {
							continue;
						}
						const paintOpacity =
							property === 'fill' ? style.fillOpacity : style.strokeOpacity;
						if (paintOpacity !== '1') {
							throw new Error(
								`${elementName(element)} ${svgElement.tagName} has unsupported ${property}-opacity ${paintOpacity}`,
							);
						}
						toSrgb(
							paint,
							`${elementName(element)} ${svgElement.tagName} ${property}`,
						);
						paintedCount += 1;
					}
				}
				if (paintedCount === 0) {
					throw new Error(
						`${elementName(element)} has no parseable painted glyph`,
					);
				}
			}

			// The click-through scan: elements with `pointer-events: none` are
			// invisible to `elementsFromPoint` by definition, yet paint like any
			// other element. Walk the whole DOM unconditionally — not only when
			// another reading failed — for a click-through element that paints a
			// background, is stacked at or above the opaque surface and
			// intersects the glyph area computed above. Such an element is an
			// occlusion the model cannot enumerate; it fails loud by name.
			for (const candidate of document.querySelectorAll('body *')) {
				const style = getComputedStyle(candidate);
				if (style.pointerEvents !== 'none') {
					continue;
				}
				if (style.display === 'none' || style.visibility === 'hidden') {
					continue;
				}
				if (style.opacity === '0') {
					continue;
				}
				const rect = candidate.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) {
					continue;
				}
				if (
					rect.left >= glyphArea.right ||
					rect.right <= glyphArea.left ||
					rect.top >= glyphArea.bottom ||
					rect.bottom <= glyphArea.top
				) {
					continue;
				}
				const image = style.backgroundImage;
				const backgroundColor = style.backgroundColor;
				const paints =
					image !== 'none' ||
					paintAlpha(
						backgroundColor,
						`${elementName(candidate)} background`,
					) !== 0;
				if (!paints) {
					continue;
				}
				if (paintsAbove(paintChain(candidate), paintChain(opaqueElement))) {
					throw new Error(
						`${elementName(candidate)} is a click-through overlay painted above the toast surface and over the ${targetKind === 'text' ? 'text' : 'glyph'} area: ${image !== 'none' ? image : backgroundColor}`,
					);
				}
			}

			return undefined;
		},
		{
			classifierSnippet: BROWSER_TEXT_PAINT_CLASSIFIER_SNIPPET,
			targetKind: kind,
		},
	);

const measureContrast = async (
	target: Locator,
	kind: TargetKind,
	floor: number,
	label = 'contrast target',
): Promise<ContrastMeasurement> => {
	await readBrowserPaint(target, kind);
	return measurePaintedContrast(target, kind, floor, label);
};

const setTheme = async (page: Page, theme: Theme): Promise<void> => {
	const palette = await page.evaluate(async (nextTheme) => {
		const root = document.documentElement;
		root.classList.toggle('dark', nextTheme !== 'dark');
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
		const opposite =
			getComputedStyle(root).getPropertyValue('--publy-background');
		root.classList.toggle('dark', nextTheme === 'dark');
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
		return {
			hasDarkClass: root.classList.contains('dark'),
			painted: getComputedStyle(root).getPropertyValue('--publy-background'),
			opposite,
		};
	}, theme);
	expect(
		palette.hasDarkClass,
		`${theme} theme class must be the active state`,
	).toBe(theme === 'dark');
	// Self-check that the palette actually responded to the class; without it
	// a broken dark-variant selector would measure the light palette twice
	// and pass silently.
	expect(
		palette.painted,
		`${theme} palette must respond to the theme class`,
	).not.toBe(palette.opposite);
};

const rgbaLabel = ({ r, g, b, a }: Rgba): string =>
	`rgba(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)}, ${a.toFixed(3)})`;

/**
 * The reading that decides: screenshot the target's box, decode it in the
 * page, and MEASURE the pair the contrast number is computed from. The
 * surface is the modal colour of the target's box (text targets) or of the
 * ring immediately around the glyph area (glyph targets, whose box can be
 * dominated by the glyph itself); the ink is the glyph-area pixel cluster
 * with the strongest contrast to that surface AMONG the pixels inside the
 * reference glyph mask (see `paintReferenceMask` below) — the ink is tied to
 * the glyphs by provenance, not by shape: the mask is the browser's own
 * render of the same text in the same font, or of the SVG's own markup, so a
 * contrast-donating overlay (a 1px bar over the glyph rows, which the
 * strongest-contrast rule would otherwise adopt as the ink) is foreign paint
 * the moment it leaves the mask, and a legitimately thin glyph (an em dash
 * title) is ink because the mask claims its pixels. The WCAG ratio is
 * computed between the two measured colours. The model's only role is to say
 * which element and which region to measure — it never asserts a colour, so
 * a wash matching any modelled surface cannot inflate the number: the wash
 * drags the measured ink to its real contrast and the guard fails it
 * (round-9 B1, round-11 B1, round-13 B1).
 *
 * Every glyph-area pixel is then classified against the MEASURED pair:
 * surface, ink, blend (per-channel between the two, widened by the
 * antialiasing fuzz the browser's own text edges produce — measured at ±6
 * on the shipped fixture), or foreign. A single foreign pixel fails the
 * guard by name — it is paint an overlay put there (the outset-shadow
 * vector, invisible to every model reading). Three bounds keep the reading
 * honest at the ends:
 * - any pixel inside the mask that is neither surface, nor ink, nor a
 *   blend of the two — and any pixel OUTSIDE the mask that is not surface —
 *   is foreign, whatever its shape (the masked reading replaces the shape
 *   heuristic: the two-scanline donor and the single bar both red, the em
 *   dash stays green);
 * - the ink share — ink pixels over the glyph's OWN mask pixels — must stay
 *   at or above `INK_SHARE_FLOOR` (a stated occlusion requirement: a wash of
 *   the surface colour, or a surface-coloured block, erases mask pixels
 *   one-for-one, so more than half of a glyph's own pixels erased fires
 *   this bound even though the surviving ink still measures 15.6:1);
 * - the measured contrast must stay above the target's legibility floor.
 */
const measurePaintedContrast = async (
	target: Locator,
	kind: TargetKind,
	floor: number,
	label: string,
): Promise<ContrastMeasurement> => {
	// The screenshot waits for the element to be stable (the toast's
	// entrance animation), so the pixels and the geometry read in the
	// evaluate below come from the same settled frame.
	const screenshot = await target.screenshot();
	const report = await target.evaluate(
		async (
			element,
			{
				bandMargin,
				blendMargin,
				dataUrl,
				decoderSnippet,
				dilation,
				floor,
				kind,
				label,
				maskInkAlpha,
				minInkShare,
				tolerance,
			},
		) => {
			// Shared browser decoder — BROWSER_SCREENSHOT_DECODER_SNIPPET is the single source.
			// Keep decode in the browser (screenshot → browser canvas) so measured pixels are unchanged.
			// eslint-disable-next-line no-new-func
			const __publyDecodeScreenshot = new Function(
				decoderSnippet + '\nreturn __publyDecodeScreenshot;',
			)() as (d: string) => Promise<ImageData>;
			const __publyImageData = await __publyDecodeScreenshot(dataUrl);
			const canvas = {
				width: __publyImageData.width,
				height: __publyImageData.height,
			} as HTMLCanvasElement;
			const data = __publyImageData.data;

			const luminance = ([r, g, b]: number[]): number => {
				const linearize = (channel: number): number => {
					const value = channel / 255;
					if (value <= 0.04045) {
						return value / 12.92;
					}
					return ((value + 0.055) / 1.055) ** 2.4;
				};
				return (
					0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
				);
			};
			const contrast = (a: number[], b: number[]): number => {
				const la = luminance(a);
				const lb = luminance(b);
				return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
			};
			const modalColours = (
				pixels: number[][],
			): { average: number[]; count: number }[] => {
				const counts = new Map<string, number>();
				for (const pixel of pixels) {
					const key = `${pixel[0]},${pixel[1]},${pixel[2]}`;
					counts.set(key, (counts.get(key) ?? 0) + 1);
				}
				if (counts.size === 0) {
					throw new Error(`${label}: no modal colour to measure`);
				}
				return [...counts.entries()]
					.map(([key, count]) => ({
						average: key.split(',').map(Number),
						count,
					}))
					.sort((a, b) => b.count - a.count);
			};
			const within = (a: number[], b: number[]): boolean =>
				a.every((channel, index) => Math.abs(channel - b[index]) <= tolerance);
			const rgbLabel = (channels: number[]): string =>
				`rgb(${Math.round(channels[0])}, ${Math.round(channels[1])}, ${Math.round(channels[2])})`;

			const dpr = devicePixelRatio;
			const elementBox = element.getBoundingClientRect();
			const computeCanvasGlyphArea = () => {
				const rects: DOMRect[] = [];
				if (kind === 'text') {
					const textNodes: Node[] = [];
					const collect = (candidate: Element): void => {
						for (const node of candidate.childNodes) {
							if (node.nodeType === Node.TEXT_NODE) {
								textNodes.push(node);
							}
						}
					};
					collect(element);
					for (const descendant of element.querySelectorAll('*')) {
						collect(descendant);
					}
					for (const node of textNodes) {
						if ((node.textContent ?? '').trim() === '') {
							continue;
						}
						const range = document.createRange();
						range.selectNodeContents(node);
						for (const textRect of range.getClientRects()) {
							rects.push(textRect);
						}
					}
				} else {
					for (const svgElement of element.querySelectorAll(
						'path, circle, ellipse, line, polyline, polygon, rect',
					)) {
						rects.push(svgElement.getBoundingClientRect());
					}
				}
				if (rects.length === 0) {
					throw new Error(
						`${label} has no text nodes or shapes to delimit its glyph area`,
					);
				}
				return {
					left: (Math.min(...rects.map((r) => r.left)) - elementBox.left) * dpr,
					right:
						(Math.max(...rects.map((r) => r.right)) - elementBox.left) * dpr,
					top: (Math.min(...rects.map((r) => r.top)) - elementBox.top) * dpr,
					bottom:
						(Math.max(...rects.map((r) => r.bottom)) - elementBox.top) * dpr,
				};
			};
			const glyphArea = computeCanvasGlyphArea();

			const pixelAt = (x: number, y: number): [number, number, number] => {
				const index = (y * canvas.width + x) * 4;
				return [data[index], data[index + 1], data[index + 2]];
			};

			// The surface: for text targets the modal colour of the whole box
			// (an outset shadow big enough to dominate the box would itself be
			// the story the guard must tell); for glyph targets the ring just
			// outside the glyph area, whose own box can be dominated by the
			// glyph (the 16px icon is ~60 % glyph pixels). The box's modal
			// colour must actually be what the glyphs sit on: when it occupies
			// less than 15 % of the glyph area — below the strongest pristine
			// ink share of any measured text target (12.7 %), so a modal that
			// appears only as the ink is the ink colour itself — it is an
			// overlay, and the ring immediately around the glyphs decides
			// instead (the round-8 green pair's overlay covers the box's
			// right half with the ink colour while leaving the glyphs
			// pristine).
			const ring = (margin: number): number[][] => {
				const pixels: number[][] = [];
				for (
					let y = Math.floor(glyphArea.top - margin);
					y <= Math.ceil(glyphArea.bottom + margin);
					y += 1
				) {
					for (
						let x = Math.floor(glyphArea.left - margin);
						x <= Math.ceil(glyphArea.right + margin);
						x += 1
					) {
						if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
							continue;
						}
						if (
							x >= Math.floor(glyphArea.left) &&
							x <= Math.ceil(glyphArea.right) &&
							y >= Math.floor(glyphArea.top) &&
							y <= Math.ceil(glyphArea.bottom)
						) {
							continue;
						}
						pixels.push(pixelAt(x, y));
					}
				}
				return pixels;
			};
			const pickBand = (): number[][] => {
				for (const margin of [bandMargin, 2, 1]) {
					const pixels = ring(margin * dpr);
					if (pixels.length > 0) {
						return pixels;
					}
				}
				return [];
			};
			const band = pickBand();
			let surface: number[];
			if (kind === 'text') {
				const allPixels: number[][] = [];
				for (let y = 0; y < canvas.height; y += 1) {
					for (let x = 0; x < canvas.width; x += 1) {
						allPixels.push(pixelAt(x, y));
					}
				}
				const boxWinner = modalColours(allPixels)[0].average;
				let boxWinnerGlyphPixels = 0;
				let glyphPixels = 0;
				for (
					let y = Math.floor(glyphArea.top);
					y <= Math.ceil(glyphArea.bottom);
					y += 1
				) {
					for (
						let x = Math.floor(glyphArea.left);
						x <= Math.ceil(glyphArea.right);
						x += 1
					) {
						if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
							continue;
						}
						glyphPixels += 1;
						if (within(pixelAt(x, y), boxWinner)) {
							boxWinnerGlyphPixels += 1;
						}
					}
				}
				const bandWinner = band.length > 0 ? modalColours(band)[0] : undefined;
				surface =
					boxWinnerGlyphPixels / glyphPixels < 0.15 && bandWinner !== undefined
						? bandWinner.average
						: boxWinner;
			} else {
				if (band.length === 0) {
					throw new Error(
						`${label}: the glyph area leaves no surface ring to measure`,
					);
				}
				surface = modalColours(band)[0].average;
			}

			/**
			 * The reference glyph mask: the browser re-paints the target's
			 * own glyphs in a known configuration, and the result says which
			 * pixels the glyphs occupy. Text targets are re-rendered into an
			 * off-screen canvas — the target's own text nodes, same computed
			 * font, same letter-spacing, drawn at the line boxes' own
			 * positions (baseline resolved from the font's own ascent
			 * metrics) with each line box carrying only the text that line
			 * actually paints: the node is walked character by character, so
			 * the browser's own wrap decisions segment the string, and
			 * wrapping, alignment and indentation are absorbed: only the
			 * glyph rasterization itself must match the painted page, and it
			 * is the same font through the same rasterizer.
			 * Glyph targets are re-stroked into the same canvas from the
			 * SVG's own shapes (its `path`/`line`/`circle`/… geometry, its
			 * computed stroke width, caps and joins, mapped through its own
			 * viewBox) — the browser's canvas rasterizer paints them, and it
			 * is the same rasterizer the DOM used for the live icon. The
			 * reference's pixels at or above `MASK_INK_ALPHA` opacity are the
			 * glyph's own pixels (the denominator of the ink share); the
			 * full alpha>0 paint, dilated by `MASK_DILATION`, is the
			 * occupancy mask that decides what may be ink and what is
			 * foreign. A configuration the reference cannot reproduce does not
			 * need to be enumerated: the mask and the paint simply disagree,
			 * the foreign pixels all fall outside the mask, and the guard
			 * reports the disagreement as an UNMODELLED outcome (naming the
			 * likely causes) rather than attributing pixels by guesswork or
			 * accusing an overlay (round-15 MINOR 1).
			 * Round 13 showed both ways a shape heuristic lies; this replaces
			 * the heuristic with provenance.
			 */
			const paintReferenceMask = async (): Promise<{
				dilated: Uint8Array;
				strict: Uint8Array;
				strictCount: number;
			}> => {
				const maskCanvas = document.createElement('canvas');
				maskCanvas.width = canvas.width;
				maskCanvas.height = canvas.height;
				const maskContext = maskCanvas.getContext('2d');
				if (!maskContext) {
					throw new Error('Browser canvas colour resolver is unavailable');
				}
				maskContext.setTransform(dpr, 0, 0, dpr, 0, 0);

				if (kind === 'text') {
					maskContext.fillStyle = '#000';
					maskContext.textBaseline = 'alphabetic';
					const textNodesIn = (candidate: Element): Node[] => {
						const nodes: Node[] = [];
						for (const node of candidate.childNodes) {
							if (node.nodeType === Node.TEXT_NODE) {
								nodes.push(node);
							}
						}
						return nodes;
					};
					const canvasFont = (style: CSSStyleDeclaration): string =>
						`${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
					const nodes: Node[] = [...textNodesIn(element)];
					for (const descendant of element.querySelectorAll('*')) {
						nodes.push(...textNodesIn(descendant));
					}
					for (const node of nodes) {
						const text = node.textContent ?? '';
						if (text.trim() === '') {
							continue;
						}
						const painter = node.parentElement;
						if (!painter) {
							continue;
						}
						const style = getComputedStyle(painter);
						if (style.display === 'none' || style.visibility === 'hidden') {
							continue;
						}
						let transformed = text;
						if (style.textTransform === 'uppercase') {
							transformed = text.toUpperCase();
						} else if (style.textTransform === 'lowercase') {
							transformed = text.toLowerCase();
						}
						maskContext.font = canvasFont(style);
						if ('letterSpacing' in maskContext) {
							maskContext.letterSpacing = style.letterSpacing;
						}
						const metrics = maskContext.measureText(transformed);
						const fontSize = Number.parseFloat(style.fontSize);
						const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
						const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
						const range = document.createRange();
						range.selectNodeContents(node);
						// A node that wraps has one client rect PER LINE, and the
						// line boxes' origins are all the node string's own — so
						// drawing the whole string at every rect paints mask
						// glyphs at line 2's origin that the DOM does not paint
						// there, and the real line-2 glyphs fall outside the mask
						// and measure as foreign (round-15 IMPORTANT 1: the
						// wrapped title read 1584 foreign pixels, 0 inside the
						// mask). Walk the node character by character — the
						// browser's own layout, wrap decisions included — to
						// recover which characters each line box actually
						// contains, and draw only that substring at that line's
						// origin.
						const charRects: { offset: number; rect: DOMRect }[] = [];
						for (let offset = 0; offset < text.length; offset += 1) {
							const charRange = document.createRange();
							charRange.setStart(node, offset);
							charRange.setEnd(node, offset + 1);
							const charBoxes = charRange.getClientRects();
							if (charBoxes.length === 0) {
								// A character the DOM does not paint — a newline
								// or a control character: it contributes no mask
								// pixels, and canvas `fillText` renders nothing
								// for it either.
								continue;
							}
							charRects.push({ offset, rect: charBoxes[0] });
						}
						for (const textRect of range.getClientRects()) {
							if (textRect.width === 0 || textRect.height === 0) {
								continue;
							}
							let first = -1;
							let last = -1;
							for (const { offset, rect } of charRects) {
								if (
									rect.top < textRect.top - 0.5 ||
									rect.top > textRect.bottom + 0.5
								) {
									continue;
								}
								if (first === -1) {
									first = offset;
								}
								last = offset;
							}
							if (first === -1) {
								continue;
							}
							const lineText = transformed.slice(first, last + 1);
							const halfLeading = (textRect.height - ascent - descent) / 2;
							const alignRight = style.direction === 'rtl';
							maskContext.textAlign = alignRight ? 'right' : 'left';
							const originX = alignRight
								? textRect.right - elementBox.left
								: textRect.left - elementBox.left;
							maskContext.fillText(
								lineText,
								originX,
								textRect.top - elementBox.top + halfLeading + ascent,
							);
						}
					}
				} else {
					const svg =
						element.tagName === 'svg'
							? (element as SVGSVGElement)
							: element.querySelector('svg');
					if (!svg) {
						throw new Error(`${label} has no svg to reference-render`);
					}
					const paintedRect = svg.getBoundingClientRect();
					const viewBox =
						svg.viewBox.baseVal.width > 0 ? svg.viewBox.baseVal : null;
					maskContext.save();
					maskContext.translate(
						paintedRect.left - elementBox.left,
						paintedRect.top - elementBox.top,
					);
					if (viewBox) {
						maskContext.scale(
							paintedRect.width / viewBox.width,
							paintedRect.height / viewBox.height,
						);
						maskContext.translate(-viewBox.x, -viewBox.y);
					}
					for (const svgElement of svg.querySelectorAll(
						'path, circle, ellipse, line, polyline, polygon, rect, text',
					)) {
						const style = getComputedStyle(svgElement);
						const fills = style.fill !== 'none';
						const strokes = style.stroke !== 'none';
						if (!fills && !strokes) {
							continue;
						}
						if (strokes) {
							maskContext.strokeStyle = '#000';
							const strokeWidth = Number.parseFloat(style.strokeWidth);
							maskContext.lineWidth = Number.isFinite(strokeWidth)
								? strokeWidth
								: 1;
							maskContext.lineCap = style.strokeLinecap as CanvasLineCap;
							maskContext.lineJoin = style.strokeLinejoin as CanvasLineJoin;
						}
						if (fills) {
							maskContext.fillStyle = '#000';
						}
						const buildSvgPath = (): Path2D | null => {
							const tag = svgElement.tagName;
							if (tag === 'path' && svgElement.getAttribute('d')) {
								try {
									return new Path2D(svgElement.getAttribute('d') ?? '');
								} catch {
									return null;
								}
							}
							const built = new Path2D();
							if (tag === 'line') {
								built.moveTo(
									Number(svgElement.getAttribute('x1')),
									Number(svgElement.getAttribute('y1')),
								);
								built.lineTo(
									Number(svgElement.getAttribute('x2')),
									Number(svgElement.getAttribute('y2')),
								);
								return built;
							}
							if (tag === 'circle') {
								built.arc(
									Number(svgElement.getAttribute('cx')),
									Number(svgElement.getAttribute('cy')),
									Number(svgElement.getAttribute('r')),
									0,
									Math.PI * 2,
								);
								return built;
							}
							if (tag === 'ellipse') {
								built.ellipse(
									Number(svgElement.getAttribute('cx')),
									Number(svgElement.getAttribute('cy')),
									Number(svgElement.getAttribute('rx')),
									Number(svgElement.getAttribute('ry')),
									0,
									0,
									Math.PI * 2,
								);
								return built;
							}
							if (tag === 'rect') {
								built.rect(
									Number(svgElement.getAttribute('x') ?? 0),
									Number(svgElement.getAttribute('y') ?? 0),
									Number(svgElement.getAttribute('width')),
									Number(svgElement.getAttribute('height')),
								);
								return built;
							}
							if (tag === 'polyline' || tag === 'polygon') {
								const points = (svgElement.getAttribute('points') ?? '')
									.trim()
									.split(/[\s,]+/u)
									.map(Number);
								for (let index = 0; index + 1 < points.length; index += 2) {
									const px = points[index];
									const py = points[index + 1];
									if (index === 0) {
										built.moveTo(px, py);
									} else {
										built.lineTo(px, py);
									}
								}
								if (tag === 'polygon') {
									built.closePath();
								}
								return built;
							}
							return null;
						};
						const path = buildSvgPath();
						if (!path) {
							continue;
						}
						if (fills) {
							maskContext.fill(path);
						}
						if (strokes) {
							maskContext.stroke(path);
						}
					}
					maskContext.restore();
				}

				const maskPixels = maskContext.getImageData(
					0,
					0,
					maskCanvas.width,
					maskCanvas.height,
				).data;
				// The reference's pixels at or above half opacity are the
				// glyph's OWN pixels (the antialiasing halo below that is the
				// painter's edge fuzz, not the glyph); the count of them is
				// the denominator the ink share is measured against.
				const strict = new Uint8Array(canvas.width * canvas.height);
				const inkAlpha = Math.round(maskInkAlpha * 255);
				for (let index = 0; index < maskPixels.length; index += 4) {
					if (maskPixels[index + 3] >= inkAlpha) {
						strict[index / 4] = 1;
					}
				}
				let strictCount = 0;
				for (
					let y = Math.floor(glyphArea.top);
					y <= Math.ceil(glyphArea.bottom);
					y += 1
				) {
					for (
						let x = Math.floor(glyphArea.left);
						x <= Math.ceil(glyphArea.right);
						x += 1
					) {
						if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
							continue;
						}
						if (strict[y * canvas.width + x] === 1) {
							strictCount += 1;
						}
					}
				}
				if (strictCount === 0) {
					throw new Error(
						`${label}: the reference glyph render produced no ink — cannot attribute the measured pixels`,
					);
				}
				const dilated = new Uint8Array(strict.length);
				for (let y = 0; y < canvas.height; y += 1) {
					for (let x = 0; x < canvas.width; x += 1) {
						if (strict[y * canvas.width + x] !== 1) {
							continue;
						}
						for (let dy = -dilation; dy <= dilation; dy += 1) {
							for (let dx = -dilation; dx <= dilation; dx += 1) {
								const px = x + dx;
								const py = y + dy;
								if (
									px < 0 ||
									px >= canvas.width ||
									py < 0 ||
									py >= canvas.height
								) {
									continue;
								}
								dilated[py * canvas.width + px] = 1;
							}
						}
					}
				}
				return { dilated, strict, strictCount };
			};
			const { dilated: mask, strict, strictCount } = await paintReferenceMask();

			// The ink: the strongest-contrast pixel cluster INSIDE the
			// reference mask (blends of the pair have lower contrast than the
			// ink they come from, so the cluster with the strongest contrast
			// is the glyph core colour). Pixels the mask does not claim are
			// never ink candidates, however dense or fragmented they look —
			// that is the whole of the round-13 fix.
			const candidates: { colour: number[]; x: number; y: number }[] = [];
			for (
				let y = Math.floor(glyphArea.top);
				y <= Math.ceil(glyphArea.bottom);
				y += 1
			) {
				for (
					let x = Math.floor(glyphArea.left);
					x <= Math.ceil(glyphArea.right);
					x += 1
				) {
					if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
						continue;
					}
					if (mask[y * canvas.width + x] !== 1) {
						continue;
					}
					const pixel = pixelAt(x, y);
					if (!within(pixel, surface)) {
						candidates.push({ colour: pixel, x, y });
					}
				}
			}
			type Cluster = {
				average: number[];
				count: number;
			};
			const clusters: Cluster[] = [];
			for (const candidate of candidates) {
				const match = clusters.find((cluster) =>
					cluster.average.every(
						(channel, index) =>
							Math.abs(channel - candidate.colour[index]) <= tolerance,
					),
				);
				if (match) {
					match.average = match.average.map(
						(channel, index) =>
							(channel * match.count + candidate.colour[index]) /
							(match.count + 1),
					);
					match.count += 1;
				} else {
					clusters.push({
						average: [...candidate.colour],
						count: 1,
					});
				}
			}
			const strongest = [...clusters].sort((a, b) => {
				const ratio =
					contrast(b.average, surface) - contrast(a.average, surface);
				if (ratio !== 0) {
					return ratio;
				}
				return b.count - a.count;
			})[0];
			const ink = strongest?.average;
			const ratio = ink ? contrast(ink, surface) : 0;
			if (!ink) {
				throw new Error(
					`${label}: no ink candidate inside the glyph mask — all ` +
						`${strictCount} glyph pixels match the measured surface ` +
						`${rgbLabel(surface)} — the ink has been entirely washed away ` +
						`or occluded`,
				);
			}

			// Classification against the measured pair: surface, ink, blend,
			// then foreign — with the mask deciding which side a pixel is on:
			// inside the mask, surface is erased ink, ink is the glyph, a
			// blend is an antialiased edge. OUTSIDE the mask, only the
			// surface may appear. The ink SHARE counts only the glyph's OWN
			// pixels — the STRICT mask, not the dilated one — on the ink
			// side of the midpoint between the two measured colours
			// (strictly closer to the ink than to the surface), so a wash
			// that pushes the glyph's pixels toward the surface drops the
			// share even though every pixel still lies between the pair;
			// the dilated-but-not-strict halo is the painter's antialiasing
			// fuzz, which belongs to the glyph's edge but is not one of its
			// own pixels — it counts in neither the numerator nor the
			// denominator (round-15 MINOR 2: the numerator used to be the
			// DILATED mask, which is how a pristine share measured 1.008,
			// above 1 — arithmetically impossible for a ratio of a subset).
			// Foreign paint is then judged by WHERE it lies: inside
			// the mask, where the glyphs themselves paint, it is an overlay;
			// when every foreign pixel lies outside the mask, the reference
			// render and the paint disagree and the guard cannot conclude —
			// an UNMODELLED outcome (round-15 MINOR 1: a transformed toast,
			// or a wrapping the reference could not reproduce, must not be
			// named an overlay).
			let inkSidePixels = 0;
			let foreignPixels = 0;
			let foreignInsideMask = 0;
			let foreignOutsideMask = 0;
			let total = 0;
			let firstForeign: [number, number, number] | undefined;
			for (
				let y = Math.floor(glyphArea.top);
				y <= Math.ceil(glyphArea.bottom);
				y += 1
			) {
				for (
					let x = Math.floor(glyphArea.left);
					x <= Math.ceil(glyphArea.right);
					x += 1
				) {
					if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
						continue;
					}
					total += 1;
					const pixel = pixelAt(x, y);
					const insideMask = mask[y * canvas.width + x] === 1;
					if (within(pixel, surface)) {
						// Inside the mask this is an erased glyph pixel: the
						// ink was washed or occluded to the surface colour;
						// the ink-share bound below decides whether the glyph
						// survives. Outside the mask it is plain background.
						continue;
					}
					if (!insideMask) {
						foreignPixels += 1;
						foreignOutsideMask += 1;
						firstForeign ??= [pixel[0], pixel[1], pixel[2]];
						continue;
					}
					const inStrict = strict[y * canvas.width + x] === 1;
					const isInk = within(pixel, ink);
					const blend = pixel.every((channel, index) => {
						const low = Math.min(ink[index], surface[index]) - blendMargin;
						const high = Math.max(ink[index], surface[index]) + blendMargin;
						return low <= channel && channel <= high;
					});
					if (!inStrict && (isInk || blend)) {
						// The painter's halo: a pixel the reference paints at
						// less than MASK_INK_ALPHA opacity — the glyph's own
						// antialiasing edge. It belongs to the glyph (ink or
						// blend, never foreign) but is not one of the
						// glyph's OWN pixels, so it counts in neither the
						// share numerator nor its denominator.
						continue;
					}
					if (isInk) {
						inkSidePixels += 1;
						continue;
					}
					if (blend) {
						let distanceToInk = 0;
						let distanceToSurface = 0;
						for (let index = 0; index < pixel.length; index += 1) {
							distanceToInk += Math.abs(pixel[index] - ink[index]);
							distanceToSurface += Math.abs(pixel[index] - surface[index]);
						}
						if (distanceToInk < distanceToSurface) {
							inkSidePixels += 1;
						}
						continue;
					}
					foreignPixels += 1;
					foreignInsideMask += 1;
					firstForeign ??= [pixel[0], pixel[1], pixel[2]];
				}
			}
			if (total === 0) {
				throw new Error(
					`${label}: the glyph area contains no pixels to measure`,
				);
			}

			if (foreignPixels > 0) {
				if (foreignInsideMask > 0) {
					// Foreign paint INSIDE the reference glyph mask — where
					// the glyphs themselves paint — is an overlay the page
					// put there: an OVERLAY verdict (round-15 MINOR 1).
					throw new Error(
						`${label}: the glyph area contains ${foreignPixels} pixel(s) of paint ` +
							`the measured surface and ink did not produce — ${foreignInsideMask} ` +
							`of them lie INSIDE the reference glyph mask, where the glyphs ` +
							`themselves paint: that is an overlay (nearest foreign colour ` +
							`${rgbLabel(firstForeign ?? [])}; ${foreignInsideMask} inside and ` +
							`${foreignOutsideMask} outside the mask)`,
					);
				}
				// Every foreign pixel lies OUTSIDE the mask, where the
				// reference render claims no glyph: the reference render and
				// the paint disagree, and the guard cannot conclude. That is
				// an UNMODELLED outcome — a loud refusal that names the
				// likely causes instead of asserting an overlay exists (the
				// round-15 misattribution: a wrapping the reference could
				// not reproduce, or a transformed toast, was reported as
				// overlay paint).
				throw new Error(
					`${label}: the glyph area contains ${foreignPixels} pixel(s) of paint ` +
						`the measured surface and ink did not produce — ${foreignInsideMask} ` +
						`inside and ${foreignOutsideMask} outside the reference glyph mask, ` +
						`with every one of them where the mask claims no glyph: the reference ` +
						`render and the paint disagree, so the guard cannot conclude. Possible ` +
						`causes: a text configuration the reference does not model ` +
						`(word-spacing, text-transform), a transform or scale on the toast or ` +
						`an ancestor, or a glyph layout the reference render cannot reproduce ` +
						`— this is an UNMODELLED outcome, not an overlay verdict`,
				);
			}
			const inkShare = inkSidePixels / strictCount;
			if (inkShare < minInkShare) {
				throw new Error(
					`${label}: no legible glyph ink in the glyph area — only ` +
						`${inkShare.toFixed(3)} of ${strictCount} glyph pixels still match ` +
						`the measured ink — the ink has been washed away or occluded`,
				);
			}
			if (ratio < floor) {
				throw new Error(
					`${label}: measured contrast ${ratio.toFixed(2)}:1 is below the ` +
						`${floor}:1 floor — the ink is washed or occluded`,
				);
			}

			return {
				background: {
					r: Math.round(surface[0]),
					g: Math.round(surface[1]),
					b: Math.round(surface[2]),
					a: 1,
				},
				foreground: {
					r: Math.round(ink[0]),
					g: Math.round(ink[1]),
					b: Math.round(ink[2]),
					a: 1,
				},
				ratio,
			};
		},
		{
			bandMargin: SURFACE_BAND_MARGIN,
			blendMargin: BLEND_MARGIN,
			dataUrl: `${SCREENSHOT_DATA_URL_PREFIX}${screenshot.toString('base64')}`,
			decoderSnippet: BROWSER_SCREENSHOT_DECODER_SNIPPET,
			dilation: MASK_DILATION,
			floor,
			kind,
			label,
			maskInkAlpha: MASK_INK_ALPHA,
			minInkShare: INK_SHARE_FLOOR,
			tolerance: PIXEL_MATCH_TOLERANCE,
		},
	);
	return report;
};

const measureToastTarget = async ({
	floor,
	kind,
	label,
	target,
	testInfo,
}: {
	floor: number;
	kind: TargetKind;
	label: string;
	target: Locator;
	testInfo: TestInfo;
}): Promise<ContrastMeasurement> => {
	await expect(target, `${label} must render`).toBeVisible();
	const measurement = await measureContrast(target, kind, floor, label);
	const description =
		`${label}: ${measurement.ratio.toFixed(2)}:1 ` +
		`(measured ink ${rgbaLabel(measurement.foreground)}, ` +
		`measured surface ${rgbaLabel(measurement.background)})`;
	testInfo.annotations.push({ type: 'contrast', description });
	return measurement;
};

/**
 * Self-check that a pseudo the test injects actually PAINTS: screenshot the
 * given box (the toast), decode it in the page and count pixels within
 * tolerance of the given colour. Round 9's I2 showed how easily a pseudo
 * test can be vacuous — `display: inline` ignores width/height and paints
 * nothing — so every injected-pseudo test proves its pseudo paints before
 * asserting the guard's verdict.
 */
const assertPaintsPixels = async (
	target: Locator,
	rgb: [number, number, number],
	label: string,
): Promise<void> => {
	const screenshot = await target.screenshot();
	const count = await target.evaluate(
		async (_element, { dataUrl, decoderSnippet, rgb }) => {
			// Shared browser decoder via BROWSER_SCREENSHOT_DECODER_SNIPPET (Node passes snippet as string).
			// eslint-disable-next-line no-new-func
			const __publyDecodeScreenshot = new Function(
				decoderSnippet + '\nreturn __publyDecodeScreenshot;',
			)() as (d: string) => Promise<ImageData>;
			const imageData = await __publyDecodeScreenshot(dataUrl);
			const data = imageData.data;
			let count = 0;
			for (let index = 0; index < data.length; index += 4) {
				if (
					Math.abs(data[index] - rgb[0]) <= 3 &&
					Math.abs(data[index + 1] - rgb[1]) <= 3 &&
					Math.abs(data[index + 2] - rgb[2]) <= 3
				) {
					count += 1;
				}
			}
			return count;
		},
		{
			dataUrl: `${SCREENSHOT_DATA_URL_PREFIX}${screenshot.toString('base64')}`,
			decoderSnippet: BROWSER_SCREENSHOT_DECODER_SNIPPET,
			rgb,
		},
	);
	expect(
		count,
		`${label} must actually paint ${rgb.join(',')} pixels`,
	).toBeGreaterThanOrEqual(10);
};

const assertCloseButtonContainingBlock = async (
	toast: Locator,
	theme: Theme,
	viewport: ViewportPreset,
): Promise<void> => {
	const positioning = await toast.evaluate((toastElement) => {
		const closeButton = toastElement.querySelector<HTMLElement>(
			'.publy-toast-close-button',
		);
		if (!closeButton) {
			throw new Error('Rendered toast has no close button');
		}

		const toastStyle = getComputedStyle(toastElement);
		const closeStyle = getComputedStyle(closeButton);
		const toastRect = toastElement.getBoundingClientRect();
		const closeRect = closeButton.getBoundingClientRect();
		return {
			closePosition: closeStyle.position,
			offsetParentIsToast: closeButton.offsetParent === toastElement,
			toastPosition: toastStyle.position,
			toastTransform: toastStyle.transform,
			withinToast:
				closeRect.left >= toastRect.left &&
				closeRect.top >= toastRect.top &&
				closeRect.right <= toastRect.right &&
				closeRect.bottom <= toastRect.bottom,
		};
	});

	const where = `${theme} ${viewport.name}`;
	expect(positioning.closePosition, `${where} close button positioning`).toBe(
		'absolute',
	);
	expect(positioning.toastPosition, `${where} toast positioning`).toBe(
		'absolute',
	);
	expect(positioning.toastTransform, `${where} toast transform`).not.toBe(
		'none',
	);
	expect(
		positioning.offsetParentIsToast,
		`${where} toast must be the close button's containing block`,
	).toBe(true);
	expect(
		positioning.withinToast,
		`${where} close button must remain inside the painted toast`,
	).toBe(true);
};

const openToastFixture = async (
	page: Page,
	theme: Theme,
	viewport: ViewportPreset,
): Promise<void> => {
	await page.setViewportSize({
		width: viewport.width,
		height: viewport.height,
	});
	await page.goto('/field-validation');
	// The fixture renders server-side, so `toast-contrast-fixture` is visible
	// before React has attached the raise handlers — a click in that window
	// raises no toast at all, which reds the first `renderToast` of every
	// leg for reasons unrelated to contrast (round-7 IMPORTANT I1). Wait on
	// the fixture's own `data-hydrated` attribute, which the page sets in a
	// post-hydration effect, before the first click.
	//
	// The bound is 30s, argued against the cost that actually binds
	// (round-15 IMPORTANT 2): the attribute wait itself is cheap — it
	// measured 0.31-1.20s across the four legs under load 64-68 on 12 cores
	// — while the whole LEG is the binding cost (19.9-24.0s of sequential
	// measurement against the shipped 30s test timeout, the round-13
	// flake). The spec's own `test.setTimeout(60_000)` above gives the leg
	// ~2.5x headroom, and this 30s attribute bound is reachable inside it:
	// a hydration failure exhausts here with the locator's own diagnostic
	// instead of a bare test timeout (round 14's 30s bound could never be
	// reached — the 30s test timeout that contains it swallowed it first).
	const fixture = page.getByTestId('toast-contrast-fixture');
	await expect(fixture).toBeVisible();
	await expect(fixture).toHaveAttribute('data-hydrated', 'true', {
		timeout: 30_000,
	});
	await setTheme(page, theme);
};

const renderToast = async (
	page: Page,
	type: Variant | 'default',
): Promise<Locator> => {
	await page.getByTestId(`toast-contrast-${type}`).click();
	const toast = page.locator(
		type === 'default'
			? '[data-sonner-toast].publy-toast-default:not([data-type])'
			: `[data-sonner-toast][data-type="${type}"]`,
	);
	await expect(toast).toBeVisible();
	await expect(toast).toHaveAttribute('data-mounted', 'true');
	await expect(toast).toHaveCSS('opacity', '1');
	return toast;
};

const dismissToast = async (toast: Locator): Promise<void> => {
	await toast.locator('.publy-toast-close-button').click();
	await expect(toast).toHaveCount(0);
};

// Timing budget (round-11 I2, recorded so it is not rediscovered): AppToaster
// sets no `duration`, so Sonner's 4 s default auto-dismiss applies to every
// toast. Every measurement of a toast's targets — and the whole leg's
// dismiss — must complete inside that window, or the toast vanishes
// mid-measurement and the next `toHaveAttribute('data-mounted')`/`toHaveCSS`
// wait reds for reasons unrelated to contrast. Each toast is measured
// SEQUENTIALLY and more than once: the default toast takes three
// measurements (message, description, close glyph) and every semantic toast
// takes FOUR (message, description, semantic glyph, close glyph — see the
// matrix test below), so the 4 s window holds one toast's whole set, not a
// single reading. Each reading is a full screenshot decode plus the
// reference-mask render and a pixel scan — which is why the round-10
// report's "nothing moved a timing boundary" was wrong in kind: the work
// got heavier. The flake closure itself survives (the reviewer's three
// loaded runs here, plus round 9's, are consecutive greens), but the
// binding constraint is the Sonner auto-dismiss, not the waits.

const TEXT_TARGETS = [
	{
		name: 'message',
		locatorFor: (toast: Locator) => toast.locator('.publy-toast-title'),
		kind: 'text',
		floor: TEXT_CONTRAST_FLOOR,
	},
	{
		name: 'description',
		locatorFor: (toast: Locator) => toast.locator('.publy-toast-description'),
		kind: 'text',
		floor: TEXT_CONTRAST_FLOOR,
	},
] as const;

for (const theme of THEMES) {
	for (const viewport of VIEWPORTS) {
		test(`${theme} ${viewport.name} toast variants clear contrast and retain close positioning`, async ({
			page,
		}, testInfo) => {
			await openToastFixture(page, theme, viewport);
			const where = `${theme} ${viewport.name}`;

			const neutralToast = await renderToast(page, 'default');
			const neutralSurface = (
				await measureToastTarget({
					floor: TEXT_TARGETS[0].floor,
					kind: TEXT_TARGETS[0].kind,
					label: `${where} default ${TEXT_TARGETS[0].name}`,
					target: TEXT_TARGETS[0].locatorFor(neutralToast),
					testInfo,
				})
			).background;
			for (const target of [
				TEXT_TARGETS[1],
				{
					name: 'close glyph',
					locatorFor: (toast: Locator) =>
						toast.locator('.publy-toast-close-button svg'),
					kind: 'glyph',
					floor: GLYPH_CONTRAST_FLOOR,
				},
			] as const) {
				await measureToastTarget({
					floor: target.floor,
					kind: target.kind,
					label: `${where} default ${target.name}`,
					target: target.locatorFor(neutralToast),
					testInfo,
				});
			}
			await assertCloseButtonContainingBlock(neutralToast, theme, viewport);
			await dismissToast(neutralToast);

			for (const variant of VARIANTS) {
				const toast = await renderToast(page, variant);
				await assertCloseButtonContainingBlock(toast, theme, viewport);

				const targets = [
					...TEXT_TARGETS,
					{
						name: 'semantic glyph',
						locatorFor: (toast: Locator) =>
							toast.locator('.publy-toast-icon svg'),
						kind: 'glyph',
						floor: GLYPH_CONTRAST_FLOOR,
					},
					{
						name: 'close glyph',
						locatorFor: (toast: Locator) =>
							toast.locator('.publy-toast-close-button svg'),
						kind: 'glyph',
						floor: GLYPH_CONTRAST_FLOOR,
					},
				] as const;

				let variantSurface: Rgba | undefined;
				for (const target of targets) {
					const measurement = await measureToastTarget({
						floor: target.floor,
						kind: target.kind,
						label: `${where} ${variant} ${target.name}`,
						target: target.locatorFor(toast),
						testInfo,
					});
					variantSurface ??= measurement.background;
				}

				const semanticSurface = rgbaLabel(variantSurface ?? neutralSurface);
				const neutralSurfaceLabel = rgbaLabel(neutralSurface);
				expect
					.soft(
						semanticSurface,
						`${where} ${variant} painted surface must not collapse to the neutral toast surface`,
					)
					.not.toBe(neutralSurfaceLabel);

				await dismissToast(toast);
			}
		});
	}
}

/**
 * Paired proof for the inset-shadow geometry, so neither blindness survives:
 * the flooding `spread` variant must red the guard, and the edge-only
 * highlight the geometry was made for must stay green. A single test here
 * would pin the bug whichever way it points. Both mutate the real toast
 * rule through an injected un-layered rule, which beats app.css's layered
 * one, so the guard reads genuine cascade results.
 */
test('an inset shadow that floods the whole box via spread fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'.publy-toast { box-shadow: var(--publy-shadow-menu), inset 0 0 0 60px var(--publy-foreground); }',
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/inset shadow that can reach the sampled point/);
});

test('an inset highlight confined to an edge stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'.publy-toast { box-shadow: var(--publy-shadow-menu), inset 0 1px 0 rgb(255 255 255 / 0.6); }',
	});
	const toast = await renderToast(page, 'success');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * Paired proof for the pseudo-element paint-order rule (round-5 I1): an
 * in-front pseudo must red the guard, a pseudo stacked BEHIND the opaque
 * toast must stay green even though it paints a background the sampled
 * point's box would geometrically contain, and the edge accent stripe the
 * geometry was made for stays green. All three mutate the real toaster rule
 * through an injected un-layered rule, so the guard reads genuine cascade
 * results.
 */
test('a pseudo-element overlay in front of the toast fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toaster::before { content: ''; position: fixed; inset: 0; background: rgb(255 0 0); pointer-events: none; z-index: 2147483647; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/paints a background over the sampled point/);
});

test('a pseudo-element painted behind the toast stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toaster::before { content: ''; position: fixed; inset: 0; background: rgb(255 0 0); pointer-events: none; z-index: -1; }",
	});
	const toast = await renderToast(page, 'success');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * The paired red side of the paint-order rule (round-7 B2): a `z-index: -1`
 * pseudo on a DESCENDANT of the opaque surface — the title's own `::before`
 * here — paints over that surface's background, because the CSS painting
 * algorithm stacks negative-z children after the context element's own
 * background. The round-6 rule classified that paint as "behind" and
 * skipped it, so a red decoration over the toast's own text measured the
 * un-painted surface at 15.64:1. The green side is the test above, whose
 * negative-z decoration sits on an ANCESTOR of the surface.
 */
test('a negative-z pseudo-element over the toast text fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast-title { position: relative; } .publy-toast-title::before { content: ''; position: absolute; left: 0; top: 5px; width: 46px; height: 11px; background: rgb(255 0 0); pointer-events: none; z-index: -1; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/paints a background over the sampled point/);
});

test('an edge accent stripe on the toast stays measured', async ({ page }) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 3px; background: var(--publy-toast-accent); pointer-events: none; }",
	});
	const toast = await renderToast(page, 'success');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * Round-9 I2's green half: a RELATIVELY positioned pseudo that ACTUALLY
 * paints (round 8's pseudo was `display: inline`, so its width/height did
 * not apply and it painted nothing anywhere) and is offset away from the
 * glyphs stays measured. `pseudoElementBox` resolves the painted box as the
 * origin's rect translated by the offsets, which puts this pseudo over the
 * close-button corner — far from the title's ink; before the fix the origin
 * rectangle still contained the sampled point and the guard redded a paint
 * that never reached the text. The self-check below proves the pseudo
 * paints real red pixels, so the green verdict is earned, not vacuous.
 */
test('a relatively positioned pseudo offset away from the glyphs stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast-title::after { content: ''; display: inline-block; position: relative; z-index: 1; left: 250px; top: 5px; width: 46px; height: 11px; background: rgb(255 0 0); pointer-events: none; }",
	});
	const toast = await renderToast(page, 'success');
	await assertPaintsPixels(toast, [255, 0, 0], 'the offset-away pseudo');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * Round-9 I2's red half: the same relative box resolution, offset ONTO the
 * glyphs — the resolved box (the origin rect translated by the offsets)
 * contains the sampled point, so the guard must red it. This is the half
 * that makes the branch load-bearing: with the branch stubbed to a
 * far-away box the same test goes green, which is the mutation that proves
 * the resolution is doing the work. The pseudo paints (self-check below)
 * at 12px past the text's end, off the glyph area, so no other reading can
 * fire.
 */
test('a relatively positioned pseudo offset onto the glyphs fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast-title::after { content: ''; display: inline-block; position: relative; z-index: 5; left: -60px; top: 0px; width: 12px; height: 12px; background: rgb(255 0 0); pointer-events: none; }",
	});
	const toast = await renderToast(page, 'success');
	await assertPaintsPixels(
		toast,
		[255, 0, 0],
		'the offset-onto-the-glyphs pseudo',
	);
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/paints a background over the sampled point/);
});

/**
 * Paired proof for the click-through scan (round-5 B1): the 220x40
 * click-through scrim over the title — invisible to hit testing, exactly
 * the round-5 reproduction — must red the guard BY NAME, and the same box
 * stacked BEHIND the toast must stay green. Both restyle the fixture's own
 * real element (`field-validation-title`), so the scan reads a genuine DOM
 * overlay, not a synthetic one.
 */
test('a click-through overlay over the text fails the guard by name', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"[data-testid='field-validation-title'] { position: fixed; top: 31px; right: 117px; width: 220px; height: 40px; background: var(--publy-foreground); color: transparent; pointer-events: none; z-index: 2147483647; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/field-validation-title is a click-through overlay painted above the toast surface and over the text area/,
	);
});

test('a click-through overlay painted behind the toast stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"[data-testid='field-validation-title'] { position: fixed; top: 31px; right: 117px; width: 220px; height: 40px; background: var(--publy-foreground); color: transparent; pointer-events: none; z-index: -1; }",
	});
	const toast = await renderToast(page, 'success');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * Paired proof for the glyph-area sampling and the ink-level pixel check
 * (round-7 B1): the exact round-7 occlusion — the fixture's own real h1,
 * hit-testable (so the click-through scan skips it), painted in the
 * foreground colour, covering the title's ink rows but not the box
 * midpoint — must fail the guard. It reds by name: the model samples at
 * the ink, where the text actually is, so the overlay sits in the hit
 * stack of the measured point. The pair's green side places the same
 * overlay over the box's right half — exactly where the old
 * box-midpoint sample used to sit — and the title still measures.
 */
test('a hit-testable overlay over the glyphs fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"@media (min-width: 1000px) { [data-testid='field-validation-title'] { position: fixed; top: 35px; left: 943px; width: 46px; height: 12px; overflow: hidden; background: var(--publy-foreground); color: transparent; z-index: 2147483647; } }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/field-validation-title unexpectedly paints above contrast target/,
	);
});

test('a hit-testable overlay away from the glyphs stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"[data-testid='field-validation-title'] { position: fixed; top: 31px; left: 1096px; width: 153px; height: 20px; overflow: hidden; background: var(--publy-foreground); color: transparent; z-index: 2147483647; }",
	});
	const toast = await renderToast(page, 'success');
	await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
});

/**
 * Round-7 M2's first undeclared gap, closed by the ink-level pixel check:
 * an OUTSET shadow from a neighbouring element paints over the toast, is
 * not a background (so the click-through scan skips it) and sits outside
 * the hit stack at the ink (only the element's own box hit-tests, not its
 * shadow) — the model cannot see it at all. Only the pixel check can, and
 * it must, by name: the block paints the foreground colour over the glyphs,
 * and outside the reference glyph mask that is foreign paint. Because the
 * block is the ink colour, its pixels over the mask read as ink, so the
 * foreign pixels all fall OUTSIDE the mask and the guard refuses with the
 * UNMODELLED outcome (round-16) rather than asserting an overlay — the
 * refusal is what this test pins.
 */
test('an outset shadow from a neighbouring element over the glyphs fails the guard', async ({
	page,
}, testInfo) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"[data-testid='field-validation-title'] { position: fixed; top: 31px; left: 1096px; width: 153px; height: 20px; box-shadow: -160px 7px 0 0 var(--publy-foreground); color: transparent; z-index: 2147483647; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureToastTarget({
			floor: TEXT_CONTRAST_FLOOR,
			kind: 'text',
			label: 'light desktop outset-shadowed title',
			target: toast.locator('.publy-toast-title'),
			testInfo,
		}),
	).rejects.toThrow(
		/pixel\(s\) of paint the measured surface and ink did not produce/,
	);
});

/**
 * Round-9 B1's paired proof, re-pinned for round-11 B2: the guard's contrast
 * number must come from the rendered pixels, not from a model of the surface
 * — and the test must die when that stops. A translucent wash of the MEASURED
 * surface colour over the glyphs changes the glyph colour without changing
 * `getComputedStyle(...).color` at all (the wash is a box-shadow on the
 * fixture h1, invisible to hit testing, to the click-through scan and to the
 * paint-order model), so it is the exact case where a modelled ink and the
 * measured ink genuinely differ. The wash is delivered by the fixture h1's
 * box-shadow. On the measured guard the washed glyphs become the measured
 * ink (they lie inside the reference glyph mask, so the masked reading keeps
 * them), the ratio is ~1.4:1, and the RATIO floor fires — the assertion below
 * names the ratio diagnostic, so if the ink ever stops being measured
 * (round-9's defect: ink read from `getComputedStyle(...).color`), the
 * washed pixels no longer match it, the ink-share floor fires "no legible
 * glyph ink" instead, the message no longer matches, and the test goes red
 * on the right reason. The α values are those that keep the washed glyphs
 * distinct from the surface (α < ~0.99), so the ratio branch — not the
 * ink-share branch — is the one that fires.
 */
test('a translucent wash of the toast surface erases the text at a ratio the model cannot see', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toast = await renderToast(page, 'success');
	const pristine = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
	const { b, g, r } = pristine.background;
	for (const alpha of [0.8, 0.85, 0.9]) {
		await page.addStyleTag({
			content: `[data-testid='field-validation-title'] { position: fixed; top: 31px; left: 1096px; width: 153px; height: 20px; box-shadow: -160px 2px 0 8px rgba(${r}, ${g}, ${b}, ${alpha}); color: transparent; z-index: 2147483647; }`,
		});
		await expect(
			measureContrast(
				toast.locator('.publy-toast-title'),
				'text',
				TEXT_CONTRAST_FLOOR,
			),
			`a ${alpha} wash of the surface must erase the text at its measured ratio`,
		).rejects.toThrow(/measured contrast .* is below the .* floor/);
	}
});

/**
 * Round-11 B1's paired proof: the ink must be tied to the GLYPHS, not to
 * "whatever contrasts most inside the glyph rectangle". A contrast-donating
 * bar — an opaque 1 CSS px band of the ink colour across the glyph rows
 * (via `spread: -9.5px`) — plus a wash that erases every glyph donates a
 * healthy ratio to the strongest-contrast rule: the round-11 reviewer erased
 * 100 % of the title's glyphs (real measured contrast 1.22:1-1.53:1) and the
 * guard reported 15.60:1-15.70:1, green, with `foreign = 0`. The reference
 * glyph mask replaces the old spatial filter: the bar is ink only where it
 * overlaps the mask's own pixels, and everywhere else — the word gaps, the
 * columns between strokes, the run past the glyphs' extent — it is FOREIGN
 * paint. The bar's pixels avoid the mask entirely (0 inside), so the guard
 * refuses with the UNMODELLED outcome (round-16) rather than an overlay
 * verdict — the refusal is what this test pins. The assertion names the
 * foreign diagnostic, so deleting the mask
 * alone restores the escape (the bar becomes the ink, no pixel is foreign,
 * 15.60:1, green) and this test goes red. The donor is the same delivery
 * vector the shipped suite uses in four of its own tests: invisible to hit
 * testing, to the click-through scan and to the paint-order model.
 */
test('a contrast-donating bar plus a wash over the glyphs cannot keep the guard green', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toast = await renderToast(page, 'success');
	const pristine = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
	const { b, g, r } = pristine.background;
	const ink = pristine.foreground;
	for (const alpha of [0.8, 0.85, 0.9]) {
		await page.addStyleTag({
			content: `[data-testid='field-validation-title'] { position: fixed; top: 31px; left: 1096px; width: 153px; height: 20px; box-shadow: -162.5px -0.5px 0 -9.5px rgb(${ink.r} ${ink.g} ${ink.b}), -160px 2px 0 8px rgba(${r}, ${g}, ${b}, ${alpha}); color: transparent; z-index: 2147483647; }`,
		});
		await expect(
			measureContrast(
				toast.locator('.publy-toast-title'),
				'text',
				TEXT_CONTRAST_FLOOR,
			),
			`a ${alpha} donor bar plus wash must leave the donor as foreign paint`,
		).rejects.toThrow(
			/pixel\(s\) of paint the measured surface and ink did not produce/,
		);
	}
});

/**
 * Round-9 B2's occlusion bound, re-pinned on the mask: a block of the TOAST
 * SURFACE colour over most of the glyphs erases the ink while the surviving
 * ink still measures 15.6:1 — only the ink-share bound can see it. The block
 * is an outset shadow of the measured surface colour (invisible to every
 * model reading) covering ~59 % of the title's glyph area; the mask pixels
 * under it stop being ink, so the ink share drops below `INK_SHARE_FLOOR`
 * (the stated "at least half of the glyph's own pixels must still be ink"
 * requirement), and the floor that fires is the ink-share one — deleting
 * that branch alone greens this test.
 */
test('a block of the toast surface colour over most of the glyphs fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toast = await renderToast(page, 'success');
	const pristine = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
	const { b, g, r } = pristine.background;
	await page.addStyleTag({
		content: `[data-testid='field-validation-title'] { position: fixed; top: 35px; left: 1096px; width: 46px; height: 20px; box-shadow: -135px -2px 0 0 rgba(${r}, ${g}, ${b}, 1); color: transparent; z-index: 2147483647; }`,
	});
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/match the measured ink/);
});

/**
 * Round-9 B2's ink-share bound, pinned: a wash of the surface colour that
 * leaves a sliver of pristine ink measures 15.6:1 on the survivor (so the
 * ratio floor passes) yet erases 73 % of the ink — only the ink-share bound
 * can see it, because the sliver is only ~27 % of the glyph's own mask
 * pixels, below `INK_SHARE_FLOOR`. The two washes are outset shadows of the
 * measured surface colour with a 12px gap over the middle of the glyphs;
 * deleting the ink-share branch alone greens this test.
 */
test('a wash of the surface colour leaving only a sliver of pristine ink fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toast = await renderToast(page, 'success');
	const pristine = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
		TEXT_CONTRAST_FLOOR,
	);
	const { b, g, r } = pristine.background;
	await page.addStyleTag({
		content: `[data-testid='field-validation-title'] { position: fixed; top: 31px; left: 1096px; width: 153px; height: 20px; box-shadow: -280px 2px 0 0 rgba(${r}, ${g}, ${b}, 0.93), -115px 2px 0 0 rgba(${r}, ${g}, ${b}, 0.93); color: transparent; z-index: 2147483647; }`,
	});
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/match the measured ink/);
});

/**
 * Round-9 B2(b)'s foreign-pixel branch, pinned: a block of a colour that is
 * neither the measured surface, nor the measured ink, nor a blend of the
 * two — blue, chosen so its own contrast against the surface sits above the
 * glyph floor, so only the foreign branch can fire — over part of the
 * glyphs must fail the guard by name. The block is an outset shadow
 * (invisible to every model reading) covering ~39 % of the glyph area,
 * which leaves the ink share above its floor.
 */
test('a foreign-colour block over part of the glyphs fails the guard by name', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			"[data-testid='field-validation-title'] { position: fixed; top: 33px; left: 1096px; width: 46px; height: 20px; box-shadow: -126px 0px 0 0 rgb(0 0 255); color: transparent; z-index: 2147483647; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/pixel\(s\) of paint the measured surface and ink did not produce/,
	);
});

/**
 * Round-9 I1: a pseudo whose paint is relocated by `transform` silently
 * resolved to a compliant box — the resolved box sat 400 px away while the
 * transform put the paint back over the ink, and the guard substituted the
 * compliant box. `transform`, `translate`, `rotate` and `scale` on a
 * painted pseudo now join the fail-loudly list: the painted box cannot be
 * resolved from computed styles, so the guard must say so by element name.
 */
test('a transformed pseudo-element over the toast fails loudly', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast-title { position: relative; } .publy-toast-title::before { content: ''; position: absolute; left: 400px; top: 2px; width: 60px; height: 18px; transform: translateX(-400px); background: rgba(235, 242, 240, 0.93); pointer-events: none; z-index: 5; }",
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/painted box cannot be resolved from computed styles/);
});

/** Stacked/expanded containing-block helpers — Sonner 2.0.6 visibleToasts=4, data-front/data-expanded. */
const renderStackedToasts = async (page: Page): Promise<Locator[]> => {
	const order: Array<Variant | 'default'> = [
		'success',
		'error',
		'warning',
		'info',
	];
	const toasts: Locator[] = [];
	for (const variant of order) {
		const toast = await renderToast(page, variant);
		toasts.push(toast);
	}
	return toasts;
};

const dismissAllToasts = async (page: Page): Promise<void> => {
	// Sonner stacks the toasts at the same position; only the FRONT toast
	// (`data-front="true"`) is the dismiss target. Its close button is visually
	// on top but sits *under* the (wide) toast title in the DOM hit-test, so a
	// coordinate click — `click({ force: true })` included — lands on the title
	// and never fires `removeToast`. We therefore dispatch the click event
	// directly on the close button, which reliably dismisses, then wait on STATE:
	// each front toast is tracked by its stable `data-type` and we wait for THAT
	// toast to detach from the DOM (Sonner removes the node only once the exit
	// animation finishes) before re-targeting the next front. The previous code
	// clicked the LAST close button with a fixed `waitForTimeout(150)` between
	// attempts; under load Sonner's exit animation outlasted the delay, so the
	// final `toHaveCount(0)` failed with nodes still mid-exit (issue #1173, CI
	// shard 4/4: `Expected: 0, Received: 3`). Replacing the fixed delay with a
	// wait on each toast's own detachment removes the race. The loop is bounded
	// by the rendered count — a structural bound, not a retry ceiling that would
	// mask a real failure.
	const toasts = page.locator('[data-sonner-toast]');
	const rendered = await toasts.count();
	for (let i = 0; i < rendered; i += 1) {
		const front = page
			.locator('[data-sonner-toast][data-front="true"]')
			.first();
		if ((await front.count()) === 0) {
			break;
		}
		const type = await front.getAttribute('data-type');
		await front.locator('.publy-toast-close-button').evaluate((el) =>
			el.dispatchEvent(
				new MouseEvent('click', {
					bubbles: true,
					cancelable: true,
					view: window,
				}),
			),
		);
		// Wait for THIS toast to leave the DOM (exit animation done) before the
		// next iteration re-targets the new front. 5s bounds a single exit; it is
		// a real failure signal, not a flake retry.
		await expect(
			page.locator(`[data-sonner-toast][data-type="${type}"]`),
		).toHaveCount(0, { timeout: 5_000 });
	}
	await expect(toasts).toHaveCount(0);
};

test('close button containing block holds in collapsed stacked state', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toasts = await renderStackedToasts(page);
	await expect(
		page.locator('[data-sonner-toast][data-mounted="true"]'),
	).toHaveCount(4);
	for (const toast of toasts) {
		await assertCloseButtonContainingBlock(toast, 'light', VIEWPORTS[0]);
	}
	await dismissAllToasts(page);
});

test('close button containing block holds when stack is expanded on hover', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	const toasts = await renderStackedToasts(page);
	await page
		.locator('[data-sonner-toast][data-front="true"]')
		.first()
		.hover({ force: true });
	await expect(
		page.locator('[data-sonner-toast][data-expanded="true"]'),
	).toHaveCount(4, { timeout: 5_000 });
	for (const toast of toasts) {
		await assertCloseButtonContainingBlock(toast, 'light', VIEWPORTS[0]);
	}
	await dismissAllToasts(page);
});

test('clipped text (background-clip:text) fails loudly', async ({ page }) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'.publy-toast-title { background: linear-gradient(90deg, red, blue); -webkit-background-clip: text; background-clip: text; color: transparent; }',
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/background-clip:text/);
});

test('transparent text fill (-webkit-text-fill-color: transparent) fails loudly', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content: '.publy-toast-title { -webkit-text-fill-color: transparent; }',
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/transparent text fill/);
});

test('M1 duplicate success tint fails the guard', async ({ page }) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'.publy-toast-success { --publy-toast-tint: var(--publy-foreground); }',
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/below the .* floor|has no legible glyph ink|no ink candidate|undecidable/,
	);
});

test('M2 higher-specificity toaster error competitor fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'.publy-toaster .publy-toast-error { --publy-toast-tint: var(--publy-foreground); --publy-toast-accent: var(--publy-background); }',
	});
	const toast = await renderToast(page, 'error');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/below the .* floor|has no legible glyph ink|no ink candidate/,
	);
});

test('M3 redefined warning token fails the guard', async ({ page }) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content: ':root { --publy-alert-warning-bg: var(--publy-foreground); }',
	});
	const toast = await renderToast(page, 'warning');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/below the .* floor|has no legible glyph ink|no ink candidate/,
	);
});

test('M4 near-black success background with near-black text fails the guard (injected via addStyleTag)', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			'[data-sonner-toast][data-type="success"] { background: hsl(0 0% 0%) !important; color: hsl(0 0% 10%) !important; }',
	});
	const toast = await renderToast(page, 'success');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(/below the .* floor|has no legible glyph ink/);
});

test('M5 source reorder (error before base) fails the guard', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		// Base first, then error with higher specificity so the wash wins (otherwise 16.96:1 false green).
		content:
			'.publy-toast { --publy-toast-tint: var(--publy-surface-raised); } .publy-toaster .publy-toast-error { --publy-toast-tint: var(--publy-foreground); }',
	});
	const toast = await renderToast(page, 'error');
	await expect(
		measureContrast(
			toast.locator('.publy-toast-title'),
			'text',
			TEXT_CONTRAST_FLOOR,
		),
	).rejects.toThrow(
		/below the .* floor|has no legible glyph ink|no ink candidate/,
	);
});

/**
 * R3 gap closures — browser-path (real artifact) tests for the classifier's
 * gap branches. Each mutates the LIVE toast via addStyleTag (same hermetic
 * project as M1-M5) and must make the guard THROW with the named reason.
 * Follows the existing M1-M5 mutation pattern.
 */
test.describe(
	'text-paint gap closures (browser artifact)',
	{ tag: ['@design', '@1078'] },
	() => {
		test.use({ deviceScaleFactor: 2 });

		test('opacity 0 on the text node fails the guard', async ({ page }) => {
			await openToastFixture(page, 'light', VIEWPORTS[0]);
			await page.addStyleTag({ content: '.publy-toast-title { opacity: 0; }' });
			const toast = await renderToast(page, 'success');
			await expect(
				measureContrast(
					toast.locator('.publy-toast-title'),
					'text',
					TEXT_CONTRAST_FLOOR,
				),
			).rejects.toThrow(/transparent opacity 0/);
		});

		test('opacity 0 on an ancestor of the text node fails the guard', async ({
			page,
		}) => {
			await openToastFixture(page, 'light', VIEWPORTS[0]);
			// Ancestor opacity is walked explicitly in readBrowserPaint (contains check).
			await page.addStyleTag({
				content: '.publy-toast-content { opacity: 0; }',
			});
			const toast = await renderToast(page, 'success');
			await expect(
				measureContrast(
					toast.locator('.publy-toast-title'),
					'text',
					TEXT_CONTRAST_FLOOR,
				),
			).rejects.toThrow(/transparent opacity 0/);
		});

		test('mask-image linear-gradient on the text node fails the guard', async ({
			page,
		}) => {
			await openToastFixture(page, 'light', VIEWPORTS[0]);
			await page.addStyleTag({
				content:
					'.publy-toast-title { mask-image: linear-gradient(black, transparent); }',
			});
			const toast = await renderToast(page, 'success');
			await expect(
				measureContrast(
					toast.locator('.publy-toast-title'),
					'text',
					TEXT_CONTRAST_FLOOR,
				),
			).rejects.toThrow(/masked text/);
		});

		test('mask shorthand on the text node fails the guard', async ({
			page,
		}) => {
			await openToastFixture(page, 'light', VIEWPORTS[0]);
			await page.addStyleTag({
				content: '.publy-toast-title { mask: url(#mask); }',
			});
			const toast = await renderToast(page, 'success');
			await expect(
				measureContrast(
					toast.locator('.publy-toast-title'),
					'text',
					TEXT_CONTRAST_FLOOR,
				),
			).rejects.toThrow(/masked text/);
		});

		test('color rgba(0,0,0,0) on the text node fails the guard', async ({
			page,
		}) => {
			await openToastFixture(page, 'light', VIEWPORTS[0]);
			await page.addStyleTag({
				content: '.publy-toast-title { color: rgba(0, 0, 0, 0); }',
			});
			const toast = await renderToast(page, 'success');
			await expect(
				measureContrast(
					toast.locator('.publy-toast-title'),
					'text',
					TEXT_CONTRAST_FLOOR,
				),
			).rejects.toThrow(/transparent text fill/);
		});
	},
);
