import { describe, expect, test } from 'vitest';

import { resolveThemeToken } from './theme-token-test-support';

// #2407: the drawer panel and the confirm dialog paint
// `--publy-overlay-surface`; it must resolve to an opaque colour in both
// themes so the page behind never shows through.
const isOpaque = (value: string): boolean => {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
	return hex !== null && !/rgba?\(|\/|transparent|color-mix/i.test(value);
};

describe('overlay surface is opaque', () => {
	test.each(['light', 'dark'] as const)('%s theme', (theme) => {
		const value = resolveThemeToken('--publy-overlay-surface', theme);
		expect(isOpaque(value), `resolved to "${value}"`).toBe(true);
	});
});
