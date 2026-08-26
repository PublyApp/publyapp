import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
	useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { getSessionTokensFromBrowser } from '~/lib/api-client/client-manager';
import {
	hasExactAuthedRouteMatch,
	isTenantPortalPath,
} from '~/lib/navigation/route-shell';
import { useSessionSurfaceValidation } from '~/lib/session-surface-recovery-context';
import {
	determineSessionToken,
	getSessionSurface,
} from '~/lib/session/session-scope';

import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import { buildLoginRedirectSearch } from '@org/shared-ts/lib/login-redirect-search';
import { selectToken } from '@org/shared-ts/lib/session/parse';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { getFailureStatus } from './_api-problem-status';
import { AuthedLayoutErrorBoundary } from './_layout-error-boundary';
import { AuthedRouteContentSkeleton } from './_route-content-skeleton';
import { AuthedRoutePendingSkeleton } from './_route-pending-skeleton';

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

const AuthedRouteLayout = () => {
	const location = useLocation();
	const pathname = location.pathname ?? '';
	const navigate = useNavigate();
	const { t } = useTranslation('common');
	const surfaceScope = getSessionSurface(pathname);
	const isStaffSurface = surfaceScope === 'staff';
	const isTenantSurface = surfaceScope === 'tenant';
	const query = useSessionSurfaceValidation();
	const routeFailureStatus =
		query.isError && query.error ? getFailureStatus(query.error) : undefined;
	const hasQueryError = query.isError && Boolean(query.error);
	const retry = () => {
		void query.refetch();
	};

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
				code={t('error-500-code')}
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
	}

	if (query.isLoading) {
		// Only the exact `/tenant` portal root renders bare (RoutedShell
		// bypasses the AppShell for it — see `isTenantPortalPath` in
		// route-shell), so its loading surface is a full-viewport centered
		// loader. Tenant CHILD paths mount inside the AppShell and get the
		// normal AppShell-shaped content skeleton.
		if (isTenantPortalPath(pathname)) {
			return (
				<div className="flex min-h-svh items-center justify-center">
					<IconLoader2
						aria-hidden="true"
						className="size-8 animate-spin text-muted-foreground"
					/>
				</div>
			);
		}

		return <AuthedRouteContentSkeleton />;
	}

	if (isSurfaceMismatch) {
		// Keep route content neutral while RoutedShell preserves the committed
		// surface shell for the navigate({ to: TENANT_PATH | STAFF_PATH })
		// round trip triggered by the effect above.
		return <AuthedRoutePendingSkeleton />;
	}

	return <Outlet />;
};

export const Route = createFileRoute('/_authed-layout')({
	staticData: { crumbs: 'shell' },
	ssr: false,
	beforeLoad: async ({ location, matches }) => {
		if (typeof document === 'undefined') {
			return;
		}

		// This pathless layout also matches unknown paths under an authed
		// prefix (e.g. /staff/not-a-route) — the root already declines to
		// treat those as an authenticated route (see `resolveRootContext` in
		// __root.tsx), but this route's own beforeLoad used to run the
		// session-token redirect logic below regardless, so a signed-out
		// visitor or a stale/cross-scope cookie holder got redirected to
		// /login or /tenant instead of seeing the genuine 404 (PR #997
		// finding 1). Applying the same exact-match guard here keeps that
		// redirect logic scoped to real authenticated routes only.
		if (!hasExactAuthedRouteMatch(matches, location.pathname ?? '/')) {
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
