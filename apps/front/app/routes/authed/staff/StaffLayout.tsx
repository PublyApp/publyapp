import { Outlet } from 'react-router';

import type { Route } from './+types/StaffLayout';

const StaffLayout = () => {
	return <Outlet />;
};

export default StaffLayout;

// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions, react/function-component-definition
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	console.log('❌❌❌', error);
	return <h1>ErrorBoundary Error Boundary</h1>;
}
