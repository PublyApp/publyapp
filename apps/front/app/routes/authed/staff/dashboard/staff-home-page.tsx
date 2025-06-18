import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// * I don't see what to show on an eventual dashboard home page, so for now, we redirect this to the tenants list page
export const loader = () => {
	return redirect(FRONT_PATH_NAMES.staff.tenants.root);
};

const StaffHomePage = () => {
	return <h1>StaffHomePage</h1>;
};

export default StaffHomePage;
