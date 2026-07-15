/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hydrateFromStorage: vi.fn(),
}));

vi.mock('~/lib/store/ui-store', async () => {
	const actual = await vi.importActual<typeof import('~/lib/store/ui-store')>(
		'~/lib/store/ui-store',
	);
	return {
		...actual,
		useUiStore: (selector: (state: Record<string, unknown>) => unknown) =>
			selector({ hydrateFromStorage: mocks.hydrateFromStorage }),
	};
});

import { COLOR_SCHEME_STORAGE_KEY } from '~/lib/store/ui-store';

import { buildThemeInitScript, ThemeHydrationListener } from './__root';

describe('ThemeHydrationListener', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	test('hydrates the persisted colour scheme on mount, on every surface — not just AppShell (shell r2-F1)', async () => {
		render(<ThemeHydrationListener />);

		await waitFor(() =>
			expect(mocks.hydrateFromStorage).toHaveBeenCalledTimes(1),
		);
	});
});

describe('buildThemeInitScript', () => {
	const runScript = () => {
		// eslint-disable-next-line no-new-func -- exercising the exact string shipped inline in <head>
		new Function(buildThemeInitScript(COLOR_SCHEME_STORAGE_KEY))();
	};

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.classList.remove('dark', 'light');
		delete document.documentElement.dataset.theme;
	});

	test('applies a persisted dark scheme before hydration, killing the light flash', () => {
		window.localStorage.setItem(
			COLOR_SCHEME_STORAGE_KEY,
			JSON.stringify({ state: { colorScheme: 'dark' } }),
		);

		runScript();

		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(document.documentElement.dataset.theme).toBe('dark');
	});

	test('defaults to light with no persisted value', () => {
		runScript();

		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(document.documentElement.dataset.theme).toBe('light');
	});

	test('ignores a malformed persisted value rather than throwing', () => {
		window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'not json');

		expect(() => runScript()).not.toThrow();
		expect(document.documentElement.classList.contains('dark')).toBe(false);
	});
});
