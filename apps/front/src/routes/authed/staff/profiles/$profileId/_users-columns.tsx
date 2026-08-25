import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { toStaffProfileUserRows } from '~/lib/query/staff-profile-users';

import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { formatStaffStatusLabel } from '../../staff-users/status-labels';

/** Column definitions for the profile-members table. Lives outside the
 * route file so `users.tsx` exports only its route (react-doctor rung 2,
 * #1417); tests import it directly from here. */
export const buildColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<ReturnType<typeof toStaffProfileUserRows>[number]>[] => [
	{
		id: 'name',
		header: t('name'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/staff-users/$userId"
				params={{ userId: row.original.id }}
				className="publy-record-link"
			>
				<div className="space-y-1">
					<p className="font-medium text-foreground">
						{getUserFullName({
							firstName: row.original.firstName,
							lastName: row.original.lastName,
						}) ||
							row.original.email ||
							t('no-email-address')}
					</p>
					<p className="text-xs text-muted-foreground">
						{row.original.email || t('no-email-address')}
					</p>
				</div>
			</Link>
		),
	},
	{
		id: 'status',
		header: t('status'),
		accessorKey: 'status',
		meta: { width: '122px' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();

			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatStaffStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
];
