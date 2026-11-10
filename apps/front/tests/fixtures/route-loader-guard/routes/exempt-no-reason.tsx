import { createFileRoute } from '@tanstack/react-router';

import { useFakeStaffUsersQuery } from '../lib/query/fake-staff-users';

// RED: the exemption has no reason.
const ExemptNoReason = () => {
	// preload-exempt:
	useFakeStaffUsersQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/exempt-no-reason')({
	component: ExemptNoReason,
});
