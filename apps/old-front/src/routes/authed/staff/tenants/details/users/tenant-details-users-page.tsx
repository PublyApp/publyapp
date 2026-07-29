import capitalize from 'lodash/capitalize';
import { useOutletContext } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { SectionPageWithDrawer } from '#app/components/settings/section-page-with-drawer.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';
import { InviteUserForm } from './_parts/invite-user-form';
import TenantUsersTable from './_parts/tenant-users-table';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<SectionPageWithDrawer
			title={tenantName || t('tenant-details')}
			links={[
				{
					name: capitalize(t('tenants')),
					href: FRONT_PATH_NAMES.staff.tenants.root,
				},
				{ name: capitalize(t('details')) },
			]}
			ctaLabel={capitalize(t('invite-user'))}
			drawerWidth={480}
			drawerContent={<InviteUserForm />}
		>
			<TenantUsersTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsUsersPage;
