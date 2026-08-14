import { IconSettings } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader } from './_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/settings')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'settings' }],
	},
	component: TenantSettingsStubPage,
});

/**
 * Honest stub: the tenant settings surface (members, roles, billing,
 * integrations) ships in a later tranche — no fake CRUD against a
 * nonexistent backend.
 */
function TenantSettingsStubPage() {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-5" data-testid="tenant-settings-page">
			<WorkspacePageHeader titleKey="settings" />
			<StateSurface
				icon={IconSettings}
				title={t('settings')}
				description={t('stub-settings-description')}
				testId="tenant-settings-stub"
			/>
		</div>
	);
}
