import {
	_userAddressBook,
	_userInvoices,
	_userPayment,
	_userPlans,
} from '@/front/_mock';
import { AccountBilling } from '@/front/components/billing/account-billing';

const TenantDetailsBillingPage = () => {
	return (
		<AccountBilling
			plans={_userPlans}
			cards={_userPayment}
			invoices={_userInvoices}
			addressBook={_userAddressBook}
		/>
	);
};

export default TenantDetailsBillingPage;
