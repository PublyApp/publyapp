import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useIsMobile } from '@/front/hooks/use-is-mobile';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';

import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm, {
	NewStaffProfileSidebar,
} from './parts/new-staff-profile-form';

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
	const isMobile = useIsMobile();

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
				{!isMobile && (
					<Grid size={{ md: 3 }}>
						<Box
							sx={(theme) => {
								return {
									position: 'sticky',
									top: `calc(var(--layout-header-desktop-height, ${theme.spacing(9)}) + ${theme.spacing(1)})`,
									zIndex: theme.zIndex.appBar - 1,
									alignSelf: 'flex-start',
								};
							}}
						>
							<NewStaffProfileSidebar />
						</Box>
					</Grid>
				)}
				<Grid size={{ xs: 12, md: 9 }}>
					<NewStaffProfileForm />
				</Grid>
			</Grid>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;
