import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';

import { toastVariantClassNames } from '../src/components/ui/toast-variants';
import type { ToastMethod } from '../src/lib/mutation-toast';

/**
 * #998 browser-side toast contrast guard.
 *
 * This spec deliberately measures the real Sonner DOM after Chromium has
 * resolved the cascade. Sonner's un-layered stylesheet can beat app.css's
 * layered rules, so a source parser cannot know what the toast actually paints.
 *
 * Browser measurements: the computed foreground colour of the target and of
 * every visible text-bearing descendant, the hit-tested background stack at
 * each target's midpoint, flat computed gradients, resolved pseudo-element
 * styles, compositing properties on the whole ancestor chain, and the close
 * button's actual offset parent/geometry. Modelled operations:
 * alpha-compositing those browser-reported sRGB layers and the WCAG 2
 * contrast formula. The model never reads or resolves a source token.
 *
 * The guard fails loudly, by element name, when it cannot determine the
 * painted result: opacity, filter, backdrop-filter or mix-blend-mode other
 * than the neutral values anywhere on the ancestor chain; inset shadows
 * whose band (offset, spread and blur) can reach the sampled point; text
 * shadows; background images that are not a flat linear gradient;
 * pseudo-elements that paint a background whose box, resolved from computed
 * styles, contains the sampled point; and a modelled painted surface that
 * the composited pixels of the target's box do not contain. That last
 * check — the pixel cross-check — is the one reading that does not model
 * the paint: it screenshots the target's box, decodes it in the page and
 * requires the modelled surface to be present, which also catches what hit
 * testing cannot see at all (a click-through `pointer-events: none`
 * overlay), naming the overlays it finds.
 *
 * What still escapes — declared, so the boundary is not mistaken for a
 * guarantee:
 * - The sampled point is each target's box midpoint. Paint that provably
 *   cannot reach it (an inset highlight at a box edge, say) is accepted, and
 *   a defect elsewhere in the box is not sampled.
 * - Pseudo-elements are resolved for background paint only; one that paints
 *   only glyphs or text without a background is not detected.
 * - `elementsFromPoint` cannot report pseudo-element boxes, so pseudo paint
 *   is read from resolved styles instead of hit tests; a positioned pseudo
 *   whose painted box cannot be resolved from computed styles fails loudly.
 * - The pixel cross-check asserts the modelled surface is PRESENT in the
 *   target's box, not that nothing else is; an overlay that leaves part of
 *   the box untouched is accepted.
 * - Only mounted, opaque toasts are measured; enter/exit and hover
 *   intermediate states are out of scope.
 * - Text painted with `background-clip: text` resolves to a transparent
 *   computed fill and fails loudly rather than being measured.
 */

const TEXT_CONTRAST_FLOOR = 4.5;
const GLYPH_CONTRAST_FLOOR = 3;
// Per-channel distance between the modelled painted surface and a
// composited pixel for the pixel cross-check: the model composites
// browser-reported sRGB values, so the browser's own composited pixel
// differs by at most a rounding step. And how many pixels of the target's
// box must show that surface.
const PIXEL_MATCH_TOLERANCE = 3;
const PIXEL_MATCH_MIN_COUNT = 16;

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
 * including the neutral `default`. It is pinned to the product's raise
 * path, the `ToastMethod` union in `mutation-toast.ts`: that union has no
 * `loading` member and nothing in the product calls
 * `toast.loading`/`toast.promise`, so the `loading` class cannot be raised
 * today and is excluded on that fact — not on what it paints. The
 * assignment below fails to typecheck the day `ToastMethod` grows a
 * member, and the runtime assertions fail the day `toastVariantClassNames`
 * grows a variant, until a toast for it is measured here.
 */
