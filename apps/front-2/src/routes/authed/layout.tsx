import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';

import { AuthedLayout } from '../../layouts/authed-layout';

export const Route = createFileRoute('/_authed-layout')({
	ssr: false,
	component: AuthedRouteLayout,
});

function AuthedRouteLayout() {
	const location = useLocation();

	return (
		<AuthedLayout pathname={location.pathname}>
			<Outlet />
		</AuthedLayout>
	);
}
