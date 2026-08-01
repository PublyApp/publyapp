import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveEffectiveDeclarations } from './css-cascade-test-support';

const appCssPath = path.resolve(process.cwd(), 'src/styles/app.css');
// Comments are stripped before token extraction so a token name mentioned in
// prose cannot masquerade as a real declaration.
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

const SMALL_TEXT_CONTRAST_FLOOR = 4.5;

// Every `*-description` primitive whose text must stay legible on the three
// surfaces drawer-style description lines actually sit on (#1043). The list
// is the source of truth: a new failing description class should be added
// here, not worked around per-surface.
const DESCRIPTION_SELECTORS = [
	'.publy-drawer-description',
	'.publy-field-switch-description',
	'.publy-danger-zone-row-description',
];

const SURFACE_TOKENS = [
	'--publy-surface',
	'--publy-surface-muted',
	'--publy-surface-raised',
] as const;

type Rgb = { r: number; g: number; b: number };

const extractBlock = (header: ':root' | 'html.dark'): string => {
	const start = appCssSource.indexOf(`${header} {`);
	if (start === -1) {
		throw new Error(`Missing ${header} theme block`);
	}

	let depth = 0;
	for (let index = start; index < appCssSource.length; index += 1) {
		if (appCssSource[index] === '{') {
			depth += 1;
		} else if (appCssSource[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return appCssSource.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Unclosed ${header} theme block`);
};

const readTokens = (header: ':root' | 'html.dark'): Map<string, string> => {
	const tokens = new Map<string, string>();
	const pattern = /(--publy-[\w-]+):\s*(#[0-9a-fA-F]{6});/g;
	for (const match of extractBlock(header).matchAll(pattern)) {
		tokens.set(match[1], match[2]);
	}
	return tokens;
};

const LIGHT_TOKENS = readTokens(':root');
const DARK_TOKENS = readTokens('html.dark');

const resolveToken = (name: string, theme: 'light' | 'dark'): string => {
	const value =
		theme === 'dark'
			? (DARK_TOKENS.get(name) ?? LIGHT_TOKENS.get(name))
			: LIGHT_TOKENS.get(name);
	if (value === undefined) {
		throw new Error(`Token ${name} is not declared as a hex value in app.css`);
	}
	return value;
};

const parseHex = (hex: string): Rgb => ({
	r: Number.parseInt(hex.slice(1, 3), 16),
	g: Number.parseInt(hex.slice(3, 5), 16),
	b: Number.parseInt(hex.slice(5, 7), 16),
});

const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linearize = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

const contrastRatio = (foreground: string, background: string): number => {
	const foregroundLuminance = relativeLuminance(parseHex(foreground));
	const backgroundLuminance = relativeLuminance(parseHex(background));
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighter + 0.05) / (darker + 0.05);
};

const tokenFromColorDeclaration = (selector: string): string => {
	const declarations = resolveEffectiveDeclarations(appCssSource, selector);
	const color = declarations.get('color');
	if (color === undefined) {
		throw new Error(`No color declaration resolves for ${selector}`);
	}
	const match = /var\((--publy-[\w-]+)\)/.exec(color);
	if (!match) {
		throw new Error(
			`${selector} color is not a --publy-* token reference: ${color}`,
		);
	}
	return match[1];
};

describe('drawer description text contrast (#1043)', () => {
	test.each(DESCRIPTION_SELECTORS)(
		'%s resolves its color from a declared --publy-* token',
		(selector) => {
			const token = tokenFromColorDeclaration(selector);
			for (const theme of ['light', 'dark'] as const) {
				expect(() => resolveToken(token, theme)).not.toThrow();
			}
		},
	);

	test.each(DESCRIPTION_SELECTORS)(
		'%s clears the 4.5:1 small-text floor on every surface in both themes',
		(selector) => {
			const token = tokenFromColorDeclaration(selector);

			for (const theme of ['light', 'dark'] as const) {
				const foreground = resolveToken(token, theme);
				for (const surfaceToken of SURFACE_TOKENS) {
					const background = resolveToken(surfaceToken, theme);
					expect(
						contrastRatio(foreground, background),
						`${selector} on ${surfaceToken} in ${theme} theme`,
					).toBeGreaterThanOrEqual(SMALL_TEXT_CONTRAST_FLOOR);
				}
			}
		},
	);
});