test('every product toast variant is contrast-measured', () => {
	const measuredVariants: readonly ToastMethod[] = [...VARIANTS, 'default'];
	expect([...measuredVariants].sort()).toEqual(
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
				const offsetParent = (layer as HTMLElement).offsetParent;
				containing =
					offsetParent === null
						? { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
						: offsetParent.getBoundingClientRect();
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
		 * out the measured text; one whose box provably does not contain it
		 * (an edge accent stripe, a corner ornament) passes, and one whose
		 * box cannot be resolved fails loudly rather than assume. The shipped
		 * float (`::before` on the title) and sonner's own transparent
		 * hit-area pseudos pass, having no paint.
		 */
		const assertNoPseudoOverlay = (
			layer: Element,
			x: number,
			y: number,
			source: string,
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

		const rect = element.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			throw new Error('Contrast target has no painted box');
		}
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const hitStack = document.elementsFromPoint(x, y);
		const targetIndex = hitStack.indexOf(element);
		if (targetIndex === -1) {
			throw new Error(
				'Contrast target is absent from its own painted hit stack',
			);
		}
		for (const paintedAbove of hitStack.slice(0, targetIndex)) {
			const aboveName = elementName(paintedAbove);
			assertNoPseudoOverlay(paintedAbove, x, y, aboveName);
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

		const backgroundLayers: BackgroundLayer[] = [];
		const seen = new Set<Element>();
		let foundOpaqueLayer = false;

		const pushBackgroundPaint = (
			color: string,
			layerName: string,
			source: string,
		): void => {
			backgroundLayers.push({ color, element: layerName, source });
			if (paintAlpha(color, `${layerName} ${source}`) === 1) {
				foundOpaqueLayer = true;
			}
		};

		for (const layer of hitStack.slice(targetIndex)) {
			if (seen.has(layer)) {
				continue;
			}
			seen.add(layer);

			const name = elementName(layer);
			const style = getComputedStyle(layer);
			assertSupportedPaint(style, layer.getBoundingClientRect(), x, y, name);
			assertNoPseudoOverlay(layer, x, y, name);

			for (const layerColor of backgroundImageLayers(
				style.backgroundImage,
				name,
			)) {
				pushBackgroundPaint(layerColor, name, 'background-image');
			}

			const backgroundColor = toSrgb(
				style.backgroundColor,
				`${name} background-color`,
			);
			const alpha = paintAlpha(backgroundColor, `${name} background-color`);
			if (alpha !== 0) {
				pushBackgroundPaint(backgroundColor, name, 'background-color');
			}
			if (foundOpaqueLayer) {
				break;
			}
		}

		if (!foundOpaqueLayer) {
			throw new Error(
				'No opaque painted background found behind contrast target',
			);
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
			assertNoPseudoOverlay(layer, x, y, name);
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
const assertPaintedSurfaceVisible = async (
	target: Locator,
	background: Rgba,
	label: string,
): Promise<void> => {
	const page = target.page();
	const box = await target.boundingBox();
	if (!box) {
		throw new Error(`${label} has no painted box to cross-check`);
	}
	const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const screenshot = await target.screenshot();
	const report = await page.evaluate(
		async ({ background, dataUrl, tolerance }) => {
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
			let matchCount = 0;
			let nearestDistance = Number.POSITIVE_INFINITY;
			let nearest: [number, number, number] = [0, 0, 0];
			for (let index = 0; index < data.length; index += 4) {
				const distance = Math.max(
					Math.abs(data[index] - background[0]),
					Math.abs(data[index + 1] - background[1]),
					Math.abs(data[index + 2] - background[2]),
				);
				if (distance <= tolerance) {
					matchCount += 1;
				}
				if (distance < nearestDistance) {
					nearestDistance = distance;
					nearest = [data[index], data[index + 1], data[index + 2]];
				}
			}
			return {
				matchCount,
				nearest,
				nearestDistance,
				pixelCount: data.length / 4,
			};
		},
		{
			background: [background.r, background.g, background.b],
			dataUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
			tolerance: PIXEL_MATCH_TOLERANCE,
		},
	);
	if (report.matchCount < PIXEL_MATCH_MIN_COUNT) {
		// Name the likely cause: hit testing cannot see click-through paint,
		// so look for elements that paint a background over the sampled
		// point while carrying `pointer-events: none`.
		const overlays = await page.evaluate(({ x, y }) => {
			const names: string[] = [];
			for (const element of document.querySelectorAll('body *')) {
				const rect = element.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) {
					continue;
				}
				if (
					x < rect.left ||
					x > rect.right ||
					y < rect.top ||
					y > rect.bottom
				) {
					continue;
				}
				const style = getComputedStyle(element);
				if (style.pointerEvents !== 'none') {
					continue;
				}
				const name =
					element.getAttribute('data-testid') ??
					element.getAttribute('data-slot') ??
					element.tagName.toLowerCase();
				if (style.backgroundImage !== 'none') {
					names.push(`${name} (${style.backgroundImage})`);
					continue;
				}
				if (
					style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
					style.backgroundColor !== 'transparent'
				) {
					names.push(`${name} (${style.backgroundColor})`);
				}
			}
			return names;
		}, point);
		throw new Error(
			`${label}: modelled painted surface ${rgbaLabel(background)} is absent from the painted box ` +
				`(nearest painted colour rgb(${report.nearest.join(', ')}), channel distance ` +
				`${report.nearestDistance}, ${report.matchCount}/${report.pixelCount} pixels match); ` +
				`click-through overlays at the sampled point: ${overlays.join(', ') || 'none found'}`,
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
	await assertPaintedSurfaceVisible(target, measurement.background, label);
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
	await expect(page.getByTestId('toast-contrast-fixture')).toBeVisible();
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
