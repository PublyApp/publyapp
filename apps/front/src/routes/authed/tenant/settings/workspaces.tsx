import { IconFolder } from '@tabler/icons-react';
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
} from '~/lib/query/tenants-for-picker';
import { readSelectedTenantId } from '~/lib/selected-tenant-storage';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantReadOnlyCardError,
	TenantReadOnlyCardSkeleton,
} from '../_read-only-query-slots';
import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from '../_workspace-page-parts';

/**
 * Read-only org workspaces. No workspaces API exists, so the only real value
 * on the page is the current workspace itself — the tenant identity the
 * workspace shell already resolved (name + slug, from the same picker query
 * the shell uses). The default-workspace configuration is an explicit
 * coming-later state — never fabricated workspace cards, never a disabled
 * create button that pretends to work.
 */
const TenantSettingsWorkspacesPage = () => {
	const { t } = useTranslation(['settings', 'common']);
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

	return (
		<div className="space-y-5" data-testid="tenant-settings-workspaces-page">
			<WorkspacePageHeader titleKey="workspaces" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:all-workspaces')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<QueryDisplay
						query={query}
						LoadingSlot={
							<TenantReadOnlyCardSkeleton testId="tenant-settings-workspaces-skeleton" />
						}
						ErrorSlot={
							<TenantReadOnlyCardError
								query={query}
								titleKey="failed-to-load-organization"
								descriptionKey="failed-to-load-organization-description"
								testId="tenant-settings-workspaces-error"
							/>
						}
					>
						{({ data }) => {
							const tenant = resolveWorkspaceTenant(data, selectedTenantId);

							return (
								<div className="space-y-1">
									<ReadOnlyFieldRow label={t('common:name')}>
										<ReadOnlyValue>
											{tenant?.name ?? t('common:unnamed-tenant')}
										</ReadOnlyValue>
									</ReadOnlyFieldRow>
									<ReadOnlyFieldRow label={t('common:workspace-slug')}>
										<ReadOnlyValue>{tenant?.code}</ReadOnlyValue>
									</ReadOnlyFieldRow>
									<ReadOnlyFieldRow label={t('common:description')}>
										<ReadOnlyValue />
									</ReadOnlyFieldRow>
								</div>
							);
						}}
					</QueryDisplay>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:default-workspace')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconFolder}
						title={t('default-workspace-coming-later-title')}
						description={t('default-workspace-coming-later-description')}
						testId="tenant-settings-default-workspace-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/workspaces',
)({
	staticData: {
		preload: () => [
			{
				options: tenantsForPickerQueryOptions,
				variables: {},
			},
		],
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'workspaces' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsWorkspacesPage,
});
