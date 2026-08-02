import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { toastVariantClassNames } from '../src/components/ui/toast-variants';

/**
 * #998 browser-side toast contrast guard.
 *
 * This spec deliberately measures the real Sonner DOM after Chromium has
 * resolved the cascade. Sonner's un-layered stylesheet can beat app.css's
 * layered rules, so a source parser cannot know what the toast actually paints.
 *
 * Browser measurements: the computed foreground colour of the target and of
 * every visible text-bearing descendant, the hit-tested background stack at
 * the sampled point, flat computed gradients, resolved pseudo-element
 * styles, compositing properties on the whole ancestor chain, and the close
 * button's actual offset parent/geometry. The sampled point is the midpoint
 * of the GLYPH AREA — the text's own line boxes (text targets) or the
 * painted shapes' boxes (glyph targets) — never the target box's midpoint,
 * which can sit well away from where the text actually is. Modelled
 * operations: alpha-compositing those browser-reported sRGB layers and the
 * WCAG 2 contrast formula. The model never reads or resolves a source
 * token.
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
 * content; a click-through overlay (`pointer-events: none`) that paints a
 * background, is stacked above the opaque surface and intersects the glyph
 * area; and an ink-level pixel cross-check that fails on any glyph-area
 * pixel the model did not produce, and on any explained-colour block that
 * swallows or erases the glyphs. The last two checks — the click-through
 * scan and the pixel cross-check — are the readings that do not model the
 * paint: the scan walks the DOM unconditionally for overlays that hit
 * testing cannot see at all, and the cross-check screenshots the target's
 * box, decodes it in the page and classifies every pixel inside the glyph
 * area against the modelled paint (surface, foreground, or a blend of the
 * two), naming anything else. Paint that reaches the glyphs but is
 * invisible to the model for any other reason — an outset shadow from a
 * neighbouring element, say — is exactly what the cross-check exists to
 * see.
 *
 * What still escapes — declared, so the boundary is not mistaken for a
 * guarantee:
 * - Partial occlusion is bounded, not prohibited: an overlay that leaves
 *   the glyphs mostly legible passes (the explained-paint share of the
 *   glyph area must stay between the pristine bounds measured on the
 *   fixture and the solid-block bound), while an overlay that occludes
 *   most or all of the ink fails.
 * - Pseudo-elements are resolved for background paint only; one that paints
 *   only glyphs or text without a background is not detected.
 * - `elementsFromPoint` cannot report pseudo-element boxes, so pseudo paint
 *   is read from resolved styles instead of hit tests; a positioned pseudo
 *   whose painted box cannot be resolved from computed styles fails loudly.
 * - The pixel check classifies glyphs against a single modelled foreground
 *   (the worst-contrast one); a target whose glyphs genuinely paint in more
 *   than one colour would fail the check and needs its own measurement.
 * - Only mounted, opaque toasts are measured; enter/exit and hover
 *   intermediate states are out of scope.
 * - Text painted with `background-clip: text` resolves to a transparent
 *   computed fill and fails loudly rather than being measured.
 */

const TEXT_CONTRAST_FLOOR = 4.5;
const GLYPH_CONTRAST_FLOOR = 3;
// Ink-level pixel cross-check bounds. The check screenshots the target's
// box and classifies every pixel INSIDE the glyph area (the text's own line
// boxes, or the painted-glyph region) against the modelled paint: the
// modelled surface, the modelled foreground, or a blend of the two (the
// per-channel interval between them, widened by the antialiasing fuzz the
// browser's own text edges produce — measured at ±6 on the shipped
// fixture). Anything else is FOREIGN paint an overlay put there, and a
// single such pixel fails the guard by name. Bounds, measured on the
// pristine production fixture across all four theme/viewport legs (text
// ~31-33% explained, icon ~52%, close glyph ~27%):
const PIXEL_MATCH_TOLERANCE = 3;
const BLEND_MARGIN = 6;
const TEXT_EXPLAINED_MAX = 0.4;
const TEXT_INK_MIN = 0.06;
const GLYPH_EXPLAINED_MAX = 0.7;
const GLYPH_INK_MIN = 0.05;

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
type BackgroundLayer = { color: string; element: string; source: string };
type BrowserPaint = {
	backgroundLayers: BackgroundLayer[];
	foregrounds: string[];
};
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

