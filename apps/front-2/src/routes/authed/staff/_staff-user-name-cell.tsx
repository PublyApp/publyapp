import { Link } from '@tanstack/react-router';
import { PersonAvatar } from '~/components/ui/person-avatar';
import type { StaffUserRow } from '~/lib/query/staff-users';

export const StaffUserNameCell = ({ row }: { row: StaffUserRow }) => (
	<Link
		to="/staff/staff-users/$userId"
		params={{ userId: row.id }}
		className="flex min-w-0 items-center gap-2.5 no-underline"
	>
		<PersonAvatar name={row.displayName} avatarUrl={row.avatarUrl} />
		<span
			className="publy-record-link min-w-0 truncate"
			title={row.displayName}
		>
			{row.displayName}
		</span>
	</Link>
);
