import _ from 'lodash';
import { useOutletContext } from 'react-router';

import { SectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';
import { InviteUserForm } from './parts/invite-user-form';
import TenantUsersTable from './parts/tenant-users-table';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<SectionPageWithDrawer
			title={tenantName || t('tenant-details')}
			links={[
				{
					name: _.capitalize(t('tenants')),
					href: FRONT_PATH_NAMES.staff.tenants.root,
				},
				{ name: _.capitalize(t('details')) },
			]}
			ctaLabel={_.capitalize(t('invite-user'))}
			drawerWidth={480}
			drawerContent={<InviteUserForm />}
		>
			<TenantUsersTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsUsersPage;
