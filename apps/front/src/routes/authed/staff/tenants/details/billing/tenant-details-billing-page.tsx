import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useOutletContext } from 'react-router';

import {
	_userAddressBook,
	_userInvoices,
	_userPayment,
	_userPlans,
} from '@/front/_mock';
import { AccountBilling } from '@/front/components/billing/account-billing';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

import type { TenantDetailsOutletContext } from '../_layout/tenant-details-layout';

const TenantDetailsBillingPage = () => {
	const { t } = useTranslate();
	const { tenantName } = useOutletContext<TenantDetailsOutletContext>();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={tenantName || t('tenant-details')}
				title={t('billing')}
			/>
			<Alert severity="info">{t('billing-coming-soon')}</Alert>
			<AccountBilling
				plans={_userPlans}
				cards={_userPayment}
				invoices={_userInvoices}
				addressBook={_userAddressBook}
			/>
		</Stack>
	);
};

export default TenantDetailsBillingPage;
