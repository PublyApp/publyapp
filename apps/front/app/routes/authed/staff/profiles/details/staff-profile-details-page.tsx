import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import _ from 'lodash';

const StaffProfileDetailsPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={_.capitalize(t('profile-details'))}
				links={[
					{
						name: _.capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
			/>
		</DashboardContent>
	);
};

export default StaffProfileDetailsPage;
