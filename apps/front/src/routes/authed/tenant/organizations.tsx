import { IconBuilding, IconUsers } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';
import {
	resolveWorkspaceTenant,
	tenantsForPickerQueryOptions,
	useTenantsForPickerQuery,
	type TenantsForPickerData,
} from '~/lib/query/tenants-for-picker';
import { readSelectedTenantId } from '~/lib/selected-tenant-storage';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantReadOnlyCardErrorInCard,
	TenantReadOnlyCardSkeleton,
} from './_read-only-query-slots';
import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from './_workspace-page-parts';

/**
 * The two explicit coming-later surfaces. They render unchanged in every
 * query state except error (which replaces the whole page body), so both
 * the loading slot and the data branch share them.
 */
const OrganizationsComingLaterCards = () => {
	const { t } = useTranslation(['organizations', 'common']);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>{t('organizations-list')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconBuilding}
						title={t('organizations-coming-later-title')}
						description={t('organizations-coming-later-description')}
						testId="tenant-organizations-list-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:members')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconUsers}
						title={t('members-coming-later-title')}
						description={t('members-coming-later-description')}
						testId="tenant-organizations-members-empty"
					/>
				</CardContent>
			</Card>
		</>
	);
};

/**
 * Read-only organizations surface. No organizations API exists, so the only
 * real values are the tenant identity the workspace shell already resolved
 * (name + slug, from the same picker query the shell uses); the organization
 * list and member management are explicit coming-later states — never
 * fabricated rows, never a fake control.
 */
const TenantOrganizationsPage = () => {
	const { t } = useTranslation(['organizations', 'common']);
	const query = useTenantsForPickerQuery();
	const [selectedTenantId] = useState<string | null>(() =>
		readSelectedTenantId(),
	);

	// Logout gate: read the hoisted error local instead of branching on the
	// query result — QueryDisplay owns state rendering below.
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	const renderIdentityRows = (data: TenantsForPickerData) => {
		const tenant = resolveWorkspaceTenant(data, selectedTenantId);

		return (
			<div className="space-y-1">
				<ReadOnlyFieldRow
					label={t('common:logo')}
					description={t('common:logo-description')}
				>
					<ReadOnlyValue />
				</ReadOnlyFieldRow>
				<ReadOnlyFieldRow label={t('common:name')}>
					<ReadOnlyValue>
						{tenant?.name ?? t('common:unnamed-tenant')}
					</ReadOnlyValue>
				</ReadOnlyFieldRow>
				<ReadOnlyFieldRow label={t('common:workspace-slug')}>
					<ReadOnlyValue>{tenant?.code}</ReadOnlyValue>
				</ReadOnlyFieldRow>
			</div>
		);
	};

	return (
		<div className="space-y-5" data-testid="tenant-organizations-page">
			<WorkspacePageHeader titleKey="organizations" />

			<QueryDisplay
				query={query}
				LoadingSlot={
					<>
						<Card>
							<CardHeader>
								<CardTitle>{t('common:organization-details')}</CardTitle>
							</CardHeader>
							<CardContent>
								<TenantReadOnlyCardSkeleton testId="tenant-organizations-skeleton" />
							</CardContent>
						</Card>
						<OrganizationsComingLaterCards />
					</>
				}
				ErrorSlot={
					<TenantReadOnlyCardErrorInCard
						query={query}
						cardTitleKey="common:organization-details"
						titleKey="failed-to-load-organization"
						descriptionKey="failed-to-load-organization-description"
						testId="tenant-organizations-error"
					/>
				}
			>
				{({ data }) => (
					<>
						<Card>
							<CardHeader>
								<CardTitle>{t('common:organization-details')}</CardTitle>
								<ReadOnlyBadge />
							</CardHeader>
							<CardContent>{renderIdentityRows(data)}</CardContent>
						</Card>

						<OrganizationsComingLaterCards />
					</>
				)}
			</QueryDisplay>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/organizations')({
	staticData: {
		preload: () => [
			{
				options: tenantsForPickerQueryOptions,
				variables: {},
			},
		],
		crumbs: () => [{ kind: 'label', labelKey: 'organizations' }],
		i18nNamespaces: ['organizations'],
	},
	component: TenantOrganizationsPage,
});
