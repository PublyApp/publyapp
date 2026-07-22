import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useLocation,
	useMatches,
	useRouter,
} from '@tanstack/react-router';
import { createClientOnlyFn } from '@tanstack/react-start';
import { parse as parseCookie } from 'cookie';
import type { i18n as I18nInstance } from 'i18next';
import * as React from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '~/components/ui/button';
import { AppToaster } from '~/components/ui/toaster';
import { AuthBrandProvider } from '~/lib/auth-brand-context';
import { isAuthPath, isPathForSurface } from '~/lib/auth-paths';
import { useLogout } from '~/lib/hooks/use-logout';
import { createBackendI18n, loadI18nContext } from '~/lib/i18n.backend';
import {
	collectI18nNamespaces,
	type I18nRouteMatch,
	type SupportedNamespace,
} from '~/lib/i18n.namespaces';
import {
	createI18nFromResources,
	dirForLocale,
	FALLBACK_LANGUAGE,
	type I18nResources,
	isSupportedLanguage,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { registerMutationToastI18n } from '~/lib/mutation-toast';
import { subscribeToSessionInvalidated } from '~/lib/session-invalidation-channel';
import { COLOR_SCHEME_STORAGE_KEY, useUiStore } from '~/lib/store/ui-store';
import { TabSyncListener } from '~/lib/tab-sync/tab-sync-listener';
import { loadI18nForRequest } from '~/server/i18n-locale';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { AppErrorView } from '../components/error-views/AppErrorView';
import { LogoutRedirect } from '../components/error-views/LogoutRedirect';
import { View403 } from '../components/error-views/View403';
import { View404 } from '../components/error-views/View404';
import type { AuthBrand } from '../layouts/auth-layout';
import { AuthLayout } from '../layouts/auth-layout';
import { AuthedLayout } from '../layouts/authed-layout';
import { MarketingLayout } from '../layouts/marketing-layout';
import appCss from '../styles/app.css?url';

type RootRouteContext = {
	locale: SupportedLanguage;
	namespaces: SupportedNamespace[];
	resources: I18nResources;
	namespaceLoadError: string | null;
};

const clientLoadingInstanceByLocale = new Map<
	SupportedLanguage,
	Promise<I18nInstance>
>();
const clientRootContextByKey = new Map<string, Promise<RootRouteContext>>();

type RouteSurface = 'auth' | 'marketing';

/**
 * Resolved in `beforeLoad`, not `loader` (shell-r5-F1): `beforeLoad`-provided
 * match context survives a subsequent `loader` throw (TanStack Router keeps
 * `__beforeLoadContext` on the match regardless of load status), so the
 * `shellComponent` below — which wraps the success/error/not-found branches
 * alike — can always read a real, locale-aware i18n instance.
 */
const getClientLoadingInstance = (locale: SupportedLanguage) => {
	const cached = clientLoadingInstanceByLocale.get(locale);
	if (cached) {
		return cached;
	}
	const pending = createBackendI18n(locale);
	clientLoadingInstanceByLocale.set(locale, pending);
	return pending;
};

const loadClientRootContext = (
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
): Promise<RootRouteContext> => {
	const key = `${locale}:${namespaces.join('|')}`;
	const cached = clientRootContextByKey.get(key);
	if (cached) {
		return cached;
	}
	const pending = getClientLoadingInstance(locale).then(async (instance) => ({
		locale,
		...(await loadI18nContext(instance, locale, namespaces)),
	}));
	clientRootContextByKey.set(key, pending);
	void pending.then((context) => {
		if (context.namespaceLoadError) {
			clientRootContextByKey.delete(key);
		}
	});
	return pending;
};

const resolveRootContext = async (
	options: unknown,
): Promise<RootRouteContext> => {
	const { matches } = options as { matches: readonly I18nRouteMatch[] };
	const namespaces = collectI18nNamespaces(matches);
	if (typeof document === 'undefined') {
		return loadI18nForRequest({ data: { namespaces } });
	}
	const cookieLocale = parseCookie(document.cookie)[LOCALE_COOKIE_KEY];
	let locale = FALLBACK_LANGUAGE;
	if (isSupportedLanguage(cookieLocale)) {
		locale = cookieLocale;
	} else if (isSupportedLanguage(document.documentElement.lang)) {
		locale = document.documentElement.lang;
	}
	return loadClientRootContext(locale, namespaces);
};

const RootErrorBoundaryContent = ({
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
					embedded={false}
					icon={<IconLock aria-hidden="true" className="size-7" />}
					code={t('error-401-code')}
					title={t('authentication-required')}
					description={t('sign-in-required-description')}
					actions={
						<Link
							to="/login"
							className={buttonVariants({ variant: 'default' })}
						>
							{t('back-to-login')}
						</Link>
					}
				/>
			);
		}

		if (isAuthedSurface(pathname)) {
			return <LogoutRedirect embedded={false} />;
		}

		return (
			<AppErrorView
				embedded={false}
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code={t('error-401-code')}
				title={t('session-expired')}
				description={t('session-no-longer-valid-description')}
				actions={
					<Link to="/login" className={buttonVariants({ variant: 'default' })}>
						{t('back-to-login')}
					</Link>
				}
			/>
		);
	}

	if (routeStatus === 403) {
		return <View403 embedded={false} />;
	}

	if (routeStatus === 404) {
		return <View404 embedded={false} />;
	}

	return (
		<AppErrorView
			embedded={false}
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('something-went-wrong')}
			description={t('unexpected-app-error-description')}
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

