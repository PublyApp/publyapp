/** @vitest-environment jsdom */
import type { AnyRouter } from '@tanstack/react-router';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import type { RenderResult } from '@testing-library/react';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import enResource from '~/i18n/locales/en';
import frResource from '~/i18n/locales/fr';
import { createI18nFromResources } from '~/lib/i18n.shared';

/**
 * Test harness for the marketing shell.
 *
 * Two deliberate choices, both aimed at the failure mode this repo keeps
 * finding — a guard that passes against a model of the thing:
 *
 * 1. A REAL TanStack Router instance over a real memory history, not a mocked
 *    `Link`. A mocked `Link` renders whatever `to` it is handed, so it cannot
 *    tell a resolvable route from a dead one; the real router refuses to
 *    build an href for a path it does not know.
 * 2. A REAL i18next instance over the app's own `common` bundles, not
 *    `t: (key) => key`. A passthrough `t` makes a missing key indistinguishable
 *    from a present one, which is exactly how untranslated copy ships.
 */
export const buildMarketingI18n = (locale: 'en' | 'fr') =>
	createI18nFromResources(locale, ['common'], {
		en: { common: enResource.common },
		fr: { common: frResource.common },
	});

/** The marketing destinations that exist as real app routes today. */
const MARKETING_TEST_ROUTE_PATHS = ['/login', '/signup'] as const;

export const renderMarketing = async (
	ui: ReactNode,
	{ locale = 'en' as 'en' | 'fr' } = {},
): Promise<RenderResult & { router: AnyRouter }> => {
	const rootRoute = createRootRoute({
		component: () => <Outlet />,
		staticData: { crumbs: 'shell' },
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: () => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>,
		staticData: { crumbs: 'shell' },
	});
	const i18n = buildMarketingI18n(locale);
	const routeTree = rootRoute.addChildren([
		indexRoute,
		...MARKETING_TEST_ROUTE_PATHS.map((path) =>
			createRoute({
				getParentRoute: () => rootRoute,
				path,
				component: () => null,
				staticData: { crumbs: 'shell' },
			}),
		),
	]);
	const router: AnyRouter = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});

	const result = render(
		// The router's own generated types are not registered for this ad-hoc
		// tree; the runtime instance is the real one either way.
		<RouterProvider router={router} />,
	);

	await waitFor(() => {
		if (router.state.status !== 'idle') {
			throw new Error('router still loading');
		}
	});

	return { ...result, router: router as AnyRouter };
};
