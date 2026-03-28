import _ from 'lodash';
import { useOutletContext } from 'react-router';

import { SectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';
import { InviteUserForm } from './parts/invite-user-form';
import TenantUsersTable from './parts/tenant-users-table';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<SectionPageWithDrawer
			subtitle={tenantName || t('tenant-details')}
			title={t('users')}
			ctaLabel={_.capitalize(t('invite-user'))}
			drawerWidth={480}
			drawerContent={<InviteUserForm />}
		>
			<TenantUsersTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsUsersPage;
