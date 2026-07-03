import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed-layout/staff')({
	component: StaffShellPlaceholder,
});

function StaffShellPlaceholder() {
	return null;
}
