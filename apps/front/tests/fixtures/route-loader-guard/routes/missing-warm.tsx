import { createFileRoute } from '@tanstack/react-router';

import { useFakeStaffUsersQuery } from '../lib/query/fake-staff-users';

// RED: the page reads a query no loader warms.
const MissingWarm = () => {
	useFakeStaffUsersQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/missing-warm')({
	component: MissingWarm,
});
