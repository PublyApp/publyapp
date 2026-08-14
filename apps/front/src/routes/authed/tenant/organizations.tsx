import { IconBuilding } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader } from './_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/organizations')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'organizations' }],
	},
	component: TenantOrganizationsStubPage,
});

/**
 * Honest stub: the organizations management surface ships in a later
 * tranche — no fake CRUD against a nonexistent backend.
 */
function TenantOrganizationsStubPage() {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-5" data-testid="tenant-organizations-page">
			<WorkspacePageHeader titleKey="organizations" />
			<StateSurface
				icon={IconBuilding}
				title={t('organizations')}
				description={t('stub-organizations-description')}
				testId="tenant-organizations-stub"
			/>
		</div>
	);
}
