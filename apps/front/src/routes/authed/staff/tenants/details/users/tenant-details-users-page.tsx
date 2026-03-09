import _ from 'lodash';

import { useBoolean } from 'minimal-shared/hooks';

import { SectionPageWithDrawer } from '@/front/components/settings/section-page-with-drawer';
import { useTranslate } from '@/front/hooks/use-translate';

import TenantUsersTable from './parts/tenant-users-table';
import { InviteUserForm } from './parts/invite-user-form';

const TenantDetailsUsersPage = () => {
	const { t } = useTranslate();
	const drawerOpen = useBoolean();

	return (
		<SectionPageWithDrawer
			subtitle={t('tenant-details')}
			title={t('users')}
			ctaLabel={_.capitalize(t('invite-user'))}
			open={drawerOpen.value}
			onOpen={drawerOpen.onTrue}
			onClose={drawerOpen.onFalse}
			drawerWidth={480}
			drawerContent={<InviteUserForm onClose={drawerOpen.onFalse} />}
		>
			<TenantUsersTable />
		</SectionPageWithDrawer>
	);
};

export default TenantDetailsUsersPage;
