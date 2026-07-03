import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed-layout/staff')({
	beforeLoad: ({ location }) => {
		const pathname = location.pathname ?? '';
		if (pathname === '/staff') {
			throw redirect({
				to: '/staff/staff-users',
			});
		}
	},
	component: StaffShellPlaceholder,
});

function StaffShellPlaceholder() {
	return null;
}
