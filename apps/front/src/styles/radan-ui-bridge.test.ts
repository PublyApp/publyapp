/**
 * #2360 review follow-ups. PublyApp utilities now resolve through radan-ui's
 * `@theme inline` (`--color-x: var(--radan-ui-x)`), which changed two things
 * this file pins:
 *  - `--color-input` must stay the field HAIRLINE (radan-ui's own meaning is
 *    its input text colour), so `bg-input/50` fields keep a legible placeholder;
 *  - the landing night band must re-point the `--radan-ui-*` variables, not
 *    only the shadcn aliases, or `text-foreground` paints ink on ink in light.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveThemeToken, type ThemeName } from './theme-token-test-support';

const read = (name: string): string =>
	readFileSync(path.resolve(process.cwd(), 'src/styles', name), 'utf8');

const hex = (value: string): [number, number, number] => {
	const m = /^#([0-9a-f]{6})$/i.exec(value.trim());
	if (!m) {
		throw new Error(`Not a 6-digit hex: ${value}`);
	}
	return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];
};

const lum = ([r, g, b]: [number, number, number]): number => {
	const f = (c: number): number => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (
	a: [number, number, number],
	b: [number, number, number],
): number => {
	const [hi, lo] = [Math.max(lum(a), lum(b)), Math.min(lum(a), lum(b))];
	return (hi + 0.05) / (lo + 0.05);
};

const over = (
	top: [number, number, number],
	alpha: number,
	under: [number, number, number],
): [number, number, number] =>
	top.map((c, i) => c * alpha + under[i] * (1 - alpha)) as [
		number,
		number,
		number,
	];

describe('--color-input stays the field hairline', () => {
	const appCss = read('app.css').replace(/\/\*[\s\S]*?\*\//g, '');

	test('app.css maps --color-input to radan-ui input-border, not its text colour', () => {
		expect(appCss).toMatch(
			/@theme inline\s*\{[^}]*--color-input:\s*var\(--radan-ui-input-border\);/,
		);
		expect(resolveThemeToken('--input', 'light')).toBe(
			resolveThemeToken('--radan-ui-input-border', 'light'),
		);
	});

	test.each(['light', 'dark'] as const satisfies readonly ThemeName[])(
		'placeholder (muted-foreground) clears AA 4.5:1 on a bg-input/50 field in %s',
		(theme) => {
			const page = hex(resolveThemeToken('--radan-ui-background', theme));
			const fill = over(
				hex(resolveThemeToken('--radan-ui-input-border', theme)),
				0.5,
				page,
			);
			const placeholder = hex(
				resolveThemeToken('--radan-ui-muted-foreground', theme),
			);
			expect(ratio(placeholder, fill)).toBeGreaterThanOrEqual(4.5);
		},
	);
});

describe('landing night band re-points the radan-ui variables', () => {
	const landing = read('landing.css');
	const block = /\.publy-landing-night-foot\s*\{([^}]*)\}/.exec(landing)?.[1];

	test.each([
		['--radan-ui-foreground', '--publy-foreground'],
		['--radan-ui-foreground-secondary', '--publy-foreground-secondary'],
		['--radan-ui-muted-foreground', '--publy-foreground-muted'],
		['--radan-ui-border', '--publy-border'],
		['--radan-ui-input-border', '--publy-border'],
		['--radan-ui-ring', '--publy-focus-ring'],
	])('%s -> %s', (radan, publy) => {
		expect(block).toBeDefined();
		expect(block).toContain(`${radan}: var(${publy});`);
	});
});
