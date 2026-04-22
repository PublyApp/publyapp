import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import capitalize from 'lodash/capitalize';
import { useOutletContext } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { AccountBilling } from '#app/components/billing/account-billing.tsx';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { View403 } from '#app/components/error/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import {
	billingDemoAddressBook,
	billingDemoCards,
	billingDemoInvoices,
	billingDemoPlans,
} from './billing-demo-data';
import { TENANT_DETAILS_BILLING_ENABLED } from '../_layout/tenant-details-feature-flags';
import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';

const TenantDetailsBillingPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	if (!TENANT_DETAILS_BILLING_ENABLED) {
		return <View403 withLayout={false} />;
	}

	return (
		<>
			<CustomBreadcrumbs
				heading={tenantName || t('tenant-details')}
				links={[
					{
						name: capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: capitalize(t('details')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<Stack spacing={3}>
				<Alert severity="info">{t('billing-coming-soon')}</Alert>
				<AccountBilling
					plans={billingDemoPlans}
					cards={billingDemoCards}
					invoices={billingDemoInvoices}
					addressBook={billingDemoAddressBook}
				/>
			</Stack>
		</>
	);
};

export default TenantDetailsBillingPage;
