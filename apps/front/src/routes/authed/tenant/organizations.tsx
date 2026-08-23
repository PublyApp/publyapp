import { IconAlertCircle, IconBuilding, IconUsers } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { ErrorStateSurface, StateSurface } from '~/components/ui/state-surface';
import {
	resolveWorkspaceTenant,
	useTenantsForPickerQuery,
} from '~/lib/query/tenants-for-picker';
import { readSelectedTenantId } from '~/lib/selected-tenant-storage';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from './_workspace-page-parts';

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
	const tenant = query.isSuccess
		? resolveWorkspaceTenant(query.data, selectedTenantId)
		: undefined;

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="tenant-organizations-page">
			<WorkspacePageHeader titleKey="organizations" />

			{query.isError ? (
				<Card>
					<CardHeader>
						<CardTitle>{t('common:organization-details')}</CardTitle>
					</CardHeader>
					<CardContent>
						<ErrorStateSurface
							icon={IconAlertCircle}
							title={t('failed-to-load-organization')}
							description={t('failed-to-load-organization-description')}
							testId="tenant-organizations-error"
							actions={
								<Button
									variant="default"
									type="button"
									onClick={() => void query.refetch()}
								>
									{t('common:retry')}
								</Button>
							}
						/>
					</CardContent>
				</Card>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>{t('common:organization-details')}</CardTitle>
							<ReadOnlyBadge />
						</CardHeader>
						<CardContent>
							{query.isPending ? (
								<div
									className="space-y-4"
									data-testid="tenant-organizations-skeleton"
								>
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
								</div>
							) : (
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
							)}
						</CardContent>
					</Card>

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
			)}
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/organizations')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'organizations' }],
		i18nNamespaces: ['organizations'],
	},
	component: TenantOrganizationsPage,
});
