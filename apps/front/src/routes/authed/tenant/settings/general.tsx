import {
	IconAlertCircle,
	IconAlertTriangle,
	IconClock,
} from '@tabler/icons-react';
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
} from '../_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/settings/')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'general' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsGeneralPage,
});

/**
 * Read-only org settings. No settings API exists, so the only real values on
 * the page are the tenant identity the workspace shell already resolved
 * (name + slug, from the same picker query the shell uses); every other
 * field is an explicit "not available yet" or coming-later state — never
 * fabricated data, never a Save button that does nothing.
 */
function TenantSettingsGeneralPage() {
	const { t } = useTranslation(['settings', 'common']);
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
		<div className="space-y-5" data-testid="tenant-settings-general-page">
			<WorkspacePageHeader titleKey="general" />

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
							testId="tenant-settings-general-error"
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
									data-testid="tenant-settings-general-skeleton"
								>
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
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
									<ReadOnlyFieldRow label={t('common:description')}>
										<ReadOnlyValue />
									</ReadOnlyFieldRow>
									<ReadOnlyFieldRow label={t('common:industry')}>
										<ReadOnlyValue />
									</ReadOnlyFieldRow>
									<ReadOnlyFieldRow label={t('common:website')}>
										<ReadOnlyValue />
									</ReadOnlyFieldRow>
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t('regional-and-contact-settings')}</CardTitle>
							<ReadOnlyBadge />
						</CardHeader>
						<CardContent>
							<StateSurface
								icon={IconClock}
								title={t('regional-and-contact-coming-later-title')}
								description={t('regional-and-contact-coming-later-description')}
								testId="tenant-settings-general-regional-empty"
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t('common:danger-zone')}</CardTitle>
							<ReadOnlyBadge />
						</CardHeader>
						<CardContent>
							<StateSurface
								icon={IconAlertTriangle}
								title={t('danger-zone-coming-later-title')}
								description={t('danger-zone-coming-later-description')}
								testId="tenant-settings-general-danger-empty"
							/>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}
