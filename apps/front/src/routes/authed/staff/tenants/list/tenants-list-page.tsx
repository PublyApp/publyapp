import Button from '@mui/material/Button';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/tenants-list-page';
import TenantsTable from './parts/tenants-table';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('list-of-items', { items: t('tenants') }));
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
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
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
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
