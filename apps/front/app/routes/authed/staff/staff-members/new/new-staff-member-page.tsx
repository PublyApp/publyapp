import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import type { TFunction } from 'i18next';
import _ from 'lodash';
import type { Route } from './+types/new-staff-member-page';
import i18next from 'i18next';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { data } from 'react-router';
import { UserNewEditForm } from '../components/user-new-edit-form';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('new-item', { item: _.toLower(t('staff-member')) }));
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.data, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: `${getPageTitle(t)} | Staff Dashboard - ${APP_NAME}`,
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: `${getPageTitle(t)} | Staff Dashboard - ${APP_NAME}`,
				},
			],
		});
	},
});

const NewStaffMemberPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-members')),
						href: FRONT_PATH_NAMES.staff.staffMembers.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<UserNewEditForm />
		</DashboardContent>
	);
};

export default NewStaffMemberPage;