const parseComputedColor = (value: string): Rgba => {
	const match =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (!match) {
		throw new Error(`Unparseable browser-reported colour: ${value}`);
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
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
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

const readBrowserPaint = async (
	target: Locator,
	kind: TargetKind,
): Promise<BrowserPaint> =>
	target.evaluate((element, targetKind) => {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Browser canvas colour resolver is unavailable');
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
				throw new Error(`${source} has unsupported background image: ${image}`);
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
		const backgroundImageLayers = (image: string, source: string): string[] =>
			image === 'none'
				? []
				: splitTopLevel(image).map((layer) => flatGradientColor(layer, source));

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
				return match ? Number(value.slice(0, -2)) : undefined;
			};

			let containing: {
				bottom: number;
				left: number;
				right: number;
				top: number;
			};
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
		 * fails loudly rather than assume. The shipped float (`::before` on
		 * the title) and sonner's own transparent hit-area pseudos pass,
		 * having no paint.
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
		const STEP_RANK: Record<PaintStep, number> = {
			negative: -1,
			'in-flow': 0,
			'positioned-auto': 1,
			positive: 2,
		};

		const paintStep = (position: string, zIndex: string): PaintStep => {
			if (position === 'static') {
				return 'in-flow';
			}
			if (zIndex === 'auto') {
				return 'positioned-auto';
			}
			return Number(zIndex) < 0 ? 'negative' : 'positive';
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

		const nearestStackingContext = (layer: Element | null): Element | null => {
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
		const glyphArea = ((): {
			bottom: number;
			left: number;
			right: number;
			top: number;
		} => {
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
				for (const shape of element.querySelectorAll(
					'path, circle, ellipse, line, polyline, polygon, rect',
				)) {
					rects.push(shape.getBoundingClientRect());
				}
			}
			if (rects.length === 0) {
				throw new Error(`${elementName(element)} has no resolvable glyph area`);
			}
			return {
				left: Math.min(...rects.map((textRect) => textRect.left)),
				right: Math.max(...rects.map((textRect) => textRect.right)),
				top: Math.min(...rects.map((textRect) => textRect.top)),
				bottom: Math.max(...rects.map((textRect) => textRect.bottom)),
			};
		})();
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
		// relative to THIS surface. Collect the background layers on the way
		// down and stop at the first element that paints one.
		const backgroundLayers: BackgroundLayer[] = [];
		const seen = new Set<Element>();
		const opaqueElement = ((): Element | null => {
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
					backgroundLayers.push({
						color: layerColor,
						element: name,
						source: 'background-image',
					});
					if (paintAlpha(layerColor, `${name} background-image`) === 1) {
						return layer;
					}
				}

				const backgroundColor = toSrgb(
					style.backgroundColor,
					`${name} background-color`,
				);
				const alpha = paintAlpha(backgroundColor, `${name} background-color`);
				if (alpha !== 0) {
					backgroundLayers.push({
						color: backgroundColor,
						element: name,
						source: 'background-color',
					});
					if (alpha === 1) {
						return layer;
					}
				}
			}
			return null;
		})();

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
					paintAlpha(aboveStyle.backgroundColor, `${aboveName} background`) !==
					0
				) {
					throw new Error(
						`${aboveName} paints a background over the sampled point: ${aboveStyle.backgroundColor}`,
					);
				}
				continue;
			}
			throw new Error(`${aboveName} unexpectedly paints above contrast target`);
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

		const foregrounds: string[] = [];
		if (targetKind === 'text') {
			const hasTextContent = (candidate: Element): boolean =>
				Array.from(candidate.childNodes).some(
					(node) =>
						node.nodeType === Node.TEXT_NODE &&
						(node.textContent ?? '').trim() !== '',
				);

			// The container's computed colour is not necessarily the colour
			// the text paints: a descendant may carry its own colour (a
			// `<Trans>` span, say), and it both paints over the sampled point
			// and is invisible to the hit-stack reading. Take the worst
			// colour among the target and every visible text-bearing
			// descendant.
			const textPainters: Element[] = [element];
			for (const descendant of element.querySelectorAll('*')) {
				if (hasTextContent(descendant)) {
					textPainters.push(descendant);
				}
			}

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
				if (painterStyle.textShadow !== 'none') {
					throw new Error(
						`${painterName} has unsupported text shadow ${painterStyle.textShadow}`,
					);
				}
				const color = toSrgb(
					painterStyle.webkitTextFillColor || painterStyle.color,
					`${painterName} text fill colour`,
				);
				if (!foregrounds.includes(color)) {
					foregrounds.push(color);
				}
			}
		} else {
			const shapes = element.querySelectorAll(
				'path, circle, ellipse, line, polyline, polygon, rect',
			);
			for (const shape of shapes) {
				const style = getComputedStyle(shape);
				assertSupportedPaint(
					style,
					shape.getBoundingClientRect(),
					x,
					y,
					`${elementName(element)} ${shape.tagName}`,
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
							`${elementName(element)} ${shape.tagName} has unsupported ${property}-opacity ${paintOpacity}`,
						);
					}
					const color = toSrgb(
						paint,
						`${elementName(element)} ${shape.tagName} ${property}`,
					);
					if (!foregrounds.includes(color)) {
						foregrounds.push(color);
					}
				}
			}
			if (foregrounds.length === 0) {
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
				paintAlpha(backgroundColor, `${elementName(candidate)} background`) !==
					0;
			if (!paints) {
				continue;
			}
			if (paintsAbove(paintChain(candidate), paintChain(opaqueElement))) {
				throw new Error(
					`${elementName(candidate)} is a click-through overlay painted above the toast surface and over the ${targetKind === 'text' ? 'text' : 'glyph'} area: ${image !== 'none' ? image : backgroundColor}`,
				);
			}
		}

		return { backgroundLayers, foregrounds };
	}, kind);

