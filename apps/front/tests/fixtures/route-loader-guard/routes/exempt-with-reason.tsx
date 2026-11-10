import { createFileRoute } from '@tanstack/react-router';

import { useFakeStaffUsersQuery } from '../lib/query/fake-staff-users';

// GREEN: the page query is exempt, with a reason.
const ExemptWithReason = () => {
	// preload-exempt: fixture, secondary data nobody hovers for
	useFakeStaffUsersQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/exempt-with-reason')({
	component: ExemptWithReason,
});
