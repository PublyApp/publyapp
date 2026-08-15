import { IconDevices, IconLock, IconShieldLock } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/security',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'security' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsSecurityPage,
});

/**
 * Read-only org security settings: the password-policy, two-factor and
 * active-session surfaces are all honest coming-later states — none of them
 * has an API yet, so there are no fake switches and no disabled buttons that
 * pretend to work.
 */
function TenantSettingsSecurityPage() {
	const { t } = useTranslation(['settings', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-settings-security-page">
			<WorkspacePageHeader titleKey="security" />

			<Card>
				<CardHeader>
					<CardTitle>{t('password-policy')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconLock}
						title={t('password-policy-coming-later-title')}
						description={t('password-policy-coming-later-description')}
						testId="tenant-settings-password-policy-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:two-factor-authentication')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconShieldLock}
						title={t('two-factor-coming-later-title')}
						description={t('two-factor-coming-later-description')}
						testId="tenant-settings-two-factor-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:active-sessions')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconDevices}
						title={t('active-sessions-coming-later-title')}
						description={t('active-sessions-coming-later-description')}
						testId="tenant-settings-active-sessions-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
