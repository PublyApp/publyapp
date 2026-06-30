import { Button } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	isRouteErrorResponse,
	Outlet,
	Scripts,
	useLocation,
	useRouter,
} from '@tanstack/react-router';
import { createClientOnlyFn } from '@tanstack/react-start';
import type { i18n as I18nInstance } from 'i18next';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';

import { toApiFailure } from '@org/shared-ts/lib/api-failure';
import {
	createI18nFromResources,
	dirForLocale,
	FALLBACK_LANGUAGE,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { loadI18nForRequest } from '~/server/i18n-locale';

import { AuthLayout } from '../layouts/auth-layout';
import { MarketingLayout } from '../layouts/marketing-layout';
import { AppErrorView } from '../components/error-views/AppErrorView';
import { View403 } from '../components/error-views/View403';
import { View404 } from '../components/error-views/View404';
import appCss from '../styles/app.css?url';

type RootLoaderData = {
	locale: SupportedLanguage;
	resources: I18nResources;
};

type RouteSurface = 'auth' | 'marketing';

const FALLBACK_I18N_RESOURCES: I18nResources = {
	[FALLBACK_LANGUAGE]: {
		common: {},
		zod: {},
		'response-message': {},
	},
};

const initI18nOnClient = createClientOnlyFn(async (instance: I18nInstance) => {
	const mod = await import('~/lib/i18n.client');
	return mod.initI18nOnClient(instance);
});

const isPathForSurface = (pathname: string, surfacePath: string) => {
	return pathname === surfacePath || pathname.startsWith(`${surfacePath}/`);
};

const isAuthSurface = (pathname: string): boolean => {
	return pathname === '/login' || pathname.startsWith('/auth');
};

const resolveRouteSurface = (pathname: string): RouteSurface => {
	if (
		isPathForSurface(pathname, '/login') ||
		isPathForSurface(pathname, '/auth')
	) {
		return 'auth';
	}

	return 'marketing';
};

const getRouteFailureStatus = (error: unknown): number | undefined => {
	if (isRouteErrorResponse(error)) {
		return error.status;
	}

	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

const RoutedShell = () => {
	const location = useLocation();
	const pathname = location.pathname;
	const surface = resolveRouteSurface(pathname);

	if (
		isPathForSurface(pathname, '/staff') ||
		isPathForSurface(pathname, '/tenant')
	) {
		return <Outlet />;
	}

	if (surface === 'auth') {
		return (
			<AuthLayout pathname={pathname}>
				<Outlet />
			</AuthLayout>
		);
	}

	return (
		<MarketingLayout pathname={pathname}>
			<Outlet />
		</MarketingLayout>
	);
};

const RootErrorBoundary = ({ error }: { error: unknown }) => {
	const pathname = useLocation({
		select: (location) => location.pathname,
	});
	const routeStatus = getRouteFailureStatus(error);

	if (routeStatus === 401) {
		if (isAuthSurface(pathname)) {
			return (
				<AppErrorView
					icon="401"
					code="401 — Unauthorized"
					title="Authentication required"
					description="You are not signed in. Please log in again."
					actions={
						<Button as="a" href="/login" color="primary" variant="solid">
							Back to login
						</Button>
					}
				/>
			);
		}

		return (
			<AppErrorView
				icon="401"
				code="401 — Unauthorized"
				title="Session expired"
				description="Your session is no longer valid."
			/>
		);
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <View404 />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Something went wrong"
			description="The app hit an unexpected error."
		/>
	);
};

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		title: 'front-2',
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	loader: async (): Promise<RootLoaderData> => loadI18nForRequest(),
	errorComponent: RootErrorBoundary,
	notFoundComponent: () => <View404 />,
	component: RootComponent,
});

function RootComponent() {
	const data = Route.useLoaderData({
		structuralSharing: false,
	}) as RootLoaderData | undefined;
	const locale = data?.locale ?? FALLBACK_LANGUAGE;
	const resources = data?.resources ?? FALLBACK_I18N_RESOURCES;
	const i18n = React.useMemo(
		() => createI18nFromResources(locale, resources),
		[locale, resources],
	);
	const router = useRouter();
	const cspNonce = router.options.ssr?.nonce ?? '';

	React.useEffect(() => {
		void initI18nOnClient(i18n);
	}, [i18n]);

	return (
		<html
			lang={locale}
			dir={dirForLocale(locale)}
			className="front-2-shell"
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
				<script
					nonce={cspNonce || undefined}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{
						__html: 'window.__front2CspNonceReady=true;',
					}}
				/>
			</head>
			<body>
				<I18nextProvider i18n={i18n}>
					<RoutedShell />
				</I18nextProvider>
				<Scripts />
			</body>
		</html>
	);
}
