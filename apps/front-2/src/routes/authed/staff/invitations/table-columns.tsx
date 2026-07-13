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
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableRowActions } from '~/components/table/row-actions';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { formatDateTime } from '~/lib/format-date-time';
import {
	invalidateStaffInvitations,
	useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation,
} from '~/lib/query/staff-invitations';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	getInvitationStatusLabelKey,
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
	t: (key: string, options?: Record<string, unknown>) => string;
	locale: string;
	onActionSuccess: () => void;
	onActionError: (message: string) => void;
};

const InvitationRowActions = ({
	row,
	onSuccess,
	onError,
}: {
	row: InvitationRow;
	onSuccess: () => void;
	onError: (message: string) => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isConfirmOpen, setConfirmOpen] = useState(false);
	const resendMutation = useResendStaffInvitationMutation();
	const revokeMutation = useRevokeStaffInvitationMutation();
	const isActionPending = resendMutation.isPending || revokeMutation.isPending;

	const handleResend = async () => {
		try {
			await resendMutation.mutateAsync({ invitationId: row.id });
			onSuccess();
		} catch (error) {
			onError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('unable-to-resend-invitation'),
				}),
			);
		}
	};

	const handleRevoke = async () => {
		try {
			await revokeMutation.mutateAsync({ invitationId: row.id });
			await invalidateStaffInvitations(queryClient);
			setConfirmOpen(false);
			onSuccess();
		} catch (error) {
			setConfirmOpen(false);
			onError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('unable-to-revoke-invitation'),
				}),
			);
		}
	};

	return (
		<>
			<DataTableRowActions
				ariaLabel={t('actions-for', { name: row.email || t('invitation') })}
				testId={`staff-invitation-actions-${row.id}`}
			>
				<DropdownMenuItem
					onClick={() => void handleResend()}
					disabled={isActionPending}
				>
					<IconRefresh className="size-[15px]" />
					{t('send-reminder')}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => setConfirmOpen(true)}
					disabled={isActionPending}
				>
					<IconX className="size-[15px]" />
					{t('revoke-invitation')}
				</DropdownMenuItem>
			</DataTableRowActions>
			<ConfirmDialog
				isOpen={isConfirmOpen}
				title={t('revoke-invitation')}
				description={t('invitation-removal-description')}
				confirmLabel={t('revoke')}
				isPending={revokeMutation.isPending}
				onConfirm={() => void handleRevoke()}
				onOpenChange={setConfirmOpen}
			/>
		</>
	);
};

export const createInvitationColumns = ({
	t,
	locale,
	onActionSuccess,
	onActionError,
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
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.original.id }}
					className="flex min-w-0 items-center gap-2.5 no-underline"
				>
					<InitialsAvatar name={row.original.email} />
					<span
						className="publy-record-link min-w-0 truncate text-[13px]"
						title={email}
					>
						{email}
					</span>
				</Link>
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
				{t(getInvitationStatusLabelKey(row.original.status))}
			</StatusPill>
		),
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<InvitationRowActions
				row={row.original}
				onSuccess={onActionSuccess}
				onError={onActionError}
			/>
		),
	},
];
