import { IconKey, IconShieldCheck } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

/**
 * Read-only org roles: the role list and the permission matrix are honest
 * coming-later states — no roles API exists, so there is no mock role table
 * and no disabled create-role button that pretends to work.
 */
const TenantSettingsRolesPage = () => {
	const { t } = useTranslation(['settings', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-settings-roles-page">
			<WorkspacePageHeader titleKey="roles-and-permissions" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:roles')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconShieldCheck}
						title={t('roles-coming-later-title')}
						description={t('roles-coming-later-description')}
						testId="tenant-settings-roles-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:permissions')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconKey}
						title={t('permissions-coming-later-title')}
						description={t('permissions-coming-later-description')}
						testId="tenant-settings-permissions-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/settings/roles')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'roles-and-permissions' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsRolesPage,
});
