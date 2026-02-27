import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';

import type { Route } from './+types/new-staff-user-page';
import NewStaffUserForm from './components/new-staff-user-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-user')) }),
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

export const clientLoader = async ({
	serverLoader,
}: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces([I18N_NAMESPACES.ZOD]).catch((error) => {
		logger.error('Failed to load namespaces', error);
	});
	const serverData = await serverLoader();
	return data(serverData);
};
clientLoader.hydrate = true as const;

const NewStaffUserPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-users')),
						href: FRONT_PATH_NAMES.staff.staffUsers.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<NewStaffUserForm />
		</DashboardContent>
	);
};

export default NewStaffUserPage;
