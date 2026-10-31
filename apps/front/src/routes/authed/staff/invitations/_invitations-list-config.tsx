import { IconCircleDashed, IconShieldLock } from '@tabler/icons-react';
import type { ListFilter } from '~/components/list/list-types';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { buildCsv } from '~/utils/csv';
import { downloadFile, formatExportDateStamp } from '~/utils/download-file';
import { formatShortDate } from '~/utils/format-time';

import { invitationColumns } from './_invitations-list-columns';
import {
	getInvitationStatusLabelKey,
	type StaffInvitationRow,
} from './list-helpers';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DASH = '—';

export const DEFAULT_INVITATION_COLUMNS = [
	'email',
	'status',
	'profile',
	'invitedBy',
	'createdAt',
	'expiresAt',
	'acceptedAt',
] as const;

export const buildInvitationFilters = (
	t: Translate,
	rows: StaffInvitationRow[],
	selectedProfiles: readonly string[] = [],
): ListFilter<StaffInvitationRow>[] => {
	const profileNames: string[] = [];
	const seen = new Set<string>();
	for (const name of selectedProfiles) {
		if (name.length > 0 && !seen.has(name)) {
			seen.add(name);
			profileNames.push(name);
		}
	}
	for (const row of rows) {
		if (row.profileName.length > 0 && !seen.has(row.profileName)) {
			seen.add(row.profileName);
			profileNames.push(row.profileName);
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
			})),
			valueOf: (row) => row.status,
		},
		...(profileNames.length > 0
			? [
					{
						key: 'profile',
						label: t('profiles'),
						icon: IconShieldLock,
						panel: true,
						choices: profileNames.map((name) => ({
							value: name,
							label: name,
						})),
						valueOf: (row: StaffInvitationRow) => row.profileName,
					} satisfies ListFilter<StaffInvitationRow>,
				]
			: []),
	];
};

const countStatus = (
	rows: StaffInvitationRow[],
	status: StaffInvitationRow['status'],
): number => rows.filter((row) => row.status === status).length;

export const buildInvitationTotals =
	(t: Translate): ((rows: StaffInvitationRow[]) => Map<string, string>) =>
	(rows) => {
		const totals = new Map<string, string>();
		totals.set('email', t('list-total-invitations', { count: rows.length }));
		totals.set(
			'status',
			t('list-total-invitation-statuses', {
				pending: countStatus(rows, 'pending'),
				accepted: countStatus(rows, 'accepted'),
				expired: countStatus(rows, 'expired'),
				revoked: countStatus(rows, 'revoked'),
			}),
		);
		for (const id of [
			'profile',
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
		code: row.email,
		badges: (
			<StatusPill tone={statusPillTone(row.status)}>
				{t(getInvitationStatusLabelKey(row.status))}
			</StatusPill>
		),
		end: row.createdAt ? formatShortDate(row.createdAt, locale) : DASH,
		title: row.email,
		sub: row.profileName || t('unknown-profile'),
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
