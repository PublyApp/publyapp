/** @vitest-environment node */
import { QueryClient } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// shell-r5-F1: the wave-4 suite rendered `RootErrorBoundary`/`RootNotFound`
// directly with a mocked router — it could prove translated copy, but had no
// way to observe whether the surrounding document (`<html>`, stylesheet,
// nonce scripts, `<Scripts>`) existed at all. This suite instead builds a
// REAL router off the production `Route` export (with its real
// `beforeLoad`/`shellComponent`/`errorComponent`/`notFoundComponent`),
// resolves it exactly like the server entry does (`router.load()`), and
// server-renders the markup — i.e. it observes exactly what a cold SSR
// request would produce. (jsdom's DOM cannot host this suite: React refuses
// to mount a nested `<html>` under a container `<div>` and silently drops
// it — a real risk this whole finding is about, but not one jsdom lets us
// observe from the DOM side. Server-rendered markup is the only vantage
// point that actually contains it.)
const mocks = vi.hoisted(() => ({
	getServerSessionAction: vi.fn(),
	loadI18nForRequest: vi.fn(),
}));

vi.mock('~/lib/server/session-actions', () => ({
	clearSession: vi.fn(),
	getServerSessionAction: mocks.getServerSessionAction,
}));

vi.mock('~/server/i18n-locale', () => ({
	loadI18nForRequest: mocks.loadI18nForRequest,
	setLocale: vi.fn(),
}));

vi.mock('~/lib/i18n.client', () => ({
	initI18nOnClient: vi.fn(async () => undefined),
}));

import enResource from '~/i18n/locales/en';
import frResource from '~/i18n/locales/fr';
import { GLOBAL_I18N_NAMESPACES } from '~/lib/i18n.namespaces';
import type { SupportedLanguage } from '~/lib/i18n.shared';

import { RootErrorBoundary, Route as RootRoute } from './__root';

const makeRootI18nContext = (locale: SupportedLanguage) => {
	const resource = locale === 'fr' ? frResource : enResource;
	return {
		locale,
		namespaces: [...GLOBAL_I18N_NAMESPACES],
		resources: {
			[locale]: {
				common: resource.common,
				zod: resource.zod,
				'response-message': resource['response-message'],
			},
		},
		namespaceLoadError: null,
	};
};

// React's server renderer (`renderToStaticMarkup`/`renderToString`, and even
// the streaming `renderToPipeableStream` under jsdom/node in this test setup)
// does not run class error-boundary recovery for a component that throws
// during render — that's a documented React SSR limitation, not something
// this fix controls. `MatchInner` (`Match.js`) already accounts for this: on
// the server it renders `match.status === 'error'` as plain content, no
// throw/catch involved. So instead of throwing, this route mounts
// `RootErrorBoundary` directly as ordinary successful content — exactly the
// shape a real "root match ended in error" SSR pass produces — which still
// fully exercises whether `shellComponent` wraps it and whether the locale
// flowing through `Route.useRouteContext()` (not a hardcoded English
// instance) reaches it.
const buildRouter = (initialUrl: string, includeErrorPreview: boolean) => {
	const children = includeErrorPreview
		? [
				createRoute({
					getParentRoute: () => RootRoute,
					path: '/staff/error-preview',
					staticData: { crumbs: 'shell' },
					component: () => (
						<RootErrorBoundary error={new Error('boom')} reset={() => {}} />
					),
				}),
			]
		: [];
	// `RootRoute` is a singleton created via `createRootRouteWithContext`, so
	// `.addChildren` isn't part of its exported type — it's only ever called
	// here, building a throwaway per-test route tree. The helper is the one
	// widening point; the call site stays readable.
	const widenOptions = <T,>(value: unknown): T => {
		return value as T;
	};
	const routeTree = widenOptions<{
		addChildren: (children: unknown[]) => typeof RootRoute;
	}>(RootRoute).addChildren(children);
	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		history,
		context: { queryClient },
	});
	setupRouterSsrQueryIntegration({ router, queryClient });
	return router;
};

const renderRoute = async (
	initialUrl: string,
	includeErrorPreview: boolean,
): Promise<string> => {
	const router = buildRouter(initialUrl, includeErrorPreview);
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

describe('root shell wraps success/error/not-found in one document (shell-r5-F1)', () => {
	beforeEach(() => {
		vi.stubEnv('PUBLIC_API_BASE_URL', 'https://api.example.test');
		mocks.getServerSessionAction.mockResolvedValue('neutral');
		// `createRouter` memoizes its processed route tree in a PROCESS-GLOBAL
		// cache keyed by `routeTree` object identity whenever `isServer` and
		// `NODE_ENV !== 'development'` (router.js `update()`), which is exactly
		// this suite's environment. Every test below reuses the same `RootRoute`
		// singleton (mutated via `.addChildren`), so without clearing this a
		// later test's different children silently reuse an earlier test's
		// cached (stale) route map.
		(globalThis as { __TSR_CACHE__?: unknown }).__TSR_CACHE__ = undefined;
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	test('an unknown route still renders the full document shell in French', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('fr'));

		const html = await renderRoute('/nowhere', false);

		expect(html).toMatch(/<html[^>]*lang="fr"/);
		expect(html).toContain('</head>');
		expect(html).toContain('<script');
		expect(html).toContain('Page introuvable');
		expect(html).not.toContain('page-not-found<');
	});

	test('an unknown route renders English when server locale resolution falls back', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

		const html = await renderRoute('/nowhere', false);

		expect(html).toMatch(/<html[^>]*lang="en"/);
		expect(html).toContain('</head>');
		expect(html).toContain('Page not found');
	});

	test('an unknown /staff path is a plain 404 without authenticated chrome', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

		const html = await renderRoute('/staff/users', false);

		expect(html).toContain('Page not found');
		expect(html).not.toContain('data-mode="authed"');
		expect(html).not.toContain('data-testid="app-shell-rail"');
		expect(html).not.toContain('data-testid="app-shell-topbar"');
	});

	test('a /staff route outside the authed layout fails safe without authenticated chrome', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

		const html = await renderRoute('/staff/error-preview', true);

		expect(html).toContain('Something went wrong');
		expect(html).not.toContain('data-mode="authed"');
		expect(html).not.toContain('data-testid="app-shell-rail"');
		expect(html).not.toContain('data-testid="app-shell-topbar"');
	});

	test('React owns the public runtime environment script in the document head', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

		const html = await renderRoute('/nowhere', false);

		expect(html).toContain('window.__ENV__');
		expect(html.indexOf('window.__ENV__')).toBeLessThan(
			html.indexOf('</head>'),
		);
	});

	test('the root error boundary renders inside the shell (document + Retry), in English', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('en'));

		const html = await renderRoute('/staff/error-preview', true);

		expect(html).toMatch(/<html[^>]*lang="en"/);
		expect(html).toContain('</head>');
		expect(html).toContain('<script');
		expect(html).toContain('Something went wrong');
		expect(html).toContain('>Retry<');
		expect(html).not.toContain('something-went-wrong<');
	});

	test('the root error boundary carries the FRENCH root locale, not a hardcoded English instance', async () => {
		mocks.loadI18nForRequest.mockResolvedValue(makeRootI18nContext('fr'));

		const html = await renderRoute('/staff/error-preview', true);

		expect(html).toMatch(/<html[^>]*lang="fr"/);
		expect(html).toContain('Une erreur s&#x27;est produite');
		expect(html).toContain('>Ré-essayer<');
	});
});
