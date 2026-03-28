import _ from 'lodash';
import { useOutletContext } from 'react-router';

import { SectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';
import TenantProfilesTable from './parts/tenant-profiles-table';

const TenantDetailsProfilesPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<SectionPageWithDrawer
			subtitle={tenantName || t('tenant-details')}
			title={t('profiles')}
			ctaLabel={_.capitalize(t('new-item', { item: t('profile') }))}
			drawerContent="ADD PROFILE FORM HERE"
		>
			<TenantProfilesTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsProfilesPage;
