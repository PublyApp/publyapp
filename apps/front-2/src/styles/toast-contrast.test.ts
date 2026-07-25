import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * The toast surface (#991) is not a flat token: `.publy-toast` paints a
 * semantic alert tint as a gradient layer over an opaque raised surface, and
 * two of the four tints are translucent. So the colour the message text and
 * the variant icon are actually read against exists nowhere in the token
 * layer — it is a composite, and no per-token contrast check can see it.
 *
 * The first version of this guard hardcoded its own copy of the variant→token
 * mapping and recomputed composites from that copy. Review of #991 proved that
 * worthless: rewiring the real declaration to
 * `.publy-toast-success { --publy-toast-tint: var(--publy-foreground); }`
 * makes the rendered toast illegible and every test still passed, because the
 * guard never read `.publy-toast-*` at all.
 *
 * This version owns no mapping. It reads the real rule blocks out of app.css,
 * resolves each colour through the real `var()` chain with the real cascade
 * (variant rule → `.publy-toast` → theme token block), and pins the one
 * structural assumption it cannot derive — that the surface is a flat tint
 * gradient over a solid colour — with an assertion that fails loudly if the
 * background declarations stop having that shape.
 */

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCss = readFileSync(path.join(rootDir, 'app.css'), 'utf8');

/** WCAG 1.4.3 small text. */
const TEXT_CONTRAST_FLOOR = 4.5;
/** WCAG 1.4.11 non-text (the variant glyph, the close glyph). */
const GRAPHIC_CONTRAST_FLOOR = 3;

const THEMES = [':root', 'html\\.dark'] as const;
type Theme = (typeof THEMES)[number];

const TOAST_SELECTOR = '.publy-toast';
/** Every semantic variant toaster.tsx's classNames map can put on a toast. */
const VARIANT_SELECTORS = [
	'.publy-toast-success',
	'.publy-toast-error',
	'.publy-toast-warning',
	'.publy-toast-info',
] as const;

type Rgba = { r: number; g: number; b: number; a: number };

// ---------------------------------------------------------------------------
// Reading the real rules
// ---------------------------------------------------------------------------

const stripComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, '');

const cssSource = stripComments(appCss);

/**
 * The declaration body of the rule whose selector list is exactly `selector`.
 * Anchored to the start of a line and terminated by `{`, so `.publy-toast`
 * cannot match `.publy-toast-success` or `.publy-toast:focus-visible …`.
 */
const findRuleBody = (selector: string): string => {
	const pattern = new RegExp(`(^|\\n)[\\t ]*${selector}[\\t ]*\\{`);
	const match = pattern.exec(cssSource);
	if (!match) {
		throw new Error(
			`app.css has no rule for "${selector}" — the toast contrast guard can no longer see what it is meant to check.`,
		);
	}

	const open = cssSource.indexOf('{', match.index);
	let depth = 0;
	for (let index = open; index < cssSource.length; index += 1) {
		if (cssSource[index] === '{') {
			depth += 1;
		} else if (cssSource[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return cssSource.slice(open + 1, index);
			}
		}
	}

	throw new Error(`Unclosed rule for "${selector}"`);
};

const declarationsOf = (body: string): Map<string, string> => {
	const declarations = new Map<string, string>();
	for (const statement of body.split(';')) {
		const separator = statement.indexOf(':');
		if (separator === -1) {
			continue;
		}
		const property = statement.slice(0, separator).trim();
		const value = statement.slice(separator + 1).trim();
		if (!property || property.includes('{') || property.includes('}')) {
			continue;
		}
		declarations.set(property, value.replace(/\s+/g, ' '));
	}

	return declarations;
};

const ruleCache = new Map<string, Map<string, string>>();
const rule = (selector: string): Map<string, string> => {
	const cached = ruleCache.get(selector);
	if (cached) {
		return cached;
	}
	const parsed = declarationsOf(findRuleBody(selector));
	ruleCache.set(selector, parsed);
	return parsed;
};

const declaration = (selector: string, property: string): string => {
	const value = rule(selector).get(property);
	if (value === undefined) {
		throw new Error(
			`app.css rule "${selector}" no longer declares "${property}" — the toast contrast guard cannot verify a surface it cannot read.`,
		);
	}
	return value;
};

// ---------------------------------------------------------------------------
// var() resolution against the real cascade
// ---------------------------------------------------------------------------

/**
 * Resolves a custom property the way the browser would for an element carrying
 * `.publy-toast` plus (optionally) a variant class: the variant rule and the
 * base toast rule have equal specificity, so source order makes the variant
 * win; anything neither declares falls through to the theme token block, and
 * `html.dark` inherits from `:root` whatever it does not restate.
 */
const lookupCustomProperty = (
	name: string,
	theme: Theme,
	variantSelector?: string,
): string => {
	if (variantSelector) {
		const scoped = rule(variantSelector).get(name);
		if (scoped !== undefined) {
			return scoped;
		}
	}

	const base = rule(TOAST_SELECTOR).get(name);
	if (base !== undefined) {
		return base;
	}

	if (theme === 'html\\.dark') {
		const dark = rule('html\\.dark').get(name);
		if (dark !== undefined) {
			return dark;
		}
	}

	const light = rule(':root').get(name);
	if (light !== undefined) {
		return light;
	}

	throw new Error(
		`Custom property "${name}" is not declared anywhere in app.css`,
	);
};

