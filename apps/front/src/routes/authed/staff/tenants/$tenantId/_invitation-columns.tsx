import {
	IconCircleDot,
	IconClock,
	IconId,
	IconMail,
	IconUser,
} from '@tabler/icons-react';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { DataTableRowActions } from '~/components/table/row-actions';
import { paletteIndex } from '~/components/ui/avatar-initials';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	isStaffTenantInvitationRevocable,
	type StaffTenantInvitationRow,
} from '~/lib/query/staff-tenant-invitations';

import {
	type InvitationDisplayStatus,
	normalizeInvitationStatus,
} from '../../invitations/list-helpers';
import {
	formatDateTime,
	formatTenantUserLevelLabel,
} from './_tenant-details-shell';

/**
 * Column definitions and label/expiry helpers for the staff tenant
 * invitations table (extracted from `invitations.tsx` to keep that route a
 * single-component file — see the `no-multi-component-file` React Doctor
 * rule).
 */

const VISIBLE_PROFILE_CHIP_COUNT = 2;
const EXPIRES_SOON_MS = 48 * 60 * 60 * 1000;

export type InvitationColumnArgs = {
	locale: string;
	t: (key: string, options?: Record<string, unknown>) => string;
	isRevokePending: boolean;
	onRevoke: (row: StaffTenantInvitationRow) => void;
};

/** `list-helpers.ts`'s own `formatInvitationStatusLabel` capitalizes the raw
 * token instead of translating it; its `getInvitationStatusLabelKey` points
 * at `invitation-status-*` keys that don't exist in the locale bundle. Both
 * are shared with the staff invitations list (owned by a different slice),
 * so this route resolves the label locally against the real `pending` /
 * `accepted` / `expired` / `revoked` / `status-unknown` keys instead. */
export const formatTenantInvitationStatusLabel = (
	status: InvitationDisplayStatus,
	t: (key: string) => string,
): string => (status === 'unknown' ? t('status-unknown') : t(status));

/** Honest "amber emphasis" for a near expiry — computed from the real
 * `expiresAt` value, never a fabricated "Expiring" status. */
export const isInvitationExpiringSoon = (
	expiresAt: Date | null,
	now: Date,
): boolean => {
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.valueOf())) {
		return false;
	}

	const diffMs = expiresAt.getTime() - now.getTime();
	return diffMs > 0 && diffMs < EXPIRES_SOON_MS;
};

export const createTenantInvitationColumns = ({
	locale,
	t,
	isRevokePending,
	onRevoke,
}: InvitationColumnArgs): ColumnDef<StaffTenantInvitationRow>[] => [
	{
		id: 'email',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconMail className="size-3.5 text-muted-foreground" />
				<span>{t('invitee')}</span>
			</div>
		),
		accessorKey: 'email',
		cell: ({ row }) => {
			const email = row.original.email;
			return (
				<div className="flex min-w-0 items-center gap-2.5">
					<span
						aria-hidden="true"
						className="publy-avatar-initials inline-flex size-[26px] shrink-0 items-center justify-center rounded-[var(--publy-radius-small-control)]"
						data-palette={paletteIndex(email)}
					>
						<IconMail className="size-3.5" />
					</span>
					<span className="min-w-0 truncate text-[13px]" title={email}>
						{email}
					</span>
				</div>
			);
		},
	},
	{
		id: 'profile_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconId className="size-3.5 text-muted-foreground" />
				<span>{t('access')}</span>
			</div>
		),
		accessorKey: 'profileName',
		enableSorting: false,
		meta: { width: '160px', hideBelow: 768 },
		cell: ({ row }) => {
			const profiles = row.original.profiles ?? [];
			if (profiles.length > 0) {
				const visibleProfiles = profiles.slice(0, VISIBLE_PROFILE_CHIP_COUNT);
				const overflowProfiles = profiles.slice(VISIBLE_PROFILE_CHIP_COUNT);

				return (
					<div className="flex min-w-0 items-center gap-1">
						{visibleProfiles.map((profile) => (
							<span
								key={profile.id}
								className="publy-detail-chip publy-detail-chip--outline max-w-24 truncate"
								title={profile.name}
							>
								{profile.name}
							</span>
						))}
						{overflowProfiles.length > 0 ? (
							<span
								className="publy-detail-chip publy-detail-chip--outline"
								title={overflowProfiles
									.map((profile) => profile.name)
									.join(', ')}
							>
								+{overflowProfiles.length}
							</span>
						) : null}
					</div>
				);
			}

			const profileName = row.original.profileName;
			const access = profileName?.trim().length
				? profileName
				: formatTenantUserLevelLabel(row.original.accountLevel, t);

			return (
				<span className="publy-detail-chip publy-detail-chip--outline">
					{access}
				</span>
			);
		},
	},
	{
		id: 'invited_by',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUser className="size-3.5 text-muted-foreground" />
				<span>{t('invited-by')}</span>
			</div>
		),
		accessorKey: 'invitedByName',
		enableSorting: false,
		meta: { width: '150px', hideBelow: 1024 },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-muted-foreground">
				{getValue<string>()}
			</span>
		),
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
		meta: { width: '150px', hideBelow: 768 },
		cell: ({ row }) => {
			const expiresAt = row.original.expiresAt;
			const isExpiringSoon = isInvitationExpiringSoon(expiresAt, new Date());
			return (
				<span
					className={
						isExpiringSoon
							? 'text-[13px] font-medium text-[var(--publy-warning)]'
							: 'text-[13px] text-muted-foreground'
					}
				>
					{formatDateTime(expiresAt, locale)}
				</span>
			);
		},
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
		cell: ({ row }) => {
			const status = normalizeInvitationStatus(row.original.status);
			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatTenantInvitationStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) =>
			isStaffTenantInvitationRevocable(row.original) ? (
				<DataTableRowActions
					ariaLabel={t('actions-for', {
						name: row.original.email || t('invitation'),
					})}
					testId={`staff-tenant-invitation-actions-${row.original.id}`}
				>
					<DropdownMenuItem
						variant="destructive"
						disabled={isRevokePending}
						onClick={() => onRevoke(row.original)}
					>
						{t('revoke')}
					</DropdownMenuItem>
				</DataTableRowActions>
			) : (
				<span className="flex justify-center text-muted-foreground">
					<span aria-hidden="true">—</span>
					<span className="sr-only">{t('no-actions-available')}</span>
				</span>
			),
	},
];
