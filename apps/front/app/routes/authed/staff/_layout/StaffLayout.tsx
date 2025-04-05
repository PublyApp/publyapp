import { Outlet } from 'react-router';

import type { Route } from './+types/StaffLayout';

const StaffLayout = () => {
	return <Outlet />;
};

export default StaffLayout;

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	console.log('❌❌❌', error);
	return <h1>ErrorBoundary Error Boundary</h1>;
};
