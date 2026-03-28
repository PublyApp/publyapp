import _ from 'lodash';
import { useOutletContext } from 'react-router';

import { SectionPageWithDrawer } from '@/front/components/settings/section-page-with-drawer';
import { useTranslate } from '@/front/hooks/use-translate';

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
