import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
/// <reference types="vite/client" />
import {
	HeadContent,
	Link,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';
import { I18nProvider } from 'react-aria-components';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { NotFound } from '~/components/NotFound';
import {
	createI18nFromResources,
	dirForLocale,
	FALLBACK_LANGUAGE,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { loadI18nForRequest } from '~/server/i18n-locale';
import { seo } from '~/utils/seo';

import appCss from '~/styles/app.css?url';

type RootLoaderData = {
	locale: SupportedLanguage;
	resources: I18nResources;
};

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	// COOKIE-DRIVEN locale resolution happens server-side via the i18n server fn, so the
	// SSR `<html lang>` + first-paint copy already match the request locale (no FOUC of
	// language). The fs-backed loader is hidden behind a server fn (client-bundle-safe).
	loader: async (): Promise<RootLoaderData> => loadI18nForRequest(),
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			...seo({
				title:
					'TanStack Start | Type-Safe, Client-First, Full-Stack React Framework',
				description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
			}),
		],
		links: [
			{ rel: 'stylesheet', href: appCss },
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/apple-touch-icon.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16.png',
			},
			{ rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
			{ rel: 'icon', href: '/favicon.ico' },
		],
	}),
	errorComponent: (props) => {
		return (
			<RootDocument>
				<DefaultCatchBoundary {...props} />
			</RootDocument>
		);
	},
	notFoundComponent: () => <NotFound />,
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	// The errorComponent renders RootDocument without loader data — fall back to en.
	const data = Route.useLoaderData({ structuralSharing: false }) as
		| RootLoaderData
		| undefined;
	const locale = data?.locale ?? FALLBACK_LANGUAGE;
	const resources = data?.resources ?? { [FALLBACK_LANGUAGE]: {} };

	// Per-request (server) / per-mount (client) synchronous i18next instance built from
	// the SSR-resolved resources — so SSR HTML and the hydrated tree share one locale.
	const i18n = React.useMemo(
		() => createI18nFromResources(locale, resources),
		[locale, resources],
	);

	return (
		<html lang={locale} dir={dirForLocale(locale)}>
			<head>
				<HeadContent />
			</head>
			<body>
				<I18nextProvider i18n={i18n}>
					{/* React Aria / HeroUI v3 locale (provider-less HeroUI; this only feeds
					    React Aria's i18n) fed the SAME request locale on server + client. */}
					<I18nProvider locale={locale}>
						<LocaleProbe />
						<div className="p-2 flex gap-2 text-lg">
							<Link
								to="/"
								activeProps={{
									className: 'font-bold',
								}}
								activeOptions={{ exact: true }}
							>
								Home
							</Link>{' '}
							<Link
								to="/login"
								activeProps={{
									className: 'font-bold',
								}}
							>
								Login
							</Link>{' '}
							<Link
								to="/staff/staff-users"
								activeProps={{
									className: 'font-bold',
								}}
							>
								Staff Users
							</Link>
						</div>
						<hr />
						{children}
					</I18nProvider>
				</I18nextProvider>
				{/* Dev-only: devtools expose router/query state, so they must never
				    ship to a deployed/prod build. import.meta.env.DEV is statically
				    `false` in prod, so this branch is dead-code-eliminated. */}
				{import.meta.env.DEV ? (
					<>
						<TanStackRouterDevtools position="bottom-right" />
						<ReactQueryDevtools buttonPosition="bottom-left" />
					</>
				) : null}
				<Scripts />
			</body>
		</html>
	);
}

// Renders the cookie-driven greeting so the SSR HTML carries a locale-specific string
// (the Task 2.3 curl checks grep for the French copy). Proves `t()` resolves SSR-side.
function LocaleProbe() {
	const { t } = useTranslation('common');
	return (
		<div className="p-2" data-testid="locale-greeting">
			{t('hello')}
		</div>
	);
}