// No i18n provider here: the root `shellComponent` (below) wraps every
// branch — success, error, and not-found alike — in a single locale-aware
// `<I18nextProvider>` sourced from `beforeLoad` context (shell-r5-F1). A
// provider nested here would win over the shell's and silently pin these
// branches back to English regardless of the request's locale.
export const RootErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => <RootErrorBoundaryContent error={error} reset={reset} />;

export const RootNotFound = () => <View404 embedded={false} />;

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
	const location = useLocation();
	// A ref, not an effect dependency: resubscribing on every navigation would
	// tear down and recreate the channel subscription for no reason — this
	// only needs the location at the moment the backstop actually fires.
	const locationRef = React.useRef(location);
	locationRef.current = location;

	React.useEffect(() => {
		return subscribeToSessionInvalidated(() => {
			const current = locationRef.current;
			logout({
				redirectCause: 'invalid_session',
				returnTo: `${current.pathname}${current.searchStr}`,
			});
		});
	}, [logout]);

	return null;
};

/**
 * `AppShell` (authed/marketing surfaces only) was the only place
 * `hydrateFromStorage()` was ever called, so the auth surface and the
 * `/tenant` portal (neither of which mount `AppShell`) never picked up a
 * saved dark preference (shell r2-F1). Mounted once at the root, like
 * `TabSyncListener`, so every surface hydrates the persisted colour scheme
 * into React state — the blocking `<script>` in `<head>` (below) already
 * applied it to the DOM before first paint; this just syncs the store so
 * in-app controls (e.g. `ThemeToggle`) reflect it too.
 */
export const ThemeHydrationListener = () => {
	const hydrateFromStorage = useUiStore((state) => state.hydrateFromStorage);

	React.useEffect(() => {
		hydrateFromStorage();
	}, [hydrateFromStorage]);

	return null;
};

/**
 * Reads the persisted colour scheme and applies it to `documentElement`
 * before the browser paints — without this, every cold load (any surface,
 * not just the authed shell) flashes light and only repaints dark once
 * `ThemeHydrationListener`'s post-paint effect runs (shell r2-F1). Must stay
 * dependency-free inline JS: it runs before the app bundle (and therefore
 * `ui-store.ts`) has loaded, so the parsing here is a deliberate, minimal
 * duplicate of `ui-store.ts`'s `parsePersistedColorState`/
 * `applyThemeToDocument` — keep the two in sync by hand if that shape changes.
 */
