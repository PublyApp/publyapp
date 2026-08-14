import { IconBuilding, IconLoader2, IconLogout } from '@tabler/icons-react';
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { SimpleLayout } from '~/layouts/simple-layout';
import { useLogout } from '~/lib/hooks/use-logout';
import type { AppRoutePath } from '~/lib/navigation/route-metadata';
import { useTenantsForPickerQuery } from '~/lib/query/tenants-for-picker';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';
import { isActiveTenantForPicker } from '~/lib/query/tenants-for-picker';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import { cn } from '~/lib/utils';

import {
	TenantPortalEmptyState,
	TenantPortalErrorState,
	TenantPortalLoadingState,
} from './tenant/_tenant-picker-states';
import { TenantPortalPickerView } from './tenant/_tenant-picker-view';

export const Route = createFileRoute('/_authed-layout/tenant')({
	// `/tenant` is the workspace root itself (RoutedShell renders it without
	// the AppShell workspace chrome at all — see `isTenantPortalRoot`), so an
	// empty tail is correct: the scope root crumb ("Workspace") is the whole
	// trail. Each child route (account/settings/posts/organizations) declares
	// its own trail, which is what the deepest match actually surfaces.
	staticData: { crumbs: () => [] },
	component: TenantPortalRoute,
});

const WORKSPACE_NAV_ITEMS: readonly { labelKey: string; to: AppRoutePath }[] = [
	{ labelKey: 'account', to: '/tenant/account' },
	{ labelKey: 'settings', to: '/tenant/settings' },
	{ labelKey: 'posts', to: '/tenant/posts' },
	{ labelKey: 'organizations', to: '/tenant/organizations' },
];

const isWorkspaceNavItemActive = (pathname: string, to: string): boolean =>
	pathname === to || pathname.startsWith(`${to}/`);

const resolveWorkspaceTenant = (
	data: TenantsForPickerData,
	selectedTenantId: string | null,
): TenantsForPickerData['tenants'][number] | undefined => {
	if (selectedTenantId) {
		return data.tenants.find((tenant) => tenant.id === selectedTenantId);
	}

	if (data.activeCount === 1) {
		return data.tenants.find(isActiveTenantForPicker);
	}

	return undefined;
};

/**
 * The tenant workspace shell: rendered by the resolved branch of
 * `TenantPortalRoute` for every `/tenant/*` route. It carries the tenant
 * identity (resolved by the picker) and the top-level workspace navigation
 * (Account / Settings / Posts / Organizations); child routes render in the
 * `<Outlet />`. It is self-contained chrome because the portal root renders
 * bare in `RoutedShell` (no AppShell) — at child routes the platform AppShell
 * topbar wraps it.
 */
const TenantWorkspaceShell = ({
	data,
	selectedTenantId,
}: {
	data: TenantsForPickerData;
	selectedTenantId: string | null;
}) => {
	const { t } = useTranslation('common');
	const { logout, isLoggingOut } = useLogout();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const tenant = resolveWorkspaceTenant(data, selectedTenantId);
	const tenantName = tenant?.name ?? t('unnamed-tenant');

	return (
		<div
			className="flex min-h-svh flex-col bg-background"
			data-testid="tenant-workspace-shell"
		>
			<header className="border-b border-border">
				<div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
					<div className="flex min-w-0 items-center gap-3">
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
							{tenant?.code ? (
								<p
									className="truncate font-mono text-xs text-muted-foreground"
									data-testid="tenant-workspace-tenant-code"
								>
									{tenant.code}
								</p>
							) : null}
						</div>
					</div>
					<Button
						variant="ghost"
						disabled={isLoggingOut}
						onClick={() => logout()}
						className="shrink-0 text-muted-foreground"
						data-testid="tenant-workspace-logout-button"
					>
						{isLoggingOut ? (
							<IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
						) : (
							<IconLogout aria-hidden="true" className="size-4" />
						)}
						{t('log-out')}
					</Button>
				</div>
				<nav
					aria-label={t('nav-tenant-workspace')}
					className="flex gap-1 overflow-x-auto px-4 pb-1 sm:px-6"
					data-testid="tenant-workspace-nav"
				>
					{WORKSPACE_NAV_ITEMS.map((item) => {
						const isActive = isWorkspaceNavItemActive(pathname, item.to);

						return (
							<Link
								key={item.to}
								to={item.to}
								aria-current={isActive ? 'page' : undefined}
								className={cn(
									'shrink-0 border-b-2 border-transparent px-1 pb-2 pt-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
									isActive && 'border-primary text-foreground',
								)}
								data-testid="tenant-workspace-nav-link"
								data-nav-to={item.to}
								data-active={isActive ? 'true' : undefined}
							>
								{t(item.labelKey)}
							</Link>
						);
					})}
				</nav>
			</header>
			<main className="flex-1 px-4 py-6 sm:px-6">
				<div className="mx-auto w-full max-w-5xl">
					<Outlet />
				</div>
			</main>
		</div>
	);
};

function TenantPortalRoute() {
	const query = useTenantsForPickerQuery();
	const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	// Mirrors the backend's GetRedirectCode rule: exactly one ACTIVE tenant
	// auto-resolves regardless of hasSuspendedTenants (a suspended sibling
	// tenant never forces the picker open).
	const isResolvedToWorkspace =
		query.isSuccess &&
		(query.data.activeCount === 1 || selectedTenantId !== null);

	if (query.isSuccess && isResolvedToWorkspace) {
		return (
			<TenantWorkspaceShell
				data={query.data}
				selectedTenantId={selectedTenantId}
			/>
		);
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
							onSelect={setSelectedTenantId}
						/>
					)
				}
			</QueryDisplay>
		</SimpleLayout>
	);
}
