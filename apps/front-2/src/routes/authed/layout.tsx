import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
	redirect,
	createFileRoute,
	useLocation,
	Link,
	Outlet,
	useNavigate,
	useRouter,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { Button, buttonVariants } from '~/components/ui/button';
import {
	createClient,
	getSessionTokensFromBrowser,
} from '~/lib/api-client/client-manager';
import { buildLoginRedirectSearch } from '~/lib/login-redirect-search';
import { shouldShowSecondaryPanel } from '~/lib/navigation/route-metadata';
import { ServerFailure } from '~/lib/server/server-failure';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import {
	selectToken,
	type ParsedSessionTokens,
} from '@org/shared-ts/lib/session/parse';

import { AuthedLayout } from '../../layouts/authed-layout';

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

export const determineSessionToken = (
	tokens: ParsedSessionTokens,
	pathname: string,
): { token: string | undefined; redirectPath?: string } => {
	const isStaffPath = pathname.startsWith(STAFF_PATH);
	const isTenantPath = pathname.startsWith(TENANT_PATH);
	const staffToken = tokens.staffToken;
	const tenantToken = selectToken(tokens, 'tenant');

	if (!staffToken && !tenantToken) {
		return { token: undefined };
	}

	if (isStaffPath) {
		if (!staffToken) {
			return tenantToken
				? { token: undefined, redirectPath: TENANT_PATH }
				: { token: undefined };
		}

		return { token: staffToken };
	}

	if (isTenantPath) {
		if (!tenantToken) {
			return staffToken
				? { token: undefined, redirectPath: STAFF_PATH }
				: { token: undefined };
		}

		return { token: tenantToken };
	}

	return staffToken ? { token: staffToken } : { token: tenantToken };
};

const parseRedirectCode = async (token: string): Promise<string | null> => {
	const client = createClient({ getSessionToken: () => token });
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
			// Internal ServerFailure metadata, never rendered raw — the displayed
			// copy comes from t() keyed off .status/.translationKey (__root.tsx).
			// i18n-guard-ignore: no-hardcoded-ui-literal — see comment above.
			title: failure.title ?? 'Request failed',
			// i18n-guard-ignore: no-hardcoded-ui-literal — see title above.
			detail: failure.detail ?? 'Request failed',
			translationKey: failure.translationKey,
		});
	}
};

const AuthedRouteLoadingShell = ({
	pathname,
	search,
}: {
	pathname: string;
	search: Record<string, unknown>;
}) => {
	const { t } = useTranslation('common');
	const isTenantPortalRoot = pathname.replace(/\/+$/, '') === TENANT_PATH;

	if (isTenantPortalRoot) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<IconLoader2
					aria-hidden="true"
					className="size-8 animate-spin text-muted-foreground"
				/>
			</div>
		);
	}

	return (
		<AuthedLayout pathname={pathname} search={search}>
			{t('loading')}
		</AuthedLayout>
	);
};

