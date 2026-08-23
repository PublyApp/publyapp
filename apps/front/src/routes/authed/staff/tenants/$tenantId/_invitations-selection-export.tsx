import { useTranslation } from 'react-i18next';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import {
	type StaffTenantInvitationRow,
} from '~/lib/query/staff-tenant-invitations';
import { StaffListExportSelectedAction } from '~/routes/authed/staff/staff-list-export-selected';
import type { CsvExportColumn } from '~/routes/authed/staff/staff-list-export-selected';

import {
	normalizeInvitationStatus,
} from '../../invitations/list-helpers';
import {
	formatDateTime,
	formatTenantUserLevelLabel,
} from './_tenant-details-shell';
import { formatTenantInvitationStatusLabel } from './_invitation-columns';

type TenantInvitationsSelectionExportProps = {
	rows: StaffTenantInvitationRow[];
	selection: UseRowSelectionResult;
};

/** #838: meaningful selected-row action — client-side CSV of the selected
 * visible invitations (no tenant bulk endpoints exist; bulk revoke is
 * explicitly out of scope for this issue). Kept in its own route-local
 * file so the invitations route stays a single-component file. */
export const TenantInvitationsSelectionExport = ({
	rows,
	selection,
}: TenantInvitationsSelectionExportProps) => {
	const { i18n, t } = useTranslation('common');

	const columns: Array<CsvExportColumn<StaffTenantInvitationRow>> = [
		{ header: t('invitee'), getValue: (row) => row.email },
		{
			header: t('access'),
			getValue: (row) =>
				(row.profiles ?? [])[0]?.name ??
				row.profileName ??
				formatTenantUserLevelLabel(row.accountLevel, t),
		},
		{ header: t('invited-by'), getValue: (row) => row.invitedByName },
		{
			header: t('status'),
			getValue: (row) =>
				formatTenantInvitationStatusLabel(
					normalizeInvitationStatus(row.status),
					t,
				),
		},
		{
			header: t('created-at'),
			getValue: (row) => formatDateTime(row.createdAt, i18n.language),
		},
		{
			header: t('expires'),
			getValue: (row) => formatDateTime(row.expiresAt, i18n.language),
		},
	];

	return (
		<StaffListExportSelectedAction
			rows={rows}
			selection={selection}
			fileNamePrefix="staff-tenant-invitations"
			columns={columns}
		/>
	);
};
