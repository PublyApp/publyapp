import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { AuthedRouteContentSkeleton } from './_route-content-skeleton';

const StaffIndexRedirect = () => {
	const navigate = useNavigate();

	useEffect(() => {
		void navigate({
			to: '/staff/staff-users',
			replace: true,
		});
	}, [navigate]);

	return <AuthedRouteContentSkeleton />;
};

export const Route = createFileRoute('/_authed-layout/staff')({
	// Client-side redirect-only stub (no `beforeLoad` short-circuit exists for
	// `/staff` itself — see `StaffIndexRedirect` above): it always bounces to
	// `/staff/staff-users` and never sits on screen, so it never supplies a
	// trail.
	staticData: { crumbs: 'shell' },
	component: StaffIndexRedirect,
});
