import Stack from '@mui/material/Stack';

import {
	_userAddressBook,
	_userInvoices,
	_userPayment,
	_userPlans,
} from '@/front/_mock';
import { AccountBilling } from '@/front/components/billing/account-billing';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

const TenantDetailsBillingPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader subtitle={t('tenant-details')} title={t('billing')} />
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