const parseColor = (value: string): Rgba => {
	const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
	if (hex) {
		return {
			r: Number.parseInt(hex[1].slice(0, 2), 16),
			g: Number.parseInt(hex[1].slice(2, 4), 16),
			b: Number.parseInt(hex[1].slice(4, 6), 16),
			a: 1,
		};
	}

	const channels =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (channels) {
		return {
			r: Number(channels[1]),
			g: Number(channels[2]),
			b: Number(channels[3]),
			a: channels[4] === undefined ? 1 : Number(channels[4]),
		};
	}

	throw new Error(`Unparseable colour value "${value}"`);
};

/** Follows a `var(--x)` chain to the literal colour it ends at. */
const resolveColor = (
	rawValue: string,
	theme: Theme,
	variantSelector?: string,
): Rgba => {
	let value = rawValue.trim();
	const seen = new Set<string>();

	for (;;) {
		const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
		if (!reference) {
			return parseColor(value);
		}

		const name = reference[1];
		if (seen.has(name)) {
			throw new Error(`Circular var() chain through "${name}"`);
		}
		seen.add(name);
		value = lookupCustomProperty(name, theme, variantSelector);
	}
};

// ---------------------------------------------------------------------------
// The composite the browser actually paints
// ---------------------------------------------------------------------------

/**
 * `.publy-toast` paints `background-image: linear-gradient(<tint>, <tint>)`
 * over `background-color: <base>`. That shape is the only thing this guard
 * assumes rather than derives, so it is asserted: if the declarations stop
 * being a flat two-stop gradient over a solid colour, this throws instead of
 * quietly modelling something the browser no longer renders.
 */
const readSurfaceRecipe = (): { base: string; tint: string } => {
	const base = declaration(TOAST_SELECTOR, 'background-color');
	const image = declaration(TOAST_SELECTOR, 'background-image');

	const gradient =
		/^linear-gradient\(\s*(var\(\s*--[\w-]+\s*\))\s*,\s*(var\(\s*--[\w-]+\s*\))\s*\)$/.exec(
			image,
		);
	if (!gradient || gradient[1] !== gradient[2]) {
		throw new Error(
			`.publy-toast background-image is "${image}", not the flat two-stop tint gradient this guard models. Update the guard together with the surface.`,
		);
	}

	return { base, tint: gradient[1] };
};

const compositeSurface = (theme: Theme, variantSelector?: string): Rgba => {
	const recipe = readSurfaceRecipe();
	const base = resolveColor(recipe.base, theme, variantSelector);
	const tint = resolveColor(recipe.tint, theme, variantSelector);

	return {
		r: tint.r * tint.a + base.r * (1 - tint.a),
		g: tint.g * tint.a + base.g * (1 - tint.a),
		b: tint.b * tint.a + base.b * (1 - tint.a),
		a: 1,
	};
};

const relativeLuminance = ({ r, g, b }: Rgba): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (a: Rgba, b: Rgba): number => {
	const first = relativeLuminance(a);
	const second = relativeLuminance(b);
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
};

/** Every ink the toast paints on its own surface, read from the real rules. */
const INKS = [
	{
		what: 'message text',
		selector: TOAST_SELECTOR,
		floor: TEXT_CONTRAST_FLOOR,
	},
	{
		what: 'description text',
		selector: '.publy-toast-description',
		floor: TEXT_CONTRAST_FLOOR,
	},
	{
		what: 'variant glyph',
		selector: '.publy-toast-icon',
		floor: GRAPHIC_CONTRAST_FLOOR,
	},
	{
		what: 'close glyph',
		selector: '.publy-toast-close-button',
		floor: GRAPHIC_CONTRAST_FLOOR,
	},
] as const;

const themeLabel = (theme: Theme): string =>
	theme === ':root' ? 'light' : 'dark';

describe('toast surfaces stay legible in both themes', () => {
	test('the surface recipe is still the shape this guard models', () => {
		const recipe = readSurfaceRecipe();
		expect(recipe.base).toMatch(/^var\(--publy-[\w-]+\)$/);
		expect(recipe.tint).toMatch(/^var\(--publy-[\w-]+\)$/);
	});

	test('every variant class the toaster can apply is styled', () => {
		// toaster.tsx maps success/error/warning/info onto these classes; a
		// variant that lost its rule would silently fall back to the neutral
		// tone and never be contrast-checked below.
		for (const selector of VARIANT_SELECTORS) {
			expect(() => rule(selector)).not.toThrow();
		}
	});

	for (const theme of THEMES) {
		// `undefined` is the neutral (message/loading) toast: no variant class.
		for (const variantSelector of [undefined, ...VARIANT_SELECTORS]) {
			const label = variantSelector ?? '.publy-toast (neutral)';

			for (const ink of INKS) {
				test(`${themeLabel(theme)} ${label}: ${ink.what} clears ${ink.floor}:1`, () => {
					const surface = compositeSurface(theme, variantSelector);
					const colour = resolveColor(
						declaration(ink.selector, 'color'),
						theme,
						variantSelector,
					);

					expect(contrastRatio(colour, surface)).toBeGreaterThanOrEqual(
						ink.floor,
					);
				});
			}
		}
	}
});
