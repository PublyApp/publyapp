import { IconMail, IconUsers } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/settings/members')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
				{ kind: 'label', labelKey: 'members' },
			],
			i18nNamespaces: ['settings'],
		},
		component: TenantSettingsMembersPage,
	},
);

/**
 * Read-only org members: the team roster and pending invitations are honest
 * coming-later states — no members API exists, so there is no mock member
 * table and no disabled invite button that pretends to work.
 */
function TenantSettingsMembersPage() {
	const { t } = useTranslation(['settings', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-settings-members-page">
			<WorkspacePageHeader titleKey="members" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:team-members')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconUsers}
						title={t('team-members-coming-later-title')}
						description={t('team-members-coming-later-description')}
						testId="tenant-settings-team-members-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:pending-invitations')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconMail}
						title={t('pending-invitations-coming-later-title')}
						description={t('pending-invitations-coming-later-description')}
						testId="tenant-settings-pending-invitations-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
