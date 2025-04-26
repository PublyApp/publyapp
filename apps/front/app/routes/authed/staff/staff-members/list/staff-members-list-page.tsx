import _ from 'lodash';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import Button from '@mui/material/Button';
import StaffMembersTable from './parts/staff-members-table';
import type { Route } from './+types/staff-members-list-page';
import i18next, { type TFunction } from 'i18next';
import { getServerLoader } from '@/front/lib/react-router/server.data';
import { data } from 'react-router';
import { remixI18NextServer } from '@/front/lib/i18n/i18n.server';

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.data, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: `${_.capitalize(t('list-of-items', { items: t('staff-members') }))} | Staff Dashboard - ${APP_NAME}`,
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ locale }) => {
		const t = await remixI18NextServer.getFixedT(locale);

		return data({
			meta: [
				{
					title: `${_.capitalize(t('list-of-items', { items: t('staff-members') }))} | Staff Dashboard - ${APP_NAME}`,
				},
			],
		});
	},
});

const StaffMembersListPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={t('list-of-items', { items: _.toLower(t('staff-members')) })}
				links={[
					{
						name: _.capitalize(t('staff-members')),
						href: FRONT_PATH_NAMES.staff.staffMembers.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffMembers.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{t('new-item', { item: _.toLower(t('staff-member')) })}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<StaffMembersTable />
		</DashboardContent>
	);
};

export default StaffMembersListPage;
