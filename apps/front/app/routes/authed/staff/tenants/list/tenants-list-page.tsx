import _ from 'lodash';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import { useTranslate } from '@/front/hooks/use-translate';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { RouterLink } from '@/front/components/router-link';
import Button from '@mui/material/Button';
import { Iconify } from '@/front/components/iconify/iconify';
import TenantsTable from './parts/tenants-table';
import type { TFunction } from 'i18next';
import type { Route } from './+types/tenants-list-page';
import i18next from 'i18next';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { data } from 'react-router';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('list-of-items', { items: t('tenants') }));
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

const TenantsListPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					// { name: 'Dashboard', href: paths.dashboard.root },
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{_.capitalize(t('new-item', { item: t('tenant') }))}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<TenantsTable />
		</DashboardContent>
	);
};

export default TenantsListPage;
