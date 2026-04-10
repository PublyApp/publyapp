import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useOutletContext } from 'react-router';

import {
	_userAddressBook,
	_userInvoices,
	_userPayment,
	_userPlans,
} from '#app/_mock/index.ts';
import { AccountBilling } from '#app/components/billing/account-billing.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import _ from 'lodash';
import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';

const TenantDetailsBillingPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<>
			<CustomBreadcrumbs
				heading={tenantName || t('tenant-details')}
				links={[
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<Stack spacing={3}>
				<Alert severity="info">{t('billing-coming-soon')}</Alert>
				<AccountBilling
					plans={_userPlans}
					cards={_userPayment}
					invoices={_userInvoices}
					addressBook={_userAddressBook}
				/>
			</Stack>
		</>
	);
};

export default TenantDetailsBillingPage;
