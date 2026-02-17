import _ from 'lodash';

import { SectionPageWithDrawer } from '@/front/components/settings/section-page-with-drawer';
import { useTranslate } from '@/front/hooks/use-translate';

import TenantUsersTable from './parts/tenant-users-table';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();

	return (
		<SectionPageWithDrawer
			subtitle={t('tenant-details')}
			title={t('users')}
			ctaLabel={_.capitalize(t('new-item', { item: t('user') }))}
			drawerWidth={720}
			drawerContent="ADD USER FORM HERE"
		>
			<TenantUsersTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsUsersPage;
