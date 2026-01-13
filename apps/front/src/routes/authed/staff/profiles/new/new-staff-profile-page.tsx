import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import StaffProfileSidebar from '../details/basics/parts/staff-profile-sidebar';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

const NewStaffProfilePage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<Box
				sx={{
					width: '100%',
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>
				<Grid container spacing={3}>
					<Grid size={{ md: 3 }} display={{ xs: 'none', md: 'block' }}>
						<StaffProfileSidebar />
					</Grid>

					<Grid size={{ xs: 12, md: 8 }}>
						<NewStaffProfileForm />
					</Grid>
				</Grid>
			</Box>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;
