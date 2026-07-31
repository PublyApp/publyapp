/**
 * Contrast guard for the marketing shell's text-on-surface pairs (#1038).
 *
 * Written from a MEASURED failure, not from the handoff's table: rendering
 * the production build in a real browser showed the CTA band's small labels
 * at 4.40:1 — `--publy-foreground-muted` clears AA on white (#ffffff) but not
 * on `--publy-surface-muted`, and the handoff's "no text lighter than
 * #71717a" rule silently assumes a white backdrop. Same class of miss on the
 * drawer description's subtle step (2.56:1 on white).
 *
 * These assertions pin the pairs the shell actually paints, in BOTH themes,
 * resolved out of the real app.css token layer.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const appCssPath = path.join(
	path.resolve(fileURLToPath(new URL('.', import.meta.url))),
	'app.css',
);
const appCssSource = readFileSync(appCssPath, 'utf8').replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);

const AA_NORMAL_TEXT = 4.5;

const extractBlock = (headerPattern: RegExp): string => {
	const lines = appCssSource.split('\n');
	const startIndex = lines.findIndex((line) => headerPattern.test(line));
	if (startIndex === -1) {
		throw new Error(`Block not found for ${headerPattern}`);
	}
	let depth = 0;
	for (let index = startIndex; index < lines.length; index += 1) {
		depth += (lines[index].match(/\{/g) ?? []).length;
		depth -= (lines[index].match(/\}/g) ?? []).length;
		if (depth === 0 && index > startIndex) {
			return lines.slice(startIndex, index + 1).join('\n');
		}
	}
	throw new Error(`Unterminated block for ${headerPattern}`);
};

const readTokens = (block: string): Map<string, string> => {
	const tokens = new Map<string, string>();
	const pattern = /(--publy-[\w-]+)\s*:\s*([^;]+);/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(block))) {
		tokens.set(match[1], match[2].trim());
	}
	return tokens;
};

const lightTokens = readTokens(extractBlock(/^:root\s*\{/));
const darkTokens = readTokens(extractBlock(/^html\.dark\s*\{/));

const resolve = (name: string, theme: 'light' | 'dark'): string => {
	const value =
		theme === 'dark'
			? (darkTokens.get(name) ?? lightTokens.get(name))
			: lightTokens.get(name);
	if (value === undefined) {
		throw new Error(`Token ${name} is not declared for ${theme}`);
	}
	return value;
};

const toRgb = (value: string): [number, number, number] => {
	const hex = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
	if (hex) {
		return [
			Number.parseInt(hex[1].slice(0, 2), 16),
			Number.parseInt(hex[1].slice(2, 4), 16),
			Number.parseInt(hex[1].slice(4, 6), 16),
		];
	}
	throw new Error(`Unsupported colour for contrast maths: ${value}`);
};

const channel = (value: number): number => {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: [number, number, number]): number =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: string, b: string): number => {
	const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))];
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Every small-text pair the shell paints, per theme. */
const PAIRS: readonly {
	name: string;
	foreground: string;
	background: string;
}[] = [
	{
		name: 'announcement bar copy on the muted tone',
		foreground: '--publy-foreground-secondary',
		background: '--publy-surface-muted',
	},
	{
		name: 'CTA band kicker and footnote on the band surface',
		foreground: '--publy-foreground-secondary',
		background: '--publy-surface-muted',
	},
	{
		name: 'mega-menu item description on the raised panel',
		foreground: '--publy-foreground-muted',
		background: '--publy-surface-raised',
	},
	{
		name: 'cookie band body on the raised band',
		foreground: '--publy-foreground-muted',
		background: '--publy-surface-raised',
	},
	{
		name: 'cookie preferences policy line on the drawer surface',
		foreground: '--publy-foreground-muted',
		background: '--publy-surface',
	},
	{
		name: 'footer links on the page background',
		foreground: '--publy-foreground-muted',
		background: '--publy-background',
	},
	{
		name: 'social-proof caption on the page background',
		foreground: '--publy-foreground-muted',
		background: '--publy-background',
	},
];

describe('marketing shell text contrast', () => {
	for (const theme of ['light', 'dark'] as const) {
		for (const pair of PAIRS) {
			test(`${theme}: ${pair.name} clears AA for normal text`, () => {
				const ratio = contrast(
					resolve(pair.foreground, theme),
					resolve(pair.background, theme),
				);

				expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
			});
		}
	}

	test('the muted step on the muted surface is BELOW AA — the measured failure this guard exists for', () => {
		// If this ever passes, the token values changed and the shell's small
		// labels can go back to the muted step. Until then, a marketing label
		// on --publy-surface-muted must use the secondary foreground.
		expect(
			contrast(
				resolve('--publy-foreground-muted', 'light'),
				resolve('--publy-surface-muted', 'light'),
			),
		).toBeLessThan(AA_NORMAL_TEXT);
	});
});
