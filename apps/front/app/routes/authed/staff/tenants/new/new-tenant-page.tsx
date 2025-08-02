import Button from '@mui/material/Button';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { useMainStore } from '@/front/lib/zustand/store';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import { TenantCreateForm } from '../components/tenant-create-form';
import type { Route } from './+types/new-tenant-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('tenant')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.data, 'meta', []);
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
	i18next.loadNamespaces(['zod']);
	const serverData = await serverLoader();
	return data(serverData);
};
clientLoader.hydrate = true as const;

const NewTenantPage = () => {
	const { t } = useTranslate();
	const { isSubmitting, submit } = useMainStore(
		(rootState) => rootState.tenantsSlice.createTenantForm,
	);

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
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
				action={
					<Button
						type="submit"
						variant="contained"
						loading={isSubmitting}
						onClick={submit}
					>
						{t('create-the-tenant')}
					</Button>
				}
			/>

			<TenantCreateForm />
		</DashboardContent>
	);
};

export default NewTenantPage;
