import {
	IconCircleCheck,
	IconCircleDashed,
	IconClock,
	IconMail,
	IconSend,
	IconShieldLock,
	IconUserPlus,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ListColumn } from '~/components/list/list-types';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { formatDateTime } from '~/utils/format-time';

import {
	getInvitationStatusLabelKey,
	type StaffInvitationRow,
} from './list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

const when = (value: Date | null, locale: string) =>
	value ? (
		<span className="tabular-nums">{formatDateTime(value, locale)}</span>
	) : (
		<Dash />
	);

/** The seven invitation columns of §4.6; the action column is the list page's
 * `renderActions` slot, so it stays pinned and sortable-free. */
export const invitationColumns = (
	t: Translate,
	locale: string,
): ListColumn<StaffInvitationRow>[] => [
	{
		id: 'email',
		header: t('common:invitee'),
		icon: IconMail,
		width: 300,
		value: (row) => row.email,
		cell: (row) =>
			row.email ? (
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.id }}
					className="publy-record-link block min-w-0 truncate text-left"
					title={row.email}
				>
					{row.email}
				</Link>
			) : (
				<span className="flex min-w-0 items-center text-destructive">
					{t('staff-invitations:invitation-missing-email')}
				</span>
			),
	},
	{
		id: 'status',
		header: t('common:status'),
		icon: IconCircleDashed,
		width: 140,
		value: (row) => row.status,
		cell: (row) => (
			<StatusPill tone={statusPillTone(row.status)}>
				{t(getInvitationStatusLabelKey(row.status))}
			</StatusPill>
		),
	},
	{
		id: 'profile',
		header: t('common:profile'),
		icon: IconShieldLock,
		width: 200,
		cell: (row) =>
			row.profileName ? (
				<span className="inline-flex h-5 items-center rounded-[var(--publy-radius-chip)] border bg-background px-2 text-xs">
					{row.profileName}
				</span>
			) : (
				<span className="text-muted-foreground">{t('unknown-profile')}</span>
			),
		sortable: false,
	},
	{
		id: 'invitedBy',
		header: t('common:invited-by'),
		icon: IconUserPlus,
		width: 170,
		cell: (row) =>
			row.invitedByName || (
				<span className="text-muted-foreground">{t('unknown-inviter')}</span>
			),
		sortable: false,
	},
	{
		id: 'createdAt',
		header: t('common:list-column-sent-at'),
		icon: IconSend,
		width: 170,
		value: (row) => row.createdAt?.getTime() ?? null,
		cell: (row) => when(row.createdAt, locale),
	},
	{
		id: 'expiresAt',
		header: t('common:list-column-expires-at'),
		icon: IconClock,
		width: 170,
		value: (row) => row.expiresAt?.getTime() ?? null,
		cell: (row) => when(row.expiresAt, locale),
	},
	{
		id: 'acceptedAt',
		header: t('common:accepted-at'),
		icon: IconCircleCheck,
		width: 170,
		value: (row) => row.acceptedAt?.getTime() ?? null,
		cell: (row) => when(row.acceptedAt, locale),
	},
];
