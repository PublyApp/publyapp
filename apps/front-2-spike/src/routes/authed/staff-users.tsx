import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createServerClientFromCookie } from '~/lib/api-client';
import {
	staffUsersBrowserQuery,
	staffUsersServerQueryOptions,
} from '~/lib/query';
import { getCookieHeader } from '~/server/request-context';

import { isServer } from '@org/shared-ts/lib/constants';

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	loader: async ({ context }) => {
		if (!isServer) {
			return;
		}

		const cookieHeader = await getCookieHeader();
		const serverClient = createServerClientFromCookie(
			cookieHeader,
			undefined,
			'staff',
		);
		return context.queryClient.ensureQueryData(
			staffUsersServerQueryOptions({}, serverClient),
		);
	},
	component: StaffUsersPage,
});

function StaffUsersPage() {
	const { data } = useSuspenseQuery(staffUsersBrowserQuery());
	const users = data?.data ?? [];
	const preview = users.slice(0, 5);
	const emails = preview
		.map((item) => item.email)
		.filter((value): value is string => Boolean(value))
		.join(', ');

	return (
		<div className="p-4">
			{/* PLACEHOLDER — Task 2.6 replaces this with the HeroUI + TanStack Table. */}
			<div>Staff users: {data?.data?.length}</div>
			<div>First emails: {emails}</div>
		</div>
	);
}
