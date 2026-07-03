import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed-layout/staff')({
	beforeLoad: () => {
		throw redirect({
			to: '/staff/staff-users',
		});
	},
	component: StaffShellPlaceholder,
});

function StaffShellPlaceholder() {
	return null;
}
