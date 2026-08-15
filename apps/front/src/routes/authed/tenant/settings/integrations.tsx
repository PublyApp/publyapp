import { IconApi, IconGridDots, IconPlug } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/integrations',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'integrations' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsIntegrationsPage,
});

/**
 * Read-only org integrations: connected and available integrations plus API
 * access are all honest coming-later states — no integrations API exists, so
 * there are no fake catalog entries and no pretend-to-work connect switches.
 */
function TenantSettingsIntegrationsPage() {
	const { t } = useTranslation(['settings', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-settings-integrations-page">
			<WorkspacePageHeader titleKey="integrations" />

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
}
