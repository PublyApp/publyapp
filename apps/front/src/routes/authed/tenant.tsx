import { IconBuilding, IconLoader2 } from '@tabler/icons-react';
import {
	createFileRoute,
	Navigate,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { SimpleLayout } from '~/layouts/simple-layout';
import { useSelectedTenantId } from '~/lib/hooks/use-selected-tenant-id';
import { useTenantsForPickerQuery } from '~/lib/query/tenants-for-picker';
import {
	resolveWorkspaceTenant,
	type TenantsForPickerData,
	type TenantForPickerRow,
} from '~/lib/query/tenants-for-picker';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	TenantPortalEmptyState,
	TenantPortalErrorState,
	TenantPortalLoadingState,
} from './tenant/_tenant-picker-states';
import { TenantPortalPickerView } from './tenant/_tenant-picker-view';

/**
 * Non-JSX resolver adapter: keeps the `isSuccess` branch outside the portal
 * component so the query-state render contract stays in `QueryDisplay`.
 * `undefined` data (pre-resolution) resolves to no workspace, exactly like
 * the previous inline ternary.
 */
const resolveWorkspaceTenantWhenLoaded = (
	data: TenantsForPickerData | undefined,
	selectedTenantId: string | null,
): TenantForPickerRow | undefined =>
	data ? resolveWorkspaceTenant(data, selectedTenantId) : undefined;

/**
 * Neutral full-screen spinner shown while an unresolved `/tenant/*` child path
 * waits for the picker query to settle. Declared once as an element (not a
 * component) so passing it to `QueryDisplay` never remounts anything.
 */
const childRedirectingSurface = (
	<div
		className="flex min-h-svh items-center justify-center"
		data-testid="tenant-portal-redirecting"
	>
		<IconLoader2
			aria-hidden="true"
			className="size-8 animate-spin text-muted-foreground"
		/>
	</div>
);

/**
 * The tenant workspace shell: rendered by the resolved branch of
 * `TenantPortalRoute` for every `/tenant/*` CHILD path — the `/tenant` root
 * itself is the bare SimpleLayout picker and never hosts this shell. Child
 * paths mount inside the platform AppShell (rail + topbar + user menu, which
 * own navigation and logout), so the shell contributes only the tenant
 * identity the shared chrome cannot know — the resolved tenant's name and
 * code — and the child route. Deliberately no `<main>` (the AppShell owns
 * the landmark), no full-viewport height, no logout button: one nav layer
 * and one logout affordance per tenant route.
 */
const TenantWorkspaceShell = ({ tenant }: { tenant: TenantForPickerRow }) => {
	const { t } = useTranslation('common');
	const tenantName = tenant.name ?? t('unnamed-tenant');

	return (
		<div className="flex min-w-0 flex-col" data-testid="tenant-workspace-shell">
			<div className="flex items-center gap-3 border-b border-border pb-4">
				<div
					className="flex size-10 shrink-0 items-center justify-center rounded-[var(--publy-radius-input)] bg-muted"
					aria-hidden="true"
					data-testid="tenant-workspace-identity-icon"
				>
					<IconBuilding className="size-5 text-muted-foreground" />
				</div>
				<div className="min-w-0">
					<p
						className="truncate text-sm font-medium text-foreground"
						data-testid="tenant-workspace-tenant-name"
					>
						{tenantName}
					</p>
					{tenant.code ? (
						<p
							className="truncate font-mono text-xs text-muted-foreground"
							data-testid="tenant-workspace-tenant-code"
						>
							{tenant.code}
						</p>
					) : null}
				</div>
			</div>
			<div className="mx-auto mt-6 w-full min-w-0 max-w-5xl">
				<Outlet />
			</div>
		</div>
	);
};

const TenantPortalRoute = () => {
	const query = useTenantsForPickerQuery();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	// Persisted UI preference read through `useSyncExternalStore`: server and
	// hydration share the stable `null` snapshot, then the store value applies
	// after mount (react-doctor/no-hydration-branch-on-browser-global).
	const [selectedTenantId, setSelectedTenantId] = useSelectedTenantId();
	const isTenantRoot = pathname.replace(/\/+$/, '') === '/tenant';
	const resolvedTenant = resolveWorkspaceTenantWhenLoaded(
		query.data,
		selectedTenantId,
	);
	const isResolvedToWorkspace = resolvedTenant !== undefined;

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns state rendering below. `shouldLogoutForFailure` only
	// recognises problem+json failures, so a settled success (error ===
	// undefined) never trips this gate.
	const queryError = query.error;
	if (
		queryError !== null &&
		queryError !== undefined &&
		shouldLogoutForFailure(queryError)
	) {
		return <LogoutRedirect />;
	}

	if (isResolvedToWorkspace) {
		if (isTenantRoot) {
			// Once a workspace resolves, bounce to the first section — the same
			// shape as `/staff` -> `/staff/staff-users`. Declared in JSX so the
			// redirect can never land a frame late
			// (react-doctor/no-event-handler) and renders identically on the
			// server and during hydration
			// (react-doctor/no-hydration-branch-on-browser-global).
			return (
				<div
					className="flex min-h-svh items-center justify-center"
					data-testid="tenant-portal-redirecting"
				>
					<Navigate to="/tenant/account" replace />
					<IconLoader2
						aria-hidden="true"
						className="size-8 animate-spin text-muted-foreground"
					/>
				</div>
			);
		}

		return <TenantWorkspaceShell tenant={resolvedTenant} />;
	}

	if (isTenantRoot) {
		return (
			<SimpleLayout>
				<QueryDisplay
					query={query}
					LoadingSlot={TenantPortalLoadingState}
					ErrorSlot={TenantPortalErrorState}
				>
					{({ data }) =>
						data.totalCount === 0 ? (
							<TenantPortalEmptyState />
						) : (
							<TenantPortalPickerView
								data={data}
								onSelect={(tenantId) => {
									// Persists AND notifies subscribers (same-tab) via the external store.
									setSelectedTenantId(tenantId);
								}}
							/>
						)
					}
				</QueryDisplay>
			</SimpleLayout>
		);
	}

	// Unresolved child path: once the picker query settles without a
	// resolvable workspace, redirect to `/tenant`, where the bare picker is
	// the single unresolved surface. `QueryDisplay` owns every query state:
	// pending keeps the neutral spinner (never the picker itself, which would
	// nest SimpleLayout inside the AppShell); error, empty catalog, and a
	// loaded list that fails to resolve the persisted preference all declare
	// the same redirect in JSX. Nothing here branches on query-state booleans
	// or browser-only values, so server and hydration render identically.
	return (
		<QueryDisplay
			query={query}
			LoadingSlot={childRedirectingSurface}
			ErrorSlot={<Navigate to="/tenant" replace />}
			EmptySlot={<Navigate to="/tenant" replace />}
		>
			{() => <Navigate to="/tenant" replace />}
		</QueryDisplay>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant')({
	// `/tenant` is the bare portal root: a redirect-only stub that never
	// renders chrome itself (the picker is a SimpleLayout surface with no
	// AppShell — see `isTenantPortalPath` in `route-shell.ts`), and once a
	// workspace resolves it bounces to `/tenant/account`, mirroring
	// `/staff` -> `/staff/staff-users`. Every `/tenant/*` CHILD path renders
	// inside the AppShell; an unresolved child redirects back to `/tenant`
	// so the bare picker stays the single unresolved surface.
	staticData: { crumbs: () => [] },
	component: TenantPortalRoute,
});
