import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * The toast surface (#991) is not a flat token: `.publy-toast` paints a
 * semantic alert tint as a gradient layer over `--publy-surface-raised`, and
 * two of the four tints are translucent. So the colour the message text and
 * the variant icon are actually read against exists nowhere in the token
 * layer — it is a composite, and no per-token contrast check can see it.
 *
 * This guard reproduces that composite from the tokens themselves and pins
 * both contrast floors, so retuning any alert tint, the raised surface, or the
 * foreground tokens cannot quietly push a toast under them.
 *
 * Mirrors the pattern in avatar-fallback-contrast.test.ts, widened to parse
 * the translucent alpha-channel tint tokens that test's hex-only reader
 * cannot.
 */

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCss = readFileSync(path.join(rootDir, 'app.css'), 'utf8');

/** WCAG 1.4.3 small text. */
const TEXT_CONTRAST_FLOOR = 4.5;
/** WCAG 1.4.11 non-text (the variant glyph, the close glyph). */
const GRAPHIC_CONTRAST_FLOOR = 3;

type Theme = ':root' | 'html.dark';
type Rgba = { r: number; g: number; b: number; a: number };

const VARIANTS = [
	{
		name: 'success',
		tint: '--publy-alert-success-bg',
		icon: '--publy-alert-success-text',
	},
	{
		name: 'error',
		tint: '--publy-alert-danger-bg',
		icon: '--publy-alert-danger-text',
	},
	{
		name: 'warning',
		tint: '--publy-alert-warning-bg',
		icon: '--publy-alert-warning-text',
	},
	{
		name: 'info',
		tint: '--publy-alert-info-bg',
		icon: '--publy-alert-info-text',
	},
] as const;

const extractBlock = (header: Theme): string => {
	const start = appCss.indexOf(`${header} {`);
	if (start === -1) {
		throw new Error(`Missing ${header} theme block`);
	}

	let depth = 0;
	for (let index = start; index < appCss.length; index += 1) {
		if (appCss[index] === '{') {
			depth += 1;
		} else if (appCss[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return appCss.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Unclosed ${header} theme block`);
};

const findToken = (block: string, token: string): string | undefined =>
	new RegExp(`${token}:\\s*([^;]+);`).exec(block)?.[1].trim();

/** Dark inherits any token it does not restate, exactly as the cascade does. */
const resolveToken = (theme: Theme, token: string): string => {
	if (theme === 'html.dark') {
		const darkValue = findToken(extractBlock('html.dark'), token);
		if (darkValue) {
			return darkValue;
		}
	}

	const lightValue = findToken(extractBlock(':root'), token);
	if (!lightValue) {
		throw new Error(`Missing token ${token}`);
	}

	return lightValue;
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

	const rgba =
		/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/.exec(
			value,
		);
	if (rgba) {
		return {
			r: Number(rgba[1]),
			g: Number(rgba[2]),
			b: Number(rgba[3]),
			a: rgba[4] === undefined ? 1 : Number(rgba[4]),
		};
	}

	throw new Error(`Unparseable colour value "${value}"`);
};

/** Source-over composite: the tint layer painted on an opaque surface. */
const composite = (tint: Rgba, surface: Rgba): Rgba => ({
	r: tint.r * tint.a + surface.r * (1 - tint.a),
	g: tint.g * tint.a + surface.g * (1 - tint.a),
	b: tint.b * tint.a + surface.b * (1 - tint.a),
	a: 1,
});

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

const toastSurface = (theme: Theme, tintToken: string): Rgba =>
	composite(
		parseColor(resolveToken(theme, tintToken)),
		parseColor(resolveToken(theme, '--publy-surface-raised')),
	);

describe('toast variant surfaces stay legible in both themes', () => {
	for (const theme of [':root', 'html.dark'] as const) {
		for (const variant of VARIANTS) {
			test(`${theme} ${variant.name}: message text clears the small-text floor`, () => {
				const ratio = contrastRatio(
					parseColor(resolveToken(theme, '--publy-foreground')),
					toastSurface(theme, variant.tint),
				);

				expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
			});

			test(`${theme} ${variant.name}: description text clears the small-text floor`, () => {
				const ratio = contrastRatio(
					parseColor(resolveToken(theme, '--publy-foreground-secondary')),
					toastSurface(theme, variant.tint),
				);

				expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
			});

			test(`${theme} ${variant.name}: variant glyph clears the non-text floor`, () => {
				const ratio = contrastRatio(
					parseColor(resolveToken(theme, variant.icon)),
					toastSurface(theme, variant.tint),
				);

				expect(ratio).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST_FLOOR);
			});

			test(`${theme} ${variant.name}: close glyph clears the non-text floor`, () => {
				const ratio = contrastRatio(
					parseColor(resolveToken(theme, '--publy-foreground-muted')),
					toastSurface(theme, variant.tint),
				);

				expect(ratio).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST_FLOOR);
			});
		}
	}

	test('the neutral toast surface is the raised surface itself', () => {
		// `.publy-toast` defaults `--publy-toast-tint` to `--publy-surface-raised`
		// so the default/loading toast paints the surface over itself. If that
		// default ever changes to a real tint, the four variant blocks above stop
		// covering the neutral case and this test is the reminder.
		expect(appCss).toContain(
			'--publy-toast-tint: var(--publy-surface-raised);',
		);
	});
});