const measureContrast = async (
	target: Locator,
	kind: TargetKind,
): Promise<ContrastMeasurement> => {
	const computed = await readBrowserPaint(target, kind);
	if (computed.backgroundLayers.length === 0) {
		throw new Error('No painted background layer found behind contrast target');
	}

	const layers = computed.backgroundLayers.map((layer) =>
		parseComputedColor(layer.color),
	);
	let background = layers[layers.length - 1];
	for (let index = layers.length - 2; index >= 0; index -= 1) {
		background = alphaComposite(layers[index], background);
	}

	let minimum: ContrastMeasurement | undefined;
	for (const foregroundValue of computed.foregrounds) {
		const rawForeground = parseComputedColor(foregroundValue);
		const foreground =
			rawForeground.a === 1
				? rawForeground
				: alphaComposite(rawForeground, background);
		const measurement = {
			background,
			foreground,
			ratio: contrastRatio(foreground, background),
		};
		if (!minimum || measurement.ratio < minimum.ratio) {
			minimum = measurement;
		}
	}

	if (!minimum) {
		throw new Error('No browser-reported foreground paint found');
	}
	return minimum;
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
 * The one reading in the guard that does not model the paint: screenshot the
 * target's box, decode it in the page, and require the modelled painted
 * surface to actually be present in the composited pixels. This catches
 * paint that the model cannot see at all — an overlay with
 * `pointer-events: none` is invisible to `elementsFromPoint` by definition,
 * yet paints over the target like any other element — and independently
 * cross-checks the alpha parsing and the inset-shadow geometry. Tolerance is
 * per-channel against the browser-composited pixel; the model's surface and
 * the painted pixel differ by at most a rounding step.
 */
/**
 * The one reading in the guard that does not model the paint: screenshot the
 * target's box, decode it in the page, and measure the glyphs THEMSELVES —
 * the pixels inside the text's own line boxes (text targets) or the painted
 * shapes' boxes (glyph targets). Every pixel in that area must be explained
 * by the model: the modelled surface, the modelled foreground, or a blend of
 * the two (the per-channel interval between them, widened by the
 * antialiasing fuzz the browser's own text edges produce). A pixel that is
 * none of those is paint an overlay put there, and it fails the guard by
 * name. Two bounds keep the reading honest at the ends: the explained paint
 * must not swallow the glyph area (a solid block of any explained colour
 * would otherwise pass while occluding every glyph — round-7 B1), and it
 * must not vanish (a block of the surface colour would erase the ink). The
 * check therefore also cross-checks the alpha parsing and the inset-shadow
 * geometry, and catches paint the model cannot see at all — an overlay with
 * `pointer-events: none` is invisible to `elementsFromPoint` by definition,
 * yet paints over the target like any other element. Tolerance is per-channel
 * against the browser-composited pixel; the model's surface and the painted
 * pixel differ by at most a rounding step.
 */
const assertPaintedSurfaceVisible = async (
	target: Locator,
	kind: TargetKind,
	background: Rgba,
	foreground: Rgba,
	label: string,
): Promise<void> => {
	const box = await target.boundingBox();
	if (!box) {
		throw new Error(`${label} has no painted box to cross-check`);
	}
	const screenshot = await target.screenshot();
	const report = await target.evaluate(
		async (
			element,
			{
				background,
				blendMargin,
				box,
				dataUrl,
				foreground,
				kind,
				label,
				tolerance,
			},
		) => {
			const base64 = dataUrl.slice('data:image/png;base64,'.length);
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index += 1) {
				bytes[index] = binary.charCodeAt(index);
			}
			const bitmap = await createImageBitmap(
				new Blob([bytes], { type: 'image/png' }),
			);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Browser canvas colour resolver is unavailable');
			}
			context.drawImage(bitmap, 0, 0);
			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

			const glyphArea = ((): {
				bottom: number;
				left: number;
				right: number;
				top: number;
			} => {
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
					for (const shape of element.querySelectorAll(
						'path, circle, ellipse, line, polyline, polygon, rect',
					)) {
						rects.push(shape.getBoundingClientRect());
					}
				}
				if (rects.length === 0) {
					throw new Error(
						`${label} has no text nodes or shapes to delimit its glyph area`,
					);
				}
				return {
					left: Math.min(...rects.map((textRect) => textRect.left)) - box.x,
					right: Math.max(...rects.map((textRect) => textRect.right)) - box.x,
					top: Math.min(...rects.map((textRect) => textRect.top)) - box.y,
					bottom: Math.max(...rects.map((textRect) => textRect.bottom)) - box.y,
				};
			})();

			const isSurface = (x: number, y: number): boolean => {
				const index = (y * canvas.width + x) * 4;
				return (
					Math.abs(data[index] - background[0]) <= tolerance &&
					Math.abs(data[index + 1] - background[1]) <= tolerance &&
					Math.abs(data[index + 2] - background[2]) <= tolerance
				);
			};
			const isInk = (x: number, y: number): boolean => {
				const index = (y * canvas.width + x) * 4;
				return (
					Math.abs(data[index] - foreground[0]) <= tolerance &&
					Math.abs(data[index + 1] - foreground[1]) <= tolerance &&
					Math.abs(data[index + 2] - foreground[2]) <= tolerance
				);
			};
			const isBlend = (x: number, y: number): boolean => {
				const index = (y * canvas.width + x) * 4;
				const between = (channel: number, low: number, high: number): boolean =>
					low - blendMargin <= channel && channel <= high + blendMargin;
				return (
					between(
						data[index],
						Math.min(foreground[0], background[0]),
						Math.max(foreground[0], background[0]),
					) &&
					between(
						data[index + 1],
						Math.min(foreground[1], background[1]),
						Math.max(foreground[1], background[1]),
					) &&
					between(
						data[index + 2],
						Math.min(foreground[2], background[2]),
						Math.max(foreground[2], background[2]),
					)
				);
			};

			let surfacePixels = 0;
			let inkPixels = 0;
			let blendPixels = 0;
			let foreignPixels = 0;
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
					const index = (y * canvas.width + x) * 4;
					if (isSurface(x, y)) {
						surfacePixels += 1;
					} else if (isInk(x, y)) {
						inkPixels += 1;
					} else if (isBlend(x, y)) {
						blendPixels += 1;
					} else {
						foreignPixels += 1;
						firstForeign ??= [data[index], data[index + 1], data[index + 2]];
					}
				}
			}
			return {
				blendPixels,
				foreignPixels,
				firstForeign,
				glyphArea,
				inkPixels,
				surfacePixels,
				total,
			};
		},
		{
			background: [background.r, background.g, background.b],
			blendMargin: BLEND_MARGIN,
			box: { x: box.x, y: box.y },
			dataUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
			foreground: [foreground.r, foreground.g, foreground.b],
			kind,
			label,
			tolerance: PIXEL_MATCH_TOLERANCE,
		},
	);
	if (report.total === 0) {
		throw new Error(`${label}: the glyph area contains no pixels to measure`);
	}
	if (report.foreignPixels > 0) {
		throw new Error(
			`${label}: the glyph area contains ${report.foreignPixels} pixel(s) of paint ` +
				`the model did not produce — neither the modelled surface ${rgbaLabel(background)} ` +
				`nor the modelled text colour ${rgbaLabel(foreground)} nor a blend of the two ` +
				`(nearest foreign colour rgb(${report.firstForeign?.join(', ') ?? '?'}))`,
		);
	}
	const explainedFraction =
		(report.inkPixels + report.blendPixels) / report.total;
	const maxFraction =
		kind === 'text' ? TEXT_EXPLAINED_MAX : GLYPH_EXPLAINED_MAX;
	const minFraction = kind === 'text' ? TEXT_INK_MIN : GLYPH_INK_MIN;
	if (explainedFraction < minFraction) {
		throw new Error(
			`${label}: no legible glyph ink in the glyph area — only ` +
				`${explainedFraction.toFixed(3)} of ${report.total} glyph-area pixels are ` +
				`explained paint (surface ${report.surfacePixels}, ink ${report.inkPixels}, ` +
				`blends ${report.blendPixels}) — the text may be painted over by the surface colour`,
		);
	}
	if (explainedFraction > maxFraction) {
		throw new Error(
			`${label}: ${explainedFraction.toFixed(3)} of ${report.total} glyph-area pixels ` +
				`are explained paint — a solid block of an explained colour (surface, text ` +
				`colour or a blend) is covering the glyphs (ink ${report.inkPixels}, blends ` +
				`${report.blendPixels}, surface ${report.surfacePixels})`,
		);
	}
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
	const measurement = await measureContrast(target, kind);
	await assertPaintedSurfaceVisible(
		target,
		kind,
		measurement.background,
		measurement.foreground,
		label,
	);
	const description =
		`${label}: ${measurement.ratio.toFixed(2)}:1 ` +
		`(foreground ${rgbaLabel(measurement.foreground)}, ` +
		`painted surface ${rgbaLabel(measurement.background)})`;
	testInfo.annotations.push({ type: 'contrast', description });
	expect.soft(measurement.ratio, description).toBeGreaterThanOrEqual(floor);
	return measurement;
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
	const fixture = page.getByTestId('toast-contrast-fixture');
	await expect(fixture).toBeVisible();
	await expect(fixture).toHaveAttribute('data-hydrated', 'true');
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
		measureContrast(toast.locator('.publy-toast-title'), 'text'),
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
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
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
		measureContrast(toast.locator('.publy-toast-title'), 'text'),
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
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
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
		measureContrast(toast.locator('.publy-toast-title'), 'text'),
	).rejects.toThrow(/paints a background over the sampled point/);
});

