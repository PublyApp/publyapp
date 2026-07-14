/**
 * W4-GUARDS (round-4 remediation, W4-UI F1): no test asserted computed
 * focus-ring *contrast*, only class-name presence. r3 previously "fixed"
 * this finding and made it worse (compounded opacity) and nothing noticed.
 *
 * This reads the real `app.css` source (the file the build actually
 * compiles), resolves `--publy-focus-ring` for both themes — following
 * `color-mix(in srgb, var(--x) N%, transparent)` composited over the
 * adjacent surface exactly like a browser would render it — and asserts a
 * project-approved >=3:1 contrast floor (WCAG 2.x non-text/UI-component
 * minimum) against every control's rendered ring. Also parses each
 * consumer's utility class string for a `ring-ring/NN` opacity suffix so a
 * regression in either the token OR a component's utility is caught.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const appCssPath = path.join(rootDir, 'app.css');
const uiDir = path.resolve(rootDir, '../components/ui');

const CONTRAST_FLOOR = 3.0;

type Rgb = { r: number; g: number; b: number; a: number };

const HEX_PATTERN = /^#([0-9a-fA-F]{3,8})$/;

const parseHex = (hex: string): Rgb => {
	const match = HEX_PATTERN.exec(hex.trim());
	if (!match) {
		throw new Error(`Not a hex colour: ${hex}`);
	}
	let value = match[1];
	if (value.length === 3) {
		value = [...value].map((c) => c + c).join('');
	}
	const r = Number.parseInt(value.slice(0, 2), 16);
	const g = Number.parseInt(value.slice(2, 4), 16);
	const b = Number.parseInt(value.slice(4, 6), 16);
	const a =
		value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1;
	return { r, g, b, a };
};

/** Extracts a `:root { ... }` / `html.dark { ... }` (or any) top-level block by header regex, brace-counted. */
const extractBlock = (source: string, headerPattern: RegExp): string => {
	const lines = source.split('\n');
	const startIndex = lines.findIndex((line) => headerPattern.test(line));
	if (startIndex === -1) {
		throw new Error(`Block not found for ${headerPattern}`);
	}
	let depth = 0;
	let endIndex = startIndex;
	for (let index = startIndex; index < lines.length; index += 1) {
		depth += (lines[index].match(/{/g) ?? []).length;
		depth -= (lines[index].match(/}/g) ?? []).length;
		if (depth === 0 && index > startIndex) {
			endIndex = index;
			break;
		}
	}
	return lines.slice(startIndex, endIndex + 1).join('\n');
};

const extractDeclarations = (blockText: string): Map<string, string> => {
	const declarations = new Map<string, string>();
	const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(blockText))) {
		declarations.set(match[1], match[2].trim());
	}
	return declarations;
};

const composite = (fg: Rgb, bg: Rgb): Rgb => ({
	r: fg.r * fg.a + bg.r * (1 - fg.a),
	g: fg.g * fg.a + bg.g * (1 - fg.a),
	b: fg.b * fg.a + bg.b * (1 - fg.a),
	a: 1,
});

/** Resolves a token value (hex literal, `var(--x)` reference, or
 * `color-mix(in srgb, var(--x) N%, transparent)`) to an opaque RGB,
 * compositing any transparency over `backgroundHex`. */
const resolveColor = (
	value: string,
	declarations: Map<string, string>,
	backgroundHex: string,
	depth = 0,
): Rgb => {
	if (depth > 10) {
		throw new Error(`Token reference cycle resolving: ${value}`);
	}
	const trimmed = value.trim();

	const varMatch = /^var\((--[\w-]+)\)$/.exec(trimmed);
	if (varMatch) {
		const referenced = declarations.get(varMatch[1]);
		if (referenced === undefined) {
			throw new Error(`Unresolved token reference: ${varMatch[1]}`);
		}
		return resolveColor(referenced, declarations, backgroundHex, depth + 1);
	}

	const colorMixMatch =
		/^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/.exec(
			trimmed,
		);
	if (colorMixMatch) {
		const [, tokenName, percentText] = colorMixMatch;
		const referenced = declarations.get(tokenName);
		if (referenced === undefined) {
			throw new Error(`Unresolved token reference: ${tokenName}`);
		}
		const base = resolveColor(
			referenced,
			declarations,
			backgroundHex,
			depth + 1,
		);
		const alpha = Number.parseFloat(percentText) / 100;
		return composite({ ...base, a: alpha }, parseHex(backgroundHex));
	}

	if (HEX_PATTERN.test(trimmed)) {
		const parsed = parseHex(trimmed);
		return parsed.a < 1 ? composite(parsed, parseHex(backgroundHex)) : parsed;
	}

	throw new Error(`Unsupported colour value shape: ${trimmed}`);
};

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (a: Rgb, b: Rgb): number => {
	const lumA = relativeLuminance(a);
	const lumB = relativeLuminance(b);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
};

