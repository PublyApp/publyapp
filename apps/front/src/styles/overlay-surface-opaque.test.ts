import { describe, expect, test } from 'vitest';

import { resolveThemeToken } from './theme-token-test-support';

// #2407: the drawer panel and the confirm dialog paint
// `--publy-overlay-surface`; it must resolve to an opaque colour in both
// themes so the page behind never shows through.
const isOpaque = (value: string): boolean => {
	const v = value.trim().toLowerCase();
	if (v === 'transparent') {
		return false;
	}
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
		return true;
	}
	if (/^#[0-9a-f]{4}$/.test(v)) {
		return v[4] === 'f';
	}
	if (/^#[0-9a-f]{8}$/.test(v)) {
		return v.slice(7) === 'ff';
	}
	const fn = /^(?:rgb|hsl)a?\((.*)\)$/.exec(v);
	if (fn) {
		const alpha = /[,/]\s*([\d.]+%?)\s*$/.exec(fn[1]);
		if (!alpha) {
			return true;
		}
		const n = Number.parseFloat(alpha[1]);
		return (alpha[1].endsWith('%') ? n / 100 : n) >= 1;
	}
	return false;
};

describe('overlay surface is opaque', () => {
	test.each(['light', 'dark'] as const)('%s theme', (theme) => {
		const value = resolveThemeToken('--publy-overlay-surface', theme);
		expect(isOpaque(value), `resolved to "${value}"`).toBe(true);
	});
});
