import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import _ from 'lodash';

const NewStaffMemberPage = () => {
	const { t } = useTranslate();
	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={t('new-item', { item: _.toLower(t('staff-member')) })}
				links={[
					{
						name: _.capitalize(t('staff-members')),
						href: FRONT_PATH_NAMES.staff.staffMembers.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
		</DashboardContent>
	);
};

export default NewStaffMemberPage;