// TanStack Start renders this as the route's SSR fallback AND its
// pre-hydration ClientOnly fallback (see Match.js: `resolvedNoSsr` routes
// wrap MatchInner in `<ClientOnly fallback={pendingElement}>`). Without a
// pendingComponent, that fallback is `null` — a genuinely blank <body> for
// the entire network+hydrate round trip on a cold boot (tab discard, hard
// reload).
//
// This must stay a STATIC skeleton, not the real (Zustand-backed)
// AuthedRouteLoadingShell above: that shell's secondary-panel visibility
// depends on `useUiStore`, whose persisted sidebarOpen/colorScheme are only
// read from localStorage in a `useEffect` (`hydrateFromStorage`) — deferred
// on purpose so the store's SSR-safe default doesn't cause a hydration
// mismatch. `pendingComponent` is unmounted and replaced by a brand-new
// mount of the real route component the instant hydration completes
// (ClientOnly swaps `fallback` for `children`, a different element type at
// that position, forcing React to remount) — a second, independent
// AppShell/useUiStore mount with its OWN un-hydrated-yet default render.
// Reusing the stateful shell here raced that second mount's correction
// against whatever the real route was already settled on, intermittently
// leaving a stale/duplicate secondary-panel node (caught by
// shell.spec.ts's collapsed-panel-preference test). A skeleton with no
// store dependency can't race anything.
//
// This also deliberately uses its OWN testids (`app-shell-pending-*`), not
// the real shell's (`app-shell-shell`/`app-shell-rail`/`app-shell-topbar`):
// an internal redirect (e.g. `/staff` -> `/staff/staff-users`) re-matches
// the whole route tree, and TanStack Router keeps the outgoing match's DOM
// mounted (hidden via `display:none`) while the incoming match's
// pendingComponent renders — so a real, already-hydrated shell and a fresh
// pendingComponent render can briefly coexist in the DOM. Sharing testids
// with the real shell would make that framework transition look like a
// strict-mode duplicate to every existing `getByTestId('app-shell-rail')`
// assertion; distinct testids keep the two trees unambiguous.
const AuthedRoutePendingSkeleton = () => {
	const location = useLocation();
	const { t } = useTranslation('common');
	const pathname = location.pathname ?? '';
	const isTenantPortalRoot = pathname.replace(/\/+$/, '') === TENANT_PATH;

	if (isTenantPortalRoot) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<IconLoader2
					aria-hidden="true"
					className="size-8 animate-spin text-muted-foreground"
				/>
			</div>
		);
	}

	// r4-shell-F4: `.app-shell-workspace:has(.app-shell-secondary-panel)`
	// (app.css) widens the grid purely off DOM presence — no store/JS
	// conditional needed here. `shouldShowSecondaryPanel(pathname)` with no
	// options uses the exact same defaults the real shell falls back to
	// before `sidebarOpen` hydrates (list routes open, rail-only/detail
	// routes closed — see route-metadata.tsx), so this store-free skeleton
	// still reserves the right grid track and the real first frame doesn't
	// pop the layout when it mounts.
	const showSecondaryPanel = shouldShowSecondaryPanel(pathname);

	return (
		<div
			className="app-shell-workspace"
			data-testid="app-shell-pending-skeleton"
			data-mode="authed"
		>
			<nav
				className="app-shell-rail"
				aria-label={t('primary-navigation')}
				data-testid="app-shell-pending-rail"
			/>
			{showSecondaryPanel ? (
				<aside
					className="app-shell-secondary-panel"
					data-testid="app-shell-pending-secondary-panel"
				/>
			) : null}
			<div className="app-shell-body">
				<header
					className="app-shell-topbar"
					data-testid="app-shell-pending-topbar"
				/>
				<main className="app-shell-main" />
			</div>
		</div>
	);
};

const AuthedLayoutErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const routeStatus = getFailureStatus(error);
	if (routeStatus === 401) {
		return <LogoutRedirect />;
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <View404 />;
	}

	const retry = () => {
		reset();
		void router.invalidate();
	};

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title={t('something-went-wrong')}
			description={t('problem-loading-page')}
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

export const Route = createFileRoute('/_authed-layout')({
	ssr: false,
	beforeLoad: async ({ location }) => {
		if (typeof document === 'undefined') {
			return;
		}

		const tokens = getSessionTokensFromBrowser();
		const pathname = location.pathname ?? '';
		const { redirectPath, token } = determineSessionToken(tokens, pathname);

		if (!token && redirectPath) {
			throw redirect({ to: redirectPath });
		}

		if (!token) {
			throw redirect({
				to: '/login',
				search: buildLoginRedirectSearch({
					hadSession: Boolean(
						tokens.staffToken || selectToken(tokens, 'tenant'),
					),
					returnTo: `${pathname}${location.searchStr ?? ''}`,
				}),
			});
		}
	},
	pendingComponent: AuthedRoutePendingSkeleton,
	errorComponent: AuthedLayoutErrorBoundary,
	notFoundComponent: () => <View404 />,
	component: AuthedRouteLayout,
});

