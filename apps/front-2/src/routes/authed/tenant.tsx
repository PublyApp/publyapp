import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import QueryDisplay from '~/components/query-display';
import { SimpleLayout } from '~/layouts/simple-layout';
import { useTenantsForPickerQuery } from '~/lib/query/tenants-for-picker';

import {
	TenantPortalEmptyState,
	TenantPortalErrorState,
	TenantPortalLoadingState,
} from './tenant/_tenant-picker-states';
import { TenantPortalPickerView } from './tenant/_tenant-picker-view';

export const Route = createFileRoute('/_authed-layout/tenant')({
	component: TenantPortalRoute,
});

/**
 * front-2's tenant surface has no per-tenant workspace route yet (unlike
 * apps/front's `/app/{tenantId}`) — `/tenant` is both the picker's home and
 * the eventual workspace root. Once a single active tenant is known (or the
 * user picks one from 2+ actives), this stub stands in for that workspace
 * until a real tenant workspace ships.
 */
const TenantWorkspacePlaceholder = () => (
	<div data-testid="tenant-workspace-placeholder">
		<h1>Tenant</h1>
	</div>
);

function TenantPortalRoute() {
	const query = useTenantsForPickerQuery();
	const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

	// Mirrors the backend's GetRedirectCode rule: exactly one ACTIVE tenant
	// auto-resolves regardless of hasSuspendedTenants (a suspended sibling
	// tenant never forces the picker open).
	const isResolvedToWorkspace =
		query.isSuccess &&
		(query.data.activeCount === 1 || selectedTenantId !== null);

	if (isResolvedToWorkspace) {
		return <TenantWorkspacePlaceholder />;
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
