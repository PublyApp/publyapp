import { IconBuilding, IconLoader2 } from '@tabler/icons-react';
import {
	createFileRoute,
	Outlet,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { SimpleLayout } from '~/layouts/simple-layout';
import { useTenantsForPickerQuery } from '~/lib/query/tenants-for-picker';
import type {
	TenantForPickerRow,
	TenantsForPickerData,
} from '~/lib/query/tenants-for-picker';
import { isActiveTenantForPicker } from '~/lib/query/tenants-for-picker';
import {
	readSelectedTenantId,
	writeSelectedTenantId,
} from '~/lib/selected-tenant-storage';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	TenantPortalEmptyState,
	TenantPortalErrorState,
	TenantPortalLoadingState,
} from './tenant/_tenant-picker-states';
import { TenantPortalPickerView } from './tenant/_tenant-picker-view';

export const Route = createFileRoute('/_authed-layout/tenant')({
	// `/tenant` is a redirect-only stub: it never renders chrome itself (the
	// picker is a bare SimpleLayout surface — see `isTenantPortalRoot` in
	// `__root.tsx`), and once a workspace resolves it bounces to
	// `/tenant/account`, mirroring `/staff` -> `/staff/staff-users`. Every
	// child route declares its own trail, which is what the deepest match
	// surfaces in the AppShell topbar.
	staticData: { crumbs: () => [] },
	component: TenantPortalRoute,
});

/**
 * Resolves the workspace tenant. `selectedTenantId` wins when it names an
 * ACTIVE tenant in the user's list (a stored id can point at a tenant that
 * has since been suspended/removed — that is a genuine no-resolution, so the
 * picker shows); otherwise exactly one ACTIVE tenant auto-resolves, mirroring
 * the backend's GetRedirectCode rule. A suspended sibling never forces the
 * picker open.
 */
const resolveWorkspaceTenant = (
	data: TenantsForPickerData,
	selectedTenantId: string | null,
): TenantForPickerRow | undefined => {
	if (selectedTenantId) {
		const selected = data.tenants.find(
			(tenant) =>
				tenant.id === selectedTenantId && isActiveTenantForPicker(tenant),
		);
		if (selected) {
			return selected;
		}
	}

	if (data.activeCount === 1) {
		return data.tenants.find(isActiveTenantForPicker);
	}

	return undefined;
};

/**
 * The tenant workspace shell: rendered by the resolved branch of
 * `TenantPortalRoute` for every `/tenant/*` route. It renders INSIDE the
 * platform AppShell (rail + topbar + user menu, which own navigation and
 * logout), so it contributes only the tenant identity the shared chrome
 * cannot know — the resolved tenant's name and code — and the child route.
 * Deliberately no `<main>` (the AppShell owns the landmark), no full-viewport
 * height, no logout button: one nav layer and one logout affordance per
 * tenant route.
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

function TenantPortalRoute() {
	const query = useTenantsForPickerQuery();
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() =>
		readSelectedTenantId(),
	);
	const isTenantRoot = pathname.replace(/\/+$/, '') === '/tenant';
	const resolvedTenant = query.isSuccess
		? resolveWorkspaceTenant(query.data, selectedTenantId)
		: undefined;
	const isResolvedToWorkspace = resolvedTenant !== undefined;

	// The workspace root never hosts the shell: the shell only renders inside
	// the AppShell (whose rail is the workspace navigation), and the root
	// renders bare for the picker. Once a workspace resolves, bounce to the
	// first section — the same shape as `/staff` -> `/staff/staff-users`.
	useEffect(() => {
		if (isTenantRoot && isResolvedToWorkspace) {
			void navigate({ to: '/tenant/account', replace: true });
		}
	}, [isTenantRoot, isResolvedToWorkspace, navigate]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	if (isResolvedToWorkspace) {
		if (isTenantRoot) {
			return (
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
		}

		return <TenantWorkspaceShell tenant={resolvedTenant} />;
	}

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
								setSelectedTenantId(tenantId);
								writeSelectedTenantId(tenantId);
							}}
						/>
					)
				}
			</QueryDisplay>
		</SimpleLayout>
	);
}
