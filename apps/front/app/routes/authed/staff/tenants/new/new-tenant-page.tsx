import type { TFunction } from 'i18next';
import _ from 'lodash';
import type { Route } from './+types/new-tenant-page';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import i18next from 'i18next';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { remixI18NextServer } from '@/front/lib/i18n/i18n.server';
import { data } from 'react-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('new-item', { item: _.toLower(t('tenant')) }));
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
	loader: async ({ locale }) => {
		const t = await remixI18NextServer.getFixedT(locale);

		return data({
			meta: [
				{
					title: `${getPageTitle(t)} | Staff Dashboard - ${APP_NAME}`,
				},
			],
		});
	},
});

const NewTenantPage = () => {
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
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
		</DashboardContent>
	);
};

export default NewTenantPage;
