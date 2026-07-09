import {
	IconCalendar,
	IconCircleDot,
	IconClock,
	IconId,
	IconMail,
	IconMailCheck,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';

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
		meta: { headerIcon: <IconMail /> },
		cell: ({ row }) => (
			<div>
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.original.id }}
					className="publy-record-link"
				>
					{row.original.email || '-'}
				</Link>
				<div className="publy-record-subtext">
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
		meta: { headerIcon: <IconId /> },
	},
	{
		id: 'status',
		header: t('status'),
		enableSorting: false,
		meta: { headerIcon: <IconCircleDot />, cellClassName: 'w-32' },
		cell: ({ row }) => (
			<StatusPill tone={statusPillTone(row.original.status)}>
				{formatInvitationStatusLabel(row.original.status)}
			</StatusPill>
		),
	},
	{
		id: 'expires_at',
		header: t('expiry-date'),
		accessorFn: (row) => row.expiresAt,
		meta: { headerIcon: <IconClock /> },
		cell: ({ row }) => formatDateTime(row.original.expiresAt, locale),
	},
	{
		id: 'accepted_at',
		header: t('accepted-at'),
		accessorFn: (row) => row.acceptedAt,
		meta: { headerIcon: <IconMailCheck /> },
		cell: ({ row }) => formatDateTime(row.original.acceptedAt, locale),
	},
	{
		id: 'created_at',
		header: t('created-at'),
		accessorFn: (row) => row.createdAt,
		meta: { headerIcon: <IconCalendar /> },
		cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
	},
];
