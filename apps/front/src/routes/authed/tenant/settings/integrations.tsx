import { IconApi, IconGridDots, IconPlug } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ReconnectBanner } from '~/components/social-accounts/reconnect-banner';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';
import {
	toNeedsReconnectAccounts,
	useNeedsReconnectAccountsQuery,
} from '~/lib/query/needs-reconnect-accounts';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

// C3 integration point: open the reconnect drawer prefilled with this
// account. Until that drawer ships on this surface, the banner still
// renders and gates correctly without a working action. Kept at module
// scope so the reference stays stable across renders.
const handleReconnectPlaceholder = () => {};

/**
 * Org integrations. The connected card now carries the C4 needs-reconnect
 * banner over the coming-later state: accounts whose credentials broke are
 * surfaced with their stored cause and a Reconnect action for manage holders.
 */
const TenantSettingsIntegrationsPage = () => {
	const { t } = useTranslation(['settings', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const needsReconnectQuery = useNeedsReconnectAccountsQuery(tenantId);
	const needsReconnectAccounts = toNeedsReconnectAccounts(
		needsReconnectQuery.data,
	);

	// Permission plumbing does not reach the frontend yet (the auth-data
	// payload carries identity only), so every signed-in tenant user counts
	// as a manage holder for now. C3 (integrations screen, lane 642) owns
	// wiring the real `socialaccounts.manage` check once the session exposes
	// permissions.
	const hasManagePermission = true;

	return (
		<div className="space-y-5" data-testid="tenant-settings-integrations-page">
			<WorkspacePageHeader titleKey="integrations" />

			<ReconnectBanner
				accounts={needsReconnectAccounts}
				hasManagePermission={hasManagePermission}
				onReconnect={handleReconnectPlaceholder}
			/>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:connected')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconPlug}
						title={t('connected-integrations-coming-later-title')}
						description={t('connected-integrations-coming-later-description')}
						testId="tenant-settings-connected-integrations-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:available-integrations')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconGridDots}
						title={t('available-integrations-coming-later-title')}
						description={t('available-integrations-coming-later-description')}
						testId="tenant-settings-available-integrations-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:api-access')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconApi}
						title={t('api-access-coming-later-title')}
						description={t('api-access-coming-later-description')}
						testId="tenant-settings-api-access-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/integrations',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'integrations' },
		],
		i18nNamespaces: ['settings', 'social-accounts'],
	},
	component: TenantSettingsIntegrationsPage,
});
