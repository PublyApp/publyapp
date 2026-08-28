import {
	IconCircleDot,
	IconClock,
	IconId,
	IconMail,
	IconRefresh,
	IconUser,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTableRowActions } from '~/components/table/row-actions';
import { paletteIndex } from '~/components/ui/avatar-initials';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { formatDateTime } from '~/lib/format-date-time';
import { toastLocalMutationResult } from '~/lib/mutation-toast';
import {
	invalidateStaffInvitations,
	useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation,
} from '~/lib/query/staff-invitations';

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
};

const InvitationRowActions = ({ row }: { row: InvitationRow }) => {
	const { t } = useTranslation(['staff-invitations', 'common']);
	const queryClient = useQueryClient();
	const [isConfirmOpen, setConfirmOpen] = useState(false);
	const resendMutation = useResendStaffInvitationMutation();
	const revokeMutation = useRevokeStaffInvitationMutation();
	const isActionPending = resendMutation.isPending || revokeMutation.isPending;
	const canManage = row.status === 'pending';

	const handleIneligibleAction = () => {
		toastLocalMutationResult.warning(
			t('only-pending-invitations-can-be-managed'),
		);
	};

	const handleResend = async () => {
		if (!canManage) {
			handleIneligibleAction();
			return;
		}

		try {
			await resendMutation.mutateAsync({ invitationId: row.id });
			await invalidateStaffInvitations(queryClient);
		} catch {
			// MutationCache owns ordinary mutation feedback.
		}
	};

	const handleRevoke = async () => {
		if (!canManage) {
			handleIneligibleAction();
			setConfirmOpen(false);
			return;
		}

		try {
			await revokeMutation.mutateAsync({ invitationId: row.id });
			await invalidateStaffInvitations(queryClient);
		} catch {
			// MutationCache owns ordinary mutation feedback.
		}
		// No try/finally: the React Compiler cannot lower finally clauses
		// yet and would skip this component.
		setConfirmOpen(false);
	};

	return (
		<>
			<DataTableRowActions
				ariaLabel={t('common:actions-for', {
					name: row.email || t('common:invitation'),
				})}
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
					onClick={() =>
						void (canManage ? setConfirmOpen(true) : handleRevoke())
					}
					disabled={isActionPending}
				>
					<IconX className="size-[15px]" />
					{t('common:revoke-invitation')}
				</DropdownMenuItem>
			</DataTableRowActions>
			<ConfirmDialog
				isOpen={isConfirmOpen}
				title={t('common:revoke-invitation')}
				description={t('invitation-removal-description')}
				confirmLabel={t('common:revoke')}
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
}: CreateInvitationColumnsArgs): ColumnDef<InvitationRow>[] => [
	{
		id: 'email',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconMail className="size-3.5 text-muted-foreground" />
				<span>{t('common:invitee')}</span>
			</div>
		),
		accessorKey: 'email',
		meta: { width: '300px' },
		cell: ({ row }) => {
			const email = row.original.email;
			// `email` is the invitation's required identity field, never a
			// genuinely-optional lookup — a blank value is a data-integrity
			// problem, not "no data yet", so it must never be silently rendered
			// as a neutral em-dash that looks like real data (r5-F5).
			if (!email) {
				return (
					<span
						className="flex min-w-0 items-center text-[13px] text-destructive"
						title={t('invitation-missing-email')}
					>
						{t('invitation-missing-email')}
					</span>
				);
			}

			return (
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.original.id }}
					className="flex min-w-0 items-center gap-2.5 no-underline"
				>
					<span
						aria-hidden="true"
						className="publy-avatar-initials inline-flex size-[26px] shrink-0 items-center justify-center rounded-[var(--publy-radius-small-control)]"
						data-palette={paletteIndex(email)}
					>
						<IconMail className="size-3.5" />
					</span>
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
		id: 'profile_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconId className="size-3.5 text-muted-foreground" />
				<span>{t('common:profiles')}</span>
			</div>
		),
		accessorKey: 'profileName',
		enableSorting: false,
		cell: ({ row }) => {
			// A missing profile lookup is a genuinely legitimate related-data
			// gap (the profile can be deleted after the invitation was sent) —
			// unlike `email`, this isn't a data-integrity error, so it gets a
			// semantic "unknown" label rather than a plain dash that would look
			// like the same kind of missing-data as the required-field case.
			const profileName = row.original.profileName || t('unknown-profile');
			return (
				<span
					className="block truncate text-[12px] text-[var(--publy-foreground-secondary)]"
					title={profileName}
				>
					{profileName}
				</span>
			);
		},
	},
	{
		id: 'invited_by_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUser className="size-3.5 text-muted-foreground" />
				<span>{t('common:invited-by')}</span>
			</div>
		),
		accessorKey: 'invitedByName',
		enableSorting: false,
		meta: { width: '150px' },
		cell: ({ row }) => {
			// Same reasoning as `profileName`: the inviting account can be
			// deleted after the invitation was sent, so a missing name here is
			// a legitimate related-data gap, not a data-integrity error.
			const invitedByName = row.original.invitedByName || t('unknown-inviter');
			return (
				<span
					className="block truncate text-[13px] text-[var(--publy-foreground-secondary)]"
					title={invitedByName}
				>
					{invitedByName}
				</span>
			);
		},
	},
	{
		id: 'expires_at',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconClock className="size-3.5 text-muted-foreground" />
				<span>{t('common:expires')}</span>
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
				<span>{t('common:status')}</span>
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
		header: () => <span className="sr-only">{t('common:actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => <InvitationRowActions row={row.original} />,
	},
];
