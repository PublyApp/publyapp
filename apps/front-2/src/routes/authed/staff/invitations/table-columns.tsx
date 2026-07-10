import {
	IconCircleDot,
	IconClock,
	IconId,
	IconIdBadge2,
	IconMail,
	IconRefresh,
	IconUser,
	IconX,
} from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation,
} from '~/lib/query/staff-invitations';

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
	onActionSuccess: () => void;
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

const InvitationRowActions = ({
	row,
	onSuccess,
}: {
	row: InvitationRow;
	onSuccess: () => void;
}) => {
	const { t } = useTranslation('common');
	const resendMutation = useResendStaffInvitationMutation();
	const revokeMutation = useRevokeStaffInvitationMutation();

	const handleResend = useCallback(() => {
		resendMutation.mutate(
			{ invitationId: row.id },
			{ onSuccess: () => onSuccess() },
		);
	}, [resendMutation, row.id, onSuccess]);

	const handleRevoke = useCallback(() => {
		revokeMutation.mutate(
			{ invitationId: row.id },
			{ onSuccess: () => onSuccess() },
		);
	}, [revokeMutation, row.id, onSuccess]);

	return (
		<DataTableRowActions
			ariaLabel={`Actions for ${row.email || 'invitation'}`}
			testId={`staff-invitation-actions-${row.id}`}
		>
			<DropdownMenuItem onClick={handleResend}>
				<IconRefresh className="size-[15px]" />
				{t('send-reminder')}
			</DropdownMenuItem>
			<DropdownMenuItem onClick={handleRevoke}>
				<IconX className="size-[15px]" />
				{t('revoke-invitation')}
			</DropdownMenuItem>
		</DataTableRowActions>
	);
};

export const createInvitationColumns = ({
	t,
	locale,
	onActionSuccess,
}: CreateInvitationColumnsArgs): ColumnDef<InvitationRow>[] => [
	{
		id: 'email',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconMail className="size-3.5 text-muted-foreground" />
				<span>{t('invitee')}</span>
			</div>
		),
		accessorKey: 'email',
		meta: { width: '300px' },
		cell: ({ row }) => {
			const email = row.original.email || '-';
			return (
				<div className="flex min-w-0 items-center gap-2.5">
					<InitialsAvatar name={row.original.email} />
					<span
						className="min-w-0 truncate text-[13px] font-medium"
						title={email}
					>
						{email}
					</span>
				</div>
			);
		},
	},
	{
		id: 'role',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconIdBadge2 className="size-3.5 text-muted-foreground" />
				<span>{t('role')}</span>
			</div>
		),
		enableSorting: false,
		meta: { width: '116px' },
		cell: () => (
			<span className="publy-detail-chip publy-detail-chip--outline">
				{/* TODO(contract): role not in InvitationListItem */}—
			</span>
		),
	},
	{
		id: 'profile_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconId className="size-3.5 text-muted-foreground" />
				<span>{t('profiles')}</span>
			</div>
		),
		accessorKey: 'profileName',
		enableSorting: false,
		cell: ({ row }) => {
			const profileName = row.original.profileName;
			return (
				<span
					className="block truncate text-[12px] text-[var(--publy-foreground-secondary)]"
					title={profileName || undefined}
				>
					{profileName || '-'}
				</span>
			);
		},
	},
	{
		id: 'invited_by_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUser className="size-3.5 text-muted-foreground" />
				<span>{t('invited-by')}</span>
			</div>
		),
		accessorKey: 'invitedByName',
		enableSorting: false,
		meta: { width: '150px' },
		cell: ({ row }) => {
			const invitedByName = row.original.invitedByName;
			return (
				<span
					className="block truncate text-[13px] text-[var(--publy-foreground-secondary)]"
					title={invitedByName || undefined}
				>
					{invitedByName || '-'}
				</span>
			);
		},
	},
	{
		id: 'expires_at',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconClock className="size-3.5 text-muted-foreground" />
				<span>{t('expires')}</span>
			</div>
		),
		accessorFn: (row) => row.expiresAt,
		meta: { width: '120px' },
		cell: ({ row }) => (
			<span className="text-[13px] text-[var(--publy-foreground-secondary)]">
				{formatDateTime(row.original.expiresAt, locale)}
			</span>
		),
	},
	{
		id: 'status',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconCircleDot className="size-3.5 text-muted-foreground" />
				<span>{t('status')}</span>
			</div>
		),
		enableSorting: false,
		meta: { width: '128px' },
		cell: ({ row }) => (
			<StatusPill tone={statusPillTone(row.original.status)}>
				{formatInvitationStatusLabel(row.original.status)}
			</StatusPill>
		),
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<InvitationRowActions row={row.original} onSuccess={onActionSuccess} />
		),
	},
];
