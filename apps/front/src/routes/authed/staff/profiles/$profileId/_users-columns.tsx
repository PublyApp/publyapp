import {
	IconCircleDashed,
	IconMail,
	IconUserCircle,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ListColumn } from '~/components/list/list-types';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffProfileUserRow } from '~/lib/query/staff-profile-users';

import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { formatStaffStatusLabel } from '../../staff-users/status-labels';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const displayName = (row: StaffProfileUserRow, t: Translate): string =>
	getUserFullName({ firstName: row.firstName, lastName: row.lastName }) ||
	row.email ||
	t('no-email-address');

/** The inset list's three §4.6 columns. */
export const buildColumns = (
	t: Translate,
): ListColumn<StaffProfileUserRow>[] => [
	{
		id: 'name',
		header: t('list-column-member'),
		icon: IconUserCircle,
		width: 250,
		value: (row) => displayName(row, t),
		cell: (row) => (
			<Link
				to="/staff/staff-users/$userId"
				params={{ userId: row.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar name={displayName(row, t)} avatarUrl={row.avatarUrl} />
				<span className="publy-record-link min-w-0 truncate">
					{displayName(row, t)}
				</span>
			</Link>
		),
		sortable: false,
	},
	{
		id: 'email',
		header: t('list-column-email'),
		icon: IconMail,
		width: 270,
		value: (row) => row.email,
		cell: (row) =>
			row.email ? (
				<span
					className="block truncate text-muted-foreground"
					title={row.email}
				>
					{row.email}
				</span>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		id: 'status',
		header: t('status'),
		icon: IconCircleDashed,
		width: 170,
		value: (row) => row.status,
		cell: (row) => (
			<StatusPill tone={statusPillTone(row.status)}>
				{formatStaffStatusLabel(row.status, t)}
			</StatusPill>
		),
	},
];
