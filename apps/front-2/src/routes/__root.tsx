import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useLocation,
	useRouter,
} from '@tanstack/react-router';
import { createClientOnlyFn } from '@tanstack/react-start';
import type { i18n as I18nInstance } from 'i18next';
import * as React from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '~/components/ui/button';
import { AuthBrandProvider } from '~/lib/auth-brand-context';
import { isAuthPath, isPathForSurface } from '~/lib/auth-paths';
import { useLogout } from '~/lib/hooks/use-logout';
import {
	createI18nFromResources,
	dirForLocale,
	FALLBACK_LANGUAGE,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { subscribeToSessionInvalidated } from '~/lib/session-invalidation-channel';
import { TabSyncListener } from '~/lib/tab-sync/tab-sync-listener';
import { loadI18nForRequest } from '~/server/i18n-locale';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { AppErrorView } from '../components/error-views/AppErrorView';
import { LogoutRedirect } from '../components/error-views/LogoutRedirect';
import { View403 } from '../components/error-views/View403';
import { View404 } from '../components/error-views/View404';
import type { AuthBrand } from '../layouts/auth-layout';
import { AuthLayout } from '../layouts/auth-layout';
import { MarketingLayout } from '../layouts/marketing-layout';
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

export const isAuthedSurface = (pathname: string): boolean => {
	return pathname.startsWith('/staff') || pathname.startsWith('/tenant');
};

export const resolveRouteSurface = (pathname: string): RouteSurface => {
	if (isAuthPath(pathname)) {
		return 'auth';
	}

	return 'marketing';
};

const getRouteFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

/**
 * Subscribes once (mounted for every surface, like `TabSyncListener`) to the
 * router's central 401 backstop (`router.tsx`'s `QueryCache`/`MutationCache`
 * `onError` — shell-F6) and runs the full logout sequence for THIS tab: the
 * backstop can only detect "an authed query 401'd", it can't call the
 * `useLogout` hook itself since it runs outside the React tree.
 */
const SessionInvalidationListener = () => {
	const { logout } = useLogout();

	React.useEffect(() => {
		return subscribeToSessionInvalidated(() => {
			logout({ redirectCause: 'invalid_session' });
		});
	}, [logout]);

	return null;
};

const RoutedShell = () => {
	const location = useLocation();
	const pathname = location.pathname;
	const surface = resolveRouteSurface(pathname);
	const [brand, setBrand] = React.useState<AuthBrand | undefined>(undefined);

	if (
		isPathForSurface(pathname, '/staff') ||
		isPathForSurface(pathname, '/tenant')
	) {
		return <Outlet />;
	}

	if (surface === 'auth') {
		return (
			<AuthBrandProvider value={setBrand}>
				<AuthLayout brand={brand}>
					<Outlet />
				</AuthLayout>
			</AuthBrandProvider>
		);
	}

	return (
		<MarketingLayout pathname={pathname}>
			<Outlet />
		</MarketingLayout>
	);
};

const RootErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const pathname = useLocation({
		select: (location) => location.pathname,
	});
	const router = useRouter();
	const { t } = useTranslation('common');
	const routeStatus = getRouteFailureStatus(error);
	const retry = () => {
		reset();
		void router.invalidate();
	};

	if (routeStatus === 401) {
		if (isAuthPath(pathname)) {
			return (
				<AppErrorView
					icon={<IconLock aria-hidden="true" className="size-7" />}
					code="401 — Unauthorized"
					title="Authentication required"
					description="You are not signed in. Please log in again."
					actions={
						<Link
							to="/login"
							className={buttonVariants({ variant: 'default' })}
						>
							Back to login
						</Link>
					}
				/>
			);
		}

		if (isAuthedSurface(pathname)) {
			return <LogoutRedirect />;
		}

		return (
			<AppErrorView
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code="401 — Unauthorized"
				title="Session expired"
				description="Your session is no longer valid."
				actions={
					<Link to="/login" className={buttonVariants({ variant: 'default' })}>
						Back to login
					</Link>
				}
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
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title="Something went wrong"
			description="The app hit an unexpected error."
			actions={
				<>
					<Button variant="default" onClick={retry} type="button">
						{t('retry')}
					</Button>
					<Link to="/" className={buttonVariants({ variant: 'outline' })}>
						{t('go-to-home')}
					</Link>
				</>
			}
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
					<TabSyncListener />
					<SessionInvalidationListener />
					<RoutedShell />
				</I18nextProvider>
				<Scripts />
			</body>
		</html>
	);
}