export const buildThemeInitScript = (storageKey: string): string => `(() => {
	try {
		var raw = window.localStorage.getItem(${JSON.stringify(storageKey)});
		var scheme = 'light';
		if (raw) {
			var parsed = JSON.parse(raw);
			var state = parsed && typeof parsed === 'object' ? parsed.state : undefined;
			var value = state && typeof state === 'object' ? state.colorScheme : parsed && typeof parsed === 'object' ? parsed.colorScheme : undefined;
			if (value === 'dark' || value === 'light') {
				scheme = value;
			}
		}
		document.documentElement.classList.remove('dark', 'light');
		if (scheme === 'dark') {
			document.documentElement.classList.add('dark');
		}
		document.documentElement.dataset.theme = scheme;
	} catch (e) {}
})();`;

/**
 * Owns surface chrome above TanStack Router's replaceable route-match tree.
 * `useLocation` advances before the rendered matches during navigation, while
 * `resolvedLocation` can advance after their outlet. The active match set is
 * the only public state that changes with the content passed as `children`.
 */
export const RoutedShell = ({ children }: { children: React.ReactNode }) => {
	const location = useMatches({
		select: (matches) => {
			const match = matches[matches.length - 1];

			return {
				pathname: match?.pathname ?? '/',
				search: match?.search ?? {},
			};
		},
	});
	const pathname = location.pathname;
	const surface = resolveRouteSurface(pathname);
	const [brand, setBrand] = React.useState<AuthBrand | undefined>(undefined);

	if (
		isPathForSurface(pathname, '/staff') ||
		isPathForSurface(pathname, '/tenant')
	) {
		const isTenantPortalRoot = pathname.replace(/\/+$/, '') === '/tenant';
		if (isTenantPortalRoot) {
			return children;
		}

		return (
			<AuthedLayout pathname={pathname} search={location.search}>
				{children}
			</AuthedLayout>
		);
	}

	if (surface === 'auth') {
		return (
			<AuthBrandProvider value={setBrand}>
				<AuthLayout brand={brand}>{children}</AuthLayout>
			</AuthBrandProvider>
		);
	}

	return <MarketingLayout pathname={pathname}>{children}</MarketingLayout>;
};

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	beforeLoad: resolveRootContext,
	errorComponent: RootErrorBoundary,
	notFoundComponent: RootNotFound,
	component: RootComponent,
	shellComponent: RootShell,
});

/**
 * The ONLY place `<html>`/`<head>`/`<body>`/`<Scripts>` and the locale-aware
 * `<I18nextProvider>` are mounted (shell-r5-F1). `shellComponent` wraps
 * TanStack Router's success/error/not-found selection (`Match.js`), so a cold
 * root loader throw or an unmatched route still gets the full document —
 * stylesheet, CSP nonce scripts, runtime env injection eligibility
 * (`server.ts` only rewrites `</head>`-bearing responses) — and the correct
 * French/English copy, not an English-only fragment.
 */
function RootShell({ children }: { children: React.ReactNode }) {
	const { locale, namespaces, resources } = Route.useRouteContext({
		select: (context) => ({
			locale: context.locale,
			namespaces: context.namespaces,
			resources: context.resources,
		}),
	});
	const i18n = React.useMemo(
		() => createI18nFromResources(locale, namespaces, resources),
		[locale, namespaces, resources],
	);
	const router = useRouter();
	const cspNonce = router.options.ssr?.nonce ?? '';
	const isLogin = router.state.location.pathname === '/login';
	const t = i18n.getFixedT(locale, 'common');

	React.useEffect(() => {
		registerMutationToastI18n(i18n);
		void initI18nOnClient(i18n);

		return () => {
			registerMutationToastI18n(undefined);
		};
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
				<meta name="csp-nonce" content={cspNonce || undefined} />
				<title>{t(isLogin ? 'seo-login-title' : 'seo-default-title')}</title>
				<script
					nonce={cspNonce || undefined}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{
						__html: buildThemeInitScript(COLOR_SCHEME_STORAGE_KEY),
					}}
				/>
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
					<ThemeHydrationListener />
					<AppToaster />
					<RoutedShell>{children}</RoutedShell>
				</I18nextProvider>
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	const namespaceLoadError = Route.useRouteContext({
		select: (context) => context.namespaceLoadError,
	});
	if (namespaceLoadError) {
		throw new Error(namespaceLoadError);
	}
	return <Outlet />;
}
