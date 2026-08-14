import { IconBuilding } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

export const Route = createFileRoute('/_authed-layout/tenant/')({
	// The workspace root has no section of its own — every section lives
	// under a named child route — so the trail is just the scope root crumb
	// ("Workspace").
	staticData: { crumbs: () => [] },
	component: TenantWorkspaceHomeState,
});

/**
 * The workspace root (`/tenant`) only renders once the picker resolved a
 * workspace; this honest home state stands in for a page the root never had
 * in front (old-front's root doubled as the posts calendar, a later
 * tranche).
 */
function TenantWorkspaceHomeState() {
	const { t } = useTranslation('common');

	return (
		<StateSurface
			icon={IconBuilding}
			title={t('tenant-workspace-home-title')}
			description={t('tenant-workspace-home-description')}
			testId="tenant-workspace-home"
		/>
	);
}
