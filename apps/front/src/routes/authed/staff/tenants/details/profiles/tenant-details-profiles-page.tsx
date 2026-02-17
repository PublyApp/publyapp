import _ from 'lodash';

import { SectionPageWithDrawer } from '@/front/components/settings/section-page-with-drawer';
import { useTranslate } from '@/front/hooks/use-translate';

import TenantProfilesTable from './parts/tenant-profiles-table';

const TenantDetailsProfilesPage = () => {
	const { t } = useTranslate();

	return (
		<SectionPageWithDrawer
			subtitle={t('tenant-details')}
			title={t('profiles')}
			ctaLabel={_.capitalize(t('new-item', { item: t('profile') }))}
			drawerContent="ADD PROFILE FORM HERE"
		>
			<TenantProfilesTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsProfilesPage;
