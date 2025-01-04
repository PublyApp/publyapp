import { Outlet } from 'react-router';

const AdminDashboardLayout = () => {
	return (
		<div>
			<h1>AdminDashboardLayout</h1>
			<Outlet />
		</div>
	);
};

export default AdminDashboardLayout;
