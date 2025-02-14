import { redirect } from 'react-router';

import DashboardContainer from '@/front/components/ui/layout/DashboardContainer';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// * I don't se what to show on ana eventual dashboard home page, so for now, we redirect this to the tenants lis page
export const loader = () => {
	return redirect(FRONT_PATH_NAMES.staff.tenants.root);
};

const AdminDashboardPage = () => {
	return <DashboardContainer>AdminDashboardPage</DashboardContainer>;
};

export default AdminDashboardPage;
