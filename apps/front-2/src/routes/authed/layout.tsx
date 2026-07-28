import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import {
	redirect,
	createFileRoute,
	Link,
	useLocation,
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
import { getSessionTokensFromBrowser } from '~/lib/api-client/client-manager';
import { buildLoginRedirectSearch } from '~/lib/login-redirect-search';
import { determineSessionToken, getSessionSurface } from '~/lib/session-scope';
import {
	useSessionSurfaceRecovery,
	useSessionSurfaceValidation,
} from '~/lib/session-surface-recovery-context';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import { selectToken } from '@org/shared-ts/lib/session/parse';

import { AuthedRouteContentSkeleton } from './_route-content-skeleton';

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

const isNavigationReload = (): boolean => {
	if (typeof window === 'undefined' || typeof performance === 'undefined') {
		return false;
	}

	const [entry] = performance.getEntriesByType('navigation');
	if ((entry as PerformanceNavigationTiming | undefined)?.type === 'reload') {
		return true;
	}

	return false;
};

const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

// TanStack Start renders this as the route's SSR fallback and its
// pre-hydration ClientOnly fallback for this `ssr: false` route. Shell
// ownership deliberately stays above the route match in RoutedShell: an
// internal redirect such as `/staff` -> `/staff/staff-users` replaces this
// content fallback, but it cannot replace the real AppShell or create a
// second Zustand-backed shell mount. Keeping the pending component
// store-free preserves the persisted secondary-panel geometry contract.
const AuthedRoutePendingSkeleton = () => {
	const location = useLocation();
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

	return <AuthedRouteContentSkeleton />;
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
			code={t('error-500-code')}
			title={t('something-went-wrong')}
			description={t('problem-loading-page')}
			actions={
				<Button variant="default" onClick={retry} type="button">
					{t('retry')}
				</Button>
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
	const navigate = useNavigate();
	const isSurfaceRecovery = useSessionSurfaceRecovery();
	const { t } = useTranslation('common');
	const surfaceScope = getSessionSurface(pathname);
	const isStaffSurface = surfaceScope === 'staff';
	const isTenantSurface = surfaceScope === 'tenant';
	const query = useSessionSurfaceValidation();
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
				code={t('error-500-code')}
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
						{isSurfaceRecovery && !isNavigationReload() ? null : (
							<Link to="/" className={buttonVariants({ variant: 'outline' })}>
								{t('go-to-home')}
							</Link>
						)}
					</>
				}
			/>
		);
	}

	if (query.isLoading) {
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

		return <AuthedRouteContentSkeleton />;
	}

	if (isSurfaceMismatch) {
		// Keep route content neutral while RoutedShell preserves the committed
		// surface shell for the navigate({ to: TENANT_PATH | STAFF_PATH })
		// round trip triggered by the effect above.
		return <AuthedRoutePendingSkeleton />;
	}

	return <Outlet />;
}
