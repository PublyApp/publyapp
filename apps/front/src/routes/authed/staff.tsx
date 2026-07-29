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
	component: StaffIndexRedirect,
});