function AuthedRouteLayout() {
	const location = useLocation();
	const pathname = location.pathname ?? '';
	const search = location.search as Record<string, unknown>;
	const navigate = useNavigate();
	const { t } = useTranslation('common');
	const isStaffSurface = pathname.startsWith(STAFF_PATH);
	const isTenantSurface = pathname.startsWith(TENANT_PATH);
	const surfaceScope = ((): 'staff' | 'tenant' | 'other' => {
		if (isStaffSurface) {
			return 'staff';
		}

		if (isTenantSurface) {
			return 'tenant';
		}

		return 'other';
	})();
	const query = useQuery({
		queryKey: ['front-2', 'auth', 'surface-redirect-code', surfaceScope],
		queryFn: async (): Promise<string | null> => {
			const tokens = getSessionTokensFromBrowser();
			const resolved = determineSessionToken(tokens, pathname);

			if (!resolved.token) {
				// A TanStack Query v5 queryFn must never resolve to `undefined`
				// (it rejects with "Query data cannot be undefined"). `beforeLoad`
				// already redirects away before this ever mounts without a token,
				// so this is a defensive no-op path, not the redirect-away signal.
				return null;
			}

			return parseRedirectCode(resolved.token);
		},
		enabled: surfaceScope !== 'other',
		retry: false,
		// Session-stable: which surface a token belongs to only changes on
		// login/logout, both already invalidated explicitly (see
		// useCurrentUserQuery). Refetching this on every tab refocus is what
		// turns a transient/background hiccup into a full-page error swap
		// (see hasQueryError below) — it must not ride the focus trigger.
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
	const routeFailureStatus =
		query.isError && query.error ? getFailureStatus(query.error) : undefined;
	const hasQueryError = query.isError && Boolean(query.error);

	useEffect(() => {
		if (hasQueryError || query.data == null) {
			return;
		}

		if (isStaffSurface && query.data !== REDIRECT_CODE.STAFF) {
			void navigate({ to: TENANT_PATH, replace: true });
		} else if (isTenantSurface && query.data === REDIRECT_CODE.STAFF) {
			void navigate({ to: STAFF_PATH, replace: true });
		}
	}, [
		hasQueryError,
		isStaffSurface,
		isTenantSurface,
		pathname,
		navigate,
		query.data,
	]);

	const isSurfaceMismatch =
		!hasQueryError &&
		query.data != null &&
		((isStaffSurface && query.data !== REDIRECT_CODE.STAFF) ||
			(isTenantSurface && query.data === REDIRECT_CODE.STAFF));

	// The tenant portal (post-login org picker) is a standalone SimpleLayout
	// surface, not the workspace shell — see docs/front-2-migration P1. It
	// manages its own chrome, so it renders bare here, ahead of `<Outlet />`
	// being wrapped in the full authed app shell.
	const isTenantPortalRoot = pathname.replace(/\/+$/, '') === TENANT_PATH;

	if (hasQueryError) {
		if (query.error && shouldLogoutForFailure(query.error)) {
			return <LogoutRedirect />;
		}

		if (routeFailureStatus === 403) {
			return <View403 />;
		}

		if (routeFailureStatus === 404) {
			return <View404 />;
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title={t('something-went-wrong')}
				description={t('problem-loading-page')}
				actions={
					<>
						<Button
							variant="default"
							onClick={() => void query.refetch()}
							type="button"
						>
							{t('retry')}
						</Button>
						<Link to="/" className={buttonVariants({ variant: 'outline' })}>
							{t('go-to-home')}
						</Link>
					</>
				}
			/>
		);
	}

	if (query.isLoading) {
		return <AuthedRouteLoadingShell pathname={pathname} search={search} />;
	}

	if (isSurfaceMismatch) {
		// A neutral, pathname-agnostic skeleton — the pathname-bound
		// AuthedRouteLoadingShell would flash the wrong surface's nav rail
		// for the duration of the navigate({ to: TENANT_PATH | STAFF_PATH })
		// round trip triggered by the effect above.
		return <AuthedRoutePendingSkeleton />;
	}

	if (isTenantPortalRoot) {
		return <Outlet />;
	}

	return (
		<AuthedLayout pathname={pathname} search={search}>
			<Outlet />
		</AuthedLayout>
	);
}
