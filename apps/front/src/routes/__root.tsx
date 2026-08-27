import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	redirect,
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
import { NeutralAuthedShell } from '~/components/app-shell/neutral-authed-shell';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { AppToaster } from '~/components/ui/toaster';
import {
	createClient,
	getSessionTokensFromBrowser,
} from '~/lib/api-client/client-manager';
import { AuthBrandProvider } from '~/lib/auth-brand-context';
import { isAuthPath } from '~/lib/auth-paths';
import { serializePublicRuntimeEnv } from '~/lib/env';
import { useHydrated } from '~/lib/hooks/use-hydrated';
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
import {
	hasExactAuthedRouteMatch,
	isTenantPortalPath,
} from '~/lib/navigation/route-shell';
import { ServerFailure } from '~/lib/server/server-failure';
import { getServerSessionAction } from '~/lib/server/session-actions';
import { subscribeToSessionInvalidated } from '~/lib/session-invalidation-channel';
import { SessionSurfaceValidationProvider } from '~/lib/session-surface-recovery-context';
import {
	determineSessionToken,
	getSessionSurface,
	getSurfaceRedirectCodeQueryKey,
	shouldRenderAuthenticatedChrome,
} from '~/lib/session/session-scope';
import {
	COLOR_SCHEME_STORAGE_KEY,
	SIDEBAR_OPEN_STORAGE_KEY,
	useUiStore,
} from '~/lib/store/ui-store';
import { TabSyncListener } from '~/lib/tab-sync/tab-sync-listener';
import { loadI18nForRequest } from '~/server/i18n-locale';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { LOCALE_COOKIE_KEY, REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import { buildLoginRedirectSearch } from '@org/shared-ts/lib/login-redirect-search';
import { withSessionValidationTimeout } from '@org/shared-ts/lib/session-validation';

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

const parseRedirectCode = async (
	token: string,
	signal: AbortSignal,
): Promise<string | null> => {
	const client = createClient({ getSessionToken: () => token, signal });
	try {
		const result = await client.auth.redirectCode.get();

		if (result?.redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			throw new ServerFailure({
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'User has no accessible scope.',
			});
		}

		return result?.redirectCode ?? null;
	} catch (error: unknown) {
		const failure = toApiFailure(error);
		if (failure.kind !== 'problem') {
			throw error;
		}

		throw new ServerFailure({
			responseStatusCode: failure.status,
			status: failure.status,
			// i18n-guard-ignore: no-hardcoded-ui-literal — request-failure payload fields are technical transport metadata, never displayed as UI copy.
			title: failure.title ?? 'Request failed',
			// i18n-guard-ignore: no-hardcoded-ui-literal — request-failure payload fields are technical transport metadata, never displayed as UI copy.
			detail: failure.detail ?? 'Request failed',
			translationKey: failure.translationKey,
		});
	}
};

const resolveRootContext = async (
	options: unknown,
): Promise<RootRouteContext> => {
	const { location, matches } = options as {
		location: { pathname: string; searchStr?: string };
		matches: readonly (I18nRouteMatch & {
			pathname?: string;
			routeId?: string;
		})[];
	};
	// The pathless authed layout also matches unknown `/staff/*` URLs. Require
	// the deepest match to consume the whole path so API-shaped probes retain
	// the root 404 instead of being redirected through the login page.
	const hasAuthedRouteMatch = hasExactAuthedRouteMatch(
		matches,
		location.pathname,
	);
	if (typeof document === 'undefined' && hasAuthedRouteMatch) {
		const sessionAction = await getServerSessionAction();
		if (sessionAction === 'redirect-login') {
			throw redirect({
				to: '/login',
				search: buildLoginRedirectSearch({
					hadSession: false,
					returnTo: `${location.pathname}${location.searchStr ?? ''}`,
				}),
			});
		}
	}
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

const RootNotFound = () => <View404 embedded={false} />;

const initI18nOnClient = createClientOnlyFn(async (instance: I18nInstance) => {
	const mod = await import('~/lib/i18n.client');
	return mod.initI18nOnClient(instance);
});

export const isAuthedSurface = (pathname: string): boolean => {
	return pathname.startsWith('/staff') || pathname.startsWith('/tenant');
};

/**
 * Routes that render their own complete page shell, and must therefore NOT be
 * wrapped in `MarketingLayout` — doing so would give them a second header and
 * a second footer.
 *
 * Today that is exactly one route: the landing page at `/`. Its header and
 * footer are part of the design rather than chrome around it (see
 * `routes/index.tsx`), which is why it opts out of the shared marketing shell
 * every other marketing route uses. It began as the `/temp/landing-*`
 * exploration exemption (#1082) and became permanent when that exploration was
 * promoted to `/`.
 *
 * An exact match, not a prefix: `/` as a prefix matches every path there is.
 */
const isSelfShelledPath = (pathname: string): boolean => pathname === '/';

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
	React.useEffect(() => {
		locationRef.current = location;
	}, [location]);

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
 * Reads persisted presentation preferences and applies them to
 * `documentElement` before the browser paints. The colour scheme prevents a
 * light flash, while the sidebar state lets the neutral authenticated shell
 * reserve the same geometry as the hydrated shell. Must stay dependency-free
 * inline JS: it runs before the app bundle (and therefore `ui-store.ts`) has
 * loaded, so the parsing here is a deliberate, minimal duplicate of the
 * store's persisted-state parsing. Keep the two in sync if that shape changes.
 */
export const buildThemeInitScript = (
	colorStorageKey: string,
	sidebarStorageKey: string,
): string => `(() => {
	try {
		var raw = window.localStorage.getItem(${JSON.stringify(colorStorageKey)});
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
	try {
		var sidebarRaw = window.localStorage.getItem(${JSON.stringify(sidebarStorageKey)});
		var sidebarOpen = true;
		if (sidebarRaw) {
			var sidebarParsed = JSON.parse(sidebarRaw);
			if (typeof sidebarParsed === 'boolean') {
				sidebarOpen = sidebarParsed;
			}
		} else {
			var legacyRaw = window.localStorage.getItem(${JSON.stringify(colorStorageKey)});
			if (legacyRaw) {
				var legacyParsed = JSON.parse(legacyRaw);
				var legacyState = legacyParsed && typeof legacyParsed === 'object' ? legacyParsed.state : undefined;
				if (legacyState && typeof legacyState.sidebarOpen === 'boolean') {
					sidebarOpen = legacyState.sidebarOpen;
				}
			}
		}
		document.documentElement.dataset.sidebarOpen = sidebarOpen ? 'true' : 'false';
	} catch (e) {
		document.documentElement.dataset.sidebarOpen = 'true';
	}
})();`;

/**
 * Owns surface chrome above TanStack Router's replaceable route-match tree.
 * `useLocation` advances before the rendered matches during navigation, while
 * `resolvedLocation` can advance after their outlet. The active match set is
 * the only public state that changes with the content passed as `children`.
 */
export const RoutedShell = ({ children }: { children: React.ReactNode }) => {
	const isHydrated = useHydrated();
	const location = useMatches({
		select: (matches) => {
			const match = matches[matches.length - 1];
			const pathname = match?.pathname ?? '/';

			return {
				hasAuthedRouteMatch: hasExactAuthedRouteMatch(matches, pathname),
				pathname,
				search: match?.search ?? {},
			};
		},
	});
	const pathname = location.pathname;
	const surface = resolveRouteSurface(pathname);
	const sessionSurface = getSessionSurface(pathname);
	// Appending `hasAuthedRouteMatch` gives the query a different identity
	// the moment the route stops being an exact authenticated match (e.g.
	// navigating from a known /staff/* route to an unknown one under the
	// same prefix keeps `sessionSurface` at 'staff', so the base key alone
	// would not change). TanStack Query only cancels a query's in-flight
	// fetch when its last observer is detached (query-core's
	// `Query#removeObserver`, gated on the queryFn having consumed
	// `signal`, which it does below) — flipping `enabled` to `false` alone
	// does not detach the observer or abort the request, so a stale
	// response could otherwise settle into the cache after this route
	// stopped matching (PR #997 finding 2). Changing the key identity here
	// makes the observer move to a new (disabled, never-fetched) query,
	// which detaches it from the old one and fires its abort signal.
	const surfaceRedirectCodeQueryKey = [
		...getSurfaceRedirectCodeQueryKey(sessionSurface),
		location.hasAuthedRouteMatch,
	] as const;
	const surfaceSessionState = useQuery<string | null>({
		queryKey: surfaceRedirectCodeQueryKey,
		queryFn: async ({ signal }): Promise<string | null> => {
			const tokens = getSessionTokensFromBrowser();
			const resolved = determineSessionToken(tokens, pathname);
			const token = resolved.token;

			if (!token) {
				// A TanStack Query v5 queryFn must never resolve to `undefined`
				// (it rejects with "Query data cannot be undefined"). This path
				// should never be reached for authenticated routes: beforeLoad
				// redirects away earlier when no token is available.
				return null;
			}

			return withSessionValidationTimeout(
				(validationSignal) => parseRedirectCode(token, validationSignal),
				signal,
			);
		},
		enabled:
			isHydrated && location.hasAuthedRouteMatch && sessionSurface !== 'other',
		retry: false,
		// Session-stable: which surface a token belongs to only changes on
		// login/logout, both already invalidated explicitly (see
		// useCurrentUserQuery). Refetching on refocus can turn a transient
		// hiccup into full-page shell churn, so keep it disabled.
		refetchOnMount: false,
		staleTime: Infinity,
		// The key now includes `hasAuthedRouteMatch` (see comment above), so
		// the successful entry goes inactive the moment the route stops being
		// an exact authenticated match — e.g. a stale link to an unknown path
		// under a validated /staff/* prefix. Without an explicit `gcTime` the
		// installed TanStack Query browser default (5 minutes) collects that
		// inactive entry, so a user who leaves such a 404 open past the GC
		// window and goes back misses the cache and re-validates for no
		// reason (PR #997 round 6 finding). The key space is bounded (surface
		// × exactness), logout clears the whole cache, and login invalidates
		// broadly, so keeping this session-stable entry forever is safe.
		gcTime: Infinity,
		refetchOnWindowFocus: false,
	});
	const surfaceSessionFailureStatus =
		surfaceSessionState.status === 'error'
			? getRouteFailureStatus(surfaceSessionState.error)
			: undefined;
	const hasSurfaceSessionRecovery =
		isHydrated &&
		surfaceSessionState.status === 'error' &&
		surfaceSessionFailureStatus !== 401 &&
		surfaceSessionFailureStatus !== 403;
	const canRenderAuthenticatedChrome = shouldRenderAuthenticatedChrome({
		failureStatus: surfaceSessionFailureStatus,
		isHydrated,
		queryData: surfaceSessionState.data,
		queryStatus: surfaceSessionState.status,
	});
	const [brand, setBrand] = React.useState<AuthBrand | undefined>(undefined);

	// `_authed-layout` also matches an unknown path under an authed prefix
	// (it owns that path's notFound bubbling, see hasExactAuthedRouteMatch) —
	// its component still renders in that case, unconditionally reading this
	// context. The provider therefore wraps every branch below, not just the
	// exact-match one, so an unknown /staff/* path renders the layout's own
	// 404 instead of crashing on a missing provider.
	let shellContent: React.ReactNode;
	if (location.hasAuthedRouteMatch) {
		// Only the exact `/tenant` portal root renders bare (no AppShell): the
		// picker is its own SimpleLayout surface. Every `/tenant/*` CHILD path
		// mounts inside the authed shell like any staff surface — the
		// resolved workspace gets the rail (`TENANT_ROUTES`), topbar, user
		// menu and exactly one `<main>`; an unresolved child redirects to
		// `/tenant`, so the AppShell never wraps the picker itself (PR #1131
		// round 4).
		if (isTenantPortalPath(pathname)) {
			shellContent = children;
		} else if (!canRenderAuthenticatedChrome) {
			shellContent = (
				<NeutralAuthedShell
					isRecovery={hasSurfaceSessionRecovery}
					pathname={pathname}
				>
					{children}
				</NeutralAuthedShell>
			);
		} else {
			shellContent = (
				<AuthedLayout pathname={pathname} search={location.search}>
					{children}
				</AuthedLayout>
			);
		}
	} else if (surface === 'auth') {
		shellContent = (
			<AuthBrandProvider value={setBrand}>
				<AuthLayout brand={brand}>{children}</AuthLayout>
			</AuthBrandProvider>
		);
	} else if (isSelfShelledPath(pathname)) {
		// The landing page owns its entire page chrome — header, navigation and
		// footer are part of the design, not chrome around it — so wrapping it
		// in MarketingLayout would render a second header and a second footer.
		shellContent = children;
	} else {
		shellContent = (
			<MarketingLayout pathname={pathname}>{children}</MarketingLayout>
		);
	}

	return (
		<SessionSurfaceValidationProvider value={surfaceSessionState}>
			{shellContent}
		</SessionSurfaceValidationProvider>
	);
};

/**
 * The ONLY place `<html>`/`<head>`/`<body>`/`<Scripts>` and the locale-aware
 * `<I18nextProvider>` are mounted (shell-r5-F1). `shellComponent` wraps
 * TanStack Router's success/error/not-found selection (`Match.js`), so a cold
 * root loader throw or an unmatched route still gets the full document —
 * stylesheet, CSP nonce scripts, runtime env bootstrap — and the correct
 * French/English copy, not an English-only fragment.
 */
const RootShell = ({ children }: { children: React.ReactNode }) => {
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
	const publicRuntimeEnv = serializePublicRuntimeEnv();
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
			className="front-shell"
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
				<meta name="csp-nonce" content={cspNonce || undefined} />
				<title>{t(isLogin ? 'seo-login-title' : 'seo-default-title')}</title>
				<link
					rel="preload"
					href="/fonts/geist/geist-sans-latin-400.woff2"
					as="font"
					type="font/woff2"
					crossOrigin="anonymous"
				/>
				<link
					rel="preload"
					href="/fonts/geist/geist-sans-latin-500.woff2"
					as="font"
					type="font/woff2"
					crossOrigin="anonymous"
				/>
				<link
					rel="preload"
					href="/fonts/geist/geist-sans-latin-600.woff2"
					as="font"
					type="font/woff2"
					crossOrigin="anonymous"
				/>
				<script
					nonce={cspNonce || undefined}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{
						__html:
							'window.__ENV__ = Object.assign({}, window.__ENV__, ' +
							`${publicRuntimeEnv});`,
					}}
				/>
				<script
					nonce={cspNonce || undefined}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{
						__html: buildThemeInitScript(
							COLOR_SCHEME_STORAGE_KEY,
							SIDEBAR_OPEN_STORAGE_KEY,
						),
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
};

const RootComponent = () => {
	const namespaceLoadError = Route.useRouteContext({
		select: (context) => context.namespaceLoadError,
	});
	if (namespaceLoadError) {
		throw new Error(namespaceLoadError);
	}
	return <Outlet />;
};

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	beforeLoad: resolveRootContext,
	staticData: { crumbs: 'shell' },
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	errorComponent: RootErrorBoundary,
	notFoundComponent: RootNotFound,
	component: RootComponent,
	shellComponent: RootShell,
});
