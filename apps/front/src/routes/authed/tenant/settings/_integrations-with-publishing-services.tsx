import type { ComponentType } from 'react';
import { useCanManageSocialAccounts } from '~/lib/permissions/use-has-tenant-permission';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { AggregatorsCard } from './_aggregators-card';

/** The Integrations page plus the publishing-services card. A wrapper rather than
 * a new block inside the page function, which is already over the complexity cap. */
export const withPublishingServicesCard = (Page: ComponentType) => {
	const PageWithPublishingServices = () => {
		// preload-exempt: session-stable permission gate mounted by the app shell, fetched once per workspace tenant
		const canManage = useCanManageSocialAccounts();
		const tenantId = useResolvedWorkspaceTenantId();

		return (
			<div className="space-y-5">
				<Page />
				{tenantId === null ? null : (
					<AggregatorsCard tenantId={tenantId} canManage={canManage} />
				)}
			</div>
		);
	};

	return PageWithPublishingServices;
};
