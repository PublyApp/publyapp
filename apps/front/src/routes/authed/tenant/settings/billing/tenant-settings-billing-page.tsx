import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data, useParams } from 'react-router';

import {
	_userAddressBook,
	_userInvoices,
	_userPayment,
	_userPlans,
} from '@/front/_mock';
import { AccountBilling } from '@/front/components/billing/account-billing';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/tenant-settings-billing-page';

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('billing'));
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: `${getPageTitle(t)} | ${_.capitalize(t('settings'))} - ${APP_NAME}`,
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: `${getPageTitle(t)} | ${_.capitalize(t('settings'))} - ${APP_NAME}`,
				},
			],
		});
	},
});

const TenantSettingsBillingPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams<{ tenantId: string }>();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('settings')),
						href: FRONT_PATH_NAMES.tenant(tenantId).settings.root,
					},
					{ name: _.capitalize(t('billing')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<AccountBilling
				plans={_userPlans}
				cards={_userPayment}
				invoices={_userInvoices}
				addressBook={_userAddressBook}
			/>
		</DashboardContent>
	);
};

export default TenantSettingsBillingPage;
