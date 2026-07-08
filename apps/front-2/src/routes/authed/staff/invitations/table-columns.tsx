import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import {
	formatInvitationStatusLabel,
	type InvitationDisplayStatus,
} from './list-helpers';

export type InvitationRow = {
	id: string;
	email: string;
	profileName: string;
	invitedByName: string;
	status: InvitationDisplayStatus;
	acceptedAt: Date | null;
	createdAt: Date | null;
	expiresAt: Date | null;
};

type CreateInvitationColumnsArgs = {
	t: (key: string) => string;
	locale: string;
};

const formatDateTime = (value: Date | null, locale: string): string => {
	if (!value) {
		return '-';
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(value);
};

export const createInvitationColumns = ({
	t,
	locale,
}: CreateInvitationColumnsArgs): ColumnDef<InvitationRow>[] => [
	{
		id: 'email',
		header: t('email'),
		accessorKey: 'email',
		cell: ({ row }) => (
			<div>
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.original.id }}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					{row.original.email || '-'}
				</Link>
				<div className="text-xs text-foreground-500">
					{t('staff-invited-by')}: {row.original.invitedByName}
				</div>
			</div>
		),
	},
	{
		id: 'profile_name',
		header: t('profiles'),
		accessorKey: 'profileName',
		// Staff invitations only supports created_at, expires_at, email, and accepted_at.
		enableSorting: false,
	},
	{
		id: 'status',
		header: t('status'),
		enableSorting: false,
		cell: ({ row }) => (
			<span className="inline-flex rounded-full bg-default-100 px-2 py-1 text-xs font-medium text-foreground">
				{formatInvitationStatusLabel(row.original.status)}
			</span>
		),
	},
	{
		id: 'expires_at',
		header: t('expiry-date'),
		accessorFn: (row) => row.expiresAt,
		cell: ({ row }) => formatDateTime(row.original.expiresAt, locale),
	},
	{
		id: 'accepted_at',
		header: t('accepted-at'),
		accessorFn: (row) => row.acceptedAt,
		cell: ({ row }) => formatDateTime(row.original.acceptedAt, locale),
	},
	{
		id: 'created_at',
		header: t('created-at'),
		accessorFn: (row) => row.createdAt,
		cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
	},
];
