import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { SimpleLayout } from '~/layouts/simple-layout';
import { useTenantsForPickerQuery } from '~/lib/query/tenants-for-picker';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

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
const TenantWorkspacePlaceholder = () => {
	const { t } = useTranslation('common');

	return (
		<div data-testid="tenant-workspace-placeholder">
			<h1>{t('tenant')}</h1>
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