/** Extracts the ring-opacity suffix (if any) a consumer applies on top of
 * the `--ring` token, e.g. `focus-visible:ring-ring/15` -> 0.15. Absent
 * suffix means full-strength (1). */
const extractConsumerRingAlpha = (source: string): number => {
	const match = /focus-visible:ring-ring(?:\/(\d+))?\b/.exec(source);
	if (!match) {
		throw new Error('No focus-visible:ring-ring utility found in consumer');
	}
	return match[1] ? Number.parseInt(match[1], 10) / 100 : 1;
};

const THEMES = [
	{
		name: 'light',
		headerPattern: /^:root\s*\{/,
		surfaceToken: '--publy-surface',
	},
	{
		name: 'dark',
		headerPattern: /^html\.dark\s*\{/,
		surfaceToken: '--publy-surface',
	},
] as const;

const CONSUMERS = [
	'input.tsx',
	'textarea.tsx',
	'button.tsx',
	'checkbox.tsx',
	'switch.tsx',
	'tabs.tsx',
	'badge.tsx',
	'drawer.tsx',
	'confirm-dialog.tsx',
	'select.tsx',
] as const;

describe('focus-ring contrast (W4-GUARDS ui-F1)', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');
	const rootBlock = extractBlock(appCssSource, /^:root\s*\{/);
	const darkBlock = extractBlock(appCssSource, /^html\.dark\s*\{/);
	const allDeclarations = new Map([
		...extractDeclarations(rootBlock),
		...extractDeclarations(darkBlock),
	]);

	for (const theme of THEMES) {
		const themeBlock = theme.name === 'light' ? rootBlock : darkBlock;
		const themeDeclarations = extractDeclarations(themeBlock);
		// Overlay theme-scoped overrides on top of root fallbacks (mirrors how
		// html.dark actually cascades over :root in the browser).
		const declarations = new Map([...allDeclarations, ...themeDeclarations]);
		const ringTokenValue = declarations.get('--publy-focus-ring');
		const surfaceHex = declarations.get(theme.surfaceToken);
		if (ringTokenValue === undefined || surfaceHex === undefined) {
			throw new Error(`Missing token for ${theme.name} theme`);
		}
		if (!HEX_PATTERN.test(surfaceHex)) {
			throw new Error(
				`Expected surface token to be a hex literal: ${surfaceHex}`,
			);
		}

		test(`--publy-focus-ring token alone clears ${CONTRAST_FLOOR}:1 against --publy-surface in ${theme.name} mode`, () => {
			const ringRgb = resolveColor(ringTokenValue, declarations, surfaceHex);
			const surfaceRgb = parseHex(surfaceHex);
			const ratio = contrastRatio(ringRgb, surfaceRgb);
			expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
		});

		for (const consumer of CONSUMERS) {
			test(`${consumer} renders a >= ${CONTRAST_FLOOR}:1 focus ring in ${theme.name} mode`, () => {
				const consumerSource = readFileSync(path.join(uiDir, consumer), 'utf8');
				const consumerAlpha = extractConsumerRingAlpha(consumerSource);
				const surfaceRgb = parseHex(surfaceHex);
				const tokenRgb = resolveColor(ringTokenValue, declarations, surfaceHex);
				const renderedRingRgb = composite(
					{ ...tokenRgb, a: consumerAlpha },
					surfaceRgb,
				);
				const ratio = contrastRatio(renderedRingRgb, surfaceRgb);
				expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
			});
		}
	}
});
