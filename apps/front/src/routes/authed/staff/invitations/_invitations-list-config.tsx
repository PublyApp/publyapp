import {
	IconCircleCheck,
	IconCircleDashed,
	IconCircleX,
	IconClock,
	IconShieldLock,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ListFilter } from '~/components/list/list-types';
import { StatusPill } from '~/components/ui/product-page';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';
import { formatShortDate } from '~/utils/format-time';

import type { StaffInvitationListCounts } from '@org/client-ts/models/index';

import { invitationColumns } from './_invitations-list-columns';
import {
	getInvitationStatusLabelKey,
	invitationStatusTone,
	type StaffInvitationRow,
} from './list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';

const STATUS_ICON_TONE = {
	pending: { Icon: IconClock, tone: 'text-[var(--publy-chip-pending-text)]' },
	accepted: {
		Icon: IconCircleCheck,
		tone: 'text-[var(--publy-chip-active-text)]',
	},
	expired: { Icon: IconClock, tone: 'text-muted-foreground' },
	revoked: {
		Icon: IconCircleX,
		tone: 'text-[var(--publy-chip-suspended-text)]',
	},
} as const;

const invitationStatusIcon = (status: string): ReactNode => {
	const entry = STATUS_ICON_TONE[status as keyof typeof STATUS_ICON_TONE];
	if (!entry) {
		return null;
	}
	const Icon = entry.Icon;
	return <Icon className={`size-4 shrink-0 ${entry.tone}`} />;
};

export const DEFAULT_INVITATION_COLUMNS = [
	'email',
	'status',
	'role',
	'invitedBy',
	'createdAt',
	'expiresAt',
] as const;

export const buildInvitationFilters = (
	t: Translate,
	selectedRoles: readonly string[] = [],
	roleCounts: Record<string, number> | null = null,
): ListFilter<StaffInvitationRow>[] => {
	// Choices come from the API's whole-collection role counts, so a role absent
	// from the loaded page still appears; a role picked in the URL always stays.
	const roleNames: string[] = [];
	const seen = new Set<string>();
	for (const name of [...selectedRoles, ...Object.keys(roleCounts ?? {})]) {
		if (name.length > 0 && !seen.has(name)) {
			seen.add(name);
			roleNames.push(name);
		}
	}

	return [
		{
			key: 'status',
			label: t('list-statuses'),
			icon: IconCircleDashed,
			panel: true,
			choices: ['pending', 'accepted', 'expired', 'revoked'].map((status) => ({
				value: status,
				label: t(`list-invitation-status-${status}`),
				icon: invitationStatusIcon(status),
			})),
			valueOf: (row) => row.status,
		},
		...(roleNames.length > 0
			? [
					{
						key: 'role',
						label: t('roles'),
						icon: IconShieldLock,
						panel: true,
						choices: roleNames.map((name) => ({
							value: name,
							label: name,
							count: roleCounts?.[name] ?? null,
						})),
						valueOf: (row: StaffInvitationRow) => row.roleNames,
					} satisfies ListFilter<StaffInvitationRow>,
				]
			: []),
	];
};

export const buildInvitationTotals =
	(t: Translate, counts: StaffInvitationListCounts | null | undefined) =>
	(): Map<string, string> => {
		const totals = new Map<string, string>();
		totals.set(
			'email',
			t('list-total-invitations', { count: counts?.total ?? 0 }),
		);
		totals.set(
			'status',
			t('list-total-invitation-statuses', {
				pending: counts?.pending ?? 0,
				accepted: counts?.accepted ?? 0,
				expired: counts?.expired ?? 0,
				revoked: counts?.revoked ?? 0,
			}),
		);
		for (const id of [
			'role',
			'invitedBy',
			'createdAt',
			'expiresAt',
			'acceptedAt',
		]) {
			totals.set(id, '—');
		}
		return totals;
	};

export const buildInvitationMobileCard =
	(t: Translate, locale: string) => (row: StaffInvitationRow) => ({
		badges: (
			<StatusPill tone={invitationStatusTone(row.status)}>
				{t(getInvitationStatusLabelKey(row.status))}
			</StatusPill>
		),
		end: row.createdAt ? formatShortDate(row.createdAt, locale) : DASH,
		title: row.email,
		sub: row.roleName || t('unknown-role'),
		foot: [t('invited-by'), row.invitedByName || t('unknown-inviter')] as [
			string,
			string,
		],
	});

export const exportInvitationRows = (
	rows: StaffInvitationRow[],
	t: Translate,
	locale: string,
): void => {
	const columns = invitationColumns(t, locale);
	const csv = buildCsv([
		columns.map((column) => column.header),
		...rows.map((row) =>
			columns.map((column) => {
				const value = column.value?.(row) ?? '';
				return value === null ? '' : String(value);
			}),
		),
	]);
	downloadFile({
		data: csv,
		fileName: `staff-invitations-${formatExportDateStamp(new Date())}.csv`,
		mimeType: 'text/csv;charset=utf-8',
	});
};
