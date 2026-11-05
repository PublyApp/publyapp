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
import type { ReactNode } from 'react';
import type { ListColumn } from '~/components/list/list-types';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { formatNumericDay, getRelativeTimeParts } from '~/utils/format-time';

import {
	getInvitationStatusLabelKey,
	invitationStatusTone,
	type StaffInvitationRow,
} from './list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';
const Dash = () => <span className="text-muted-foreground">{DASH}</span>;

const when =
	(t: Translate, locale: string) =>
	(value: Date | null): ReactNode => {
		if (!value) {
			return <Dash />;
		}
		const relative = getRelativeTimeParts(value);
		return (
			<span className="tabular-nums">
				{formatNumericDay(value, locale)}{' '}
				{relative ? (
					<span className="text-xs text-muted-foreground">
						· {t(`common:${relative.key}`, { count: relative.count })}
					</span>
				) : null}
			</span>
		);
	};

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
		width: 330,
		value: (row) => row.email,
		cell: (row) =>
			row.email ? (
				<Link
					to="/staff/invitations/$invitationId"
					params={{ invitationId: row.id }}
					className="flex min-w-0 items-center gap-2 no-underline"
					title={row.email}
				>
					<PersonAvatar name={row.email} />
					<span className="publy-record-link min-w-0 truncate font-medium text-left">
						{row.email}
					</span>
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
			<StatusPill tone={invitationStatusTone(row.status)}>
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
		cell: (row) => when(t, locale)(row.createdAt),
	},
	{
		id: 'expiresAt',
		header: t('common:list-column-expires-at'),
		icon: IconClock,
		width: 170,
		value: (row) => row.expiresAt?.getTime() ?? null,
		cell: (row) =>
			row.status === 'pending' ? when(t, locale)(row.expiresAt) : <Dash />,
	},
	{
		id: 'acceptedAt',
		header: t('common:accepted-at'),
		icon: IconCircleCheck,
		width: 170,
		value: (row) => row.acceptedAt?.getTime() ?? null,
		cell: (row) => when(t, locale)(row.acceptedAt),
	},
];
