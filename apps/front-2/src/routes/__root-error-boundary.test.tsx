/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { createElement, type ReactNode } from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Router primitives are the only thing safe to fake — createRootRouteWithContext
// etc. don't exist outside an actual router tree. react-i18next is
// deliberately NOT mocked below (W4-GUARDS shell-F1): the whole point of this
// suite is to prove the root error/not-found branches carry their own i18n
// provider, and a `useTranslation` mock that returns the raw key regardless of
// context (the r3/r4 shape) makes that defect invisible.
vi.mock('@tanstack/react-router', () => ({
	createRootRouteWithContext: () => () => ({}),
	HeadContent: () => null,
	Outlet: () => null,
	Scripts: () => null,
	useLocation: (options?: { select?: (location: unknown) => unknown }) => {
		const location = { pathname: '/some-path', searchStr: '' };
		return options?.select ? options.select(location) : location;
	},
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

import { RootErrorBoundary, RootNotFound } from './__root';

// The root `errorComponent`/`notFoundComponent` REPLACE `RootComponent`'s
// whole subtree — there is no other <I18nextProvider> on the page — so every
// branch must carry its own working i18n provider AND render translated
// human copy, not a raw i18next key (r3-shell-F4 / r4-shell-F1). A cold
// unknown-route load or a root loader throw hits these components before
// `RootComponent` (and its provider) ever mounts.
describe('root error/not-found renders translated copy with a real i18n provider (r4-shell-F1)', () => {
	beforeEach(() => {
		// Simulates the real failure mode the finding describes: a page that
		// rendered earlier in this tab already created and initialized its own
		// i18next instance (e.g. `initI18nOnClient` for the current locale),
		// which becomes the process-global default `getI18n()` falls back to
		// for ANY `useTranslation()` call with no `I18nContext` around it. Here
		// that prior instance is deliberately missing the `common` namespace,
		// so a component relying on the global fallback (no provider of its
		// own) cannot resolve `page-not-found`/`something-went-wrong` and must
		// render the raw key instead of translated copy.
		const pollutedGlobalInstance = createInstance();
		void pollutedGlobalInstance.use(initReactI18next).init({
			lng: 'en',
			fallbackLng: 'en',
			ns: ['zod'],
			defaultNS: 'zod',
			resources: { en: { zod: {} } },
			initImmediate: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('403 renders a translated main landmark, not a raw key', () => {
		render(<RootErrorBoundary error={{ status: 403 }} reset={vi.fn()} />);
		const main = screen.getByRole('main');
		expect(main).toBeTruthy();
		expect(main.textContent).not.toMatch(/[a-z0-9-]+-[a-z0-9-]+/);
	});

	test('404 (errorComponent branch) renders translated "Page not found" copy', () => {
		render(<RootErrorBoundary error={{ status: 404 }} reset={vi.fn()} />);
		expect(screen.getByRole('main')).toBeTruthy();
		expect(screen.getByText('Page not found')).toBeTruthy();
		expect(
			screen.getByText(/couldn't find the page you're looking for/i),
		).toBeTruthy();
		expect(screen.queryByText('page-not-found')).toBeNull();
	});

	test('unhandled/500 renders translated "Something went wrong" copy', () => {
		render(<RootErrorBoundary error={new Error('boom')} reset={vi.fn()} />);
		expect(screen.getByRole('main')).toBeTruthy();
		expect(screen.getByText('Something went wrong')).toBeTruthy();
		expect(screen.queryByText('something-went-wrong')).toBeNull();
	});

	test('the cold root notFoundComponent branch renders translated "Page not found" copy', () => {
		render(<RootNotFound />);
		expect(screen.getByRole('main')).toBeTruthy();
		expect(screen.getByText('Page not found')).toBeTruthy();
		expect(
			screen.getByText(/couldn't find the page you're looking for/i),
		).toBeTruthy();
		expect(screen.queryByText('page-not-found')).toBeNull();
	});
});