test('an edge accent stripe on the toast stays measured', async ({ page }) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 3px; background: var(--publy-toast-accent); pointer-events: none; }",
	});
	const toast = await renderToast(page, 'success');
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
});

/**
 * Round-7 M2's second undeclared gap, closed in code: a RELATIVELY
 * positioned pseudo paints the origin's box translated by its offsets, and
 * resolving that box was exactly what the old rule did not do — it tested
 * the origin's own rectangle, which is where the pseudo ISN'T when it is
 * offset away. This pseudo paints over the close-button corner, far from
 * the title's ink; before the fix the origin rectangle still contained the
 * sampled point and the guard redded a paint that never reached the text.
 */
test('a relatively positioned pseudo offset away from the glyphs stays measured', async ({
	page,
}) => {
	await openToastFixture(page, 'light', VIEWPORTS[0]);
	await page.addStyleTag({
		content:
			".publy-toast-title::after { content: ''; position: relative; z-index: 1; left: 250px; top: 5px; width: 46px; height: 11px; background: rgb(255 0 0); pointer-events: none; }",
	});
	const toast = await renderToast(page, 'success');
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
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
		measureContrast(toast.locator('.publy-toast-title'), 'text'),
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
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
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
		measureContrast(toast.locator('.publy-toast-title'), 'text'),
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
	const measurement = await measureContrast(
		toast.locator('.publy-toast-title'),
		'text',
	);
	expect(measurement.ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
});

/**
 * Round-7 M2's first undeclared gap, closed by the ink-level pixel check:
 * an OUTSET shadow from a neighbouring element paints over the toast, is
 * not a background (so the click-through scan skips it) and sits outside
 * the hit stack at the ink (only the element's own box hit-tests, not its
 * shadow) — the model cannot see it at all. Only the pixel check can, and
 * it must, by name: the shadowed glyphs are a solid block of an explained
 * colour.
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
	).rejects.toThrow(/solid block of an explained colour/);
});
