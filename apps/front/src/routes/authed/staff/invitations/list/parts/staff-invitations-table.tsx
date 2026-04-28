import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { useCallback, useMemo, useState } from 'react';

import type { InvitationListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindStaffInvitations,
	useGetStaffInvitationLink,
	useResendStaffInvitation,
	useRevokeStaffInvitation,
} from '#app/lib/react-query/features/staff/staff-invitation.hooks.ts';
import { fDate, fIsAfter, fToNow } from '#app/utils/format-time.ts';

import { NewInvitationButton } from './new-invitation-button';

type StaffInvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

type StaffInvitationRowData = {
	id: string;
	email: string;
	profileName: string;
	status: StaffInvitationStatus;
	invitedByName: string;
	expiresAt: Date | null;
	acceptedAt: Date | null;
	createdAt: Date | null;
};

const getInvitationStatus = (
	invitation: InvitationListItem,
): StaffInvitationStatus => {
	const status = invitation.status ? _.snakeCase(invitation.status) : undefined;
	if (
		status === 'pending' ||
		status === 'accepted' ||
		status === 'expired' ||
		status === 'revoked'
	) {
		return status;
	}
	if (invitation.expiresAt && fIsAfter(new Date(), invitation.expiresAt)) {
		return 'expired';
	}
	return 'pending';
};

const StaffInvitationRowDataMapper = (
	invitation: InvitationListItem,
): StaffInvitationRowData => {
	return {
		id: invitation.id || '',
		email: invitation.email || '-',
		profileName: invitation.profileName || '',
		status: getInvitationStatus(invitation),
		invitedByName: invitation.invitedByName || '-',
		expiresAt: invitation.expiresAt || null,
		acceptedAt: invitation.acceptedAt || null,
		createdAt: invitation.createdAt || null,
	};
};

const columnHelper = createMRTColumnHelper<StaffInvitationRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffInvitationsTable = () => {
	const { t } = useTranslate();
	// Local status filter; reset cursor pagination when this changes.
	const [statusFilter, setStatusFilter] = useState<string>('');

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	const invitationsQuery = useFindStaffInvitations({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			status: statusFilter || undefined,
		},
	});

	// Hook that provides query-aware table options (empty/error fallback, loading state)
	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: invitationsQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('invitations'),
					ns: 'response-message',
				}),
			),
			renderAction: () => (
				<Box sx={{ mt: 2 }}>
					<NewInvitationButton />
				</Box>
			),
		},
		errorContent: {
			title: _.capitalize(
				t('error-loading-items', {
					item: t('invitations'),
					ns: 'response-message',
				}),
			),
		},
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(invitationsQuery.data?.nextCursor);
				handlePaginationChange(updater);
			},
			[
				handlePaginationChange,
				invitationsQuery.data?.nextCursor,
				setNextCursor,
			],
		);
	const hasNextPage = invitationsQuery.data?.nextCursor != null;

	const dataTable = useMemo(() => {
		return _.map(invitationsQuery.data?.data, StaffInvitationRowDataMapper);
	}, [invitationsQuery.data]);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('email', {
				header: t('email'),
				Cell: EmailCell,
				size: 260,
			}),
			columnHelper.accessor('profileName', {
				header: t('profiles'),
				Cell: ProfileCell,
				enableSorting: false,
				size: 200,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				enableSorting: false,
				size: 130,
			}),
			columnHelper.accessor('invitedByName', {
				header: t('staff-invited-by'),
				Cell: InvitedByCell,
				enableSorting: false,
				size: 200,
			}),
			columnHelper.accessor('expiresAt', {
				id: 'expires_at',
				header: t('expiry-date'),
				Cell: ExpiryDateCell,
				size: 170,
			}),
			columnHelper.accessor('acceptedAt', {
				id: 'accepted_at',
				header: t('accepted-at', { defaultValue: 'Accepted at' }),
				Cell: DateCell,
				size: 170,
			}),
			columnHelper.accessor('createdAt', {
				id: 'created_at',
				header: t('created-at'),
				Cell: DateCell,
				size: 170,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: InvitationActionsCell,
				size: 140,
			}),
		];
	}, [t]);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			...queryState,
			density: 'compact',
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		renderEmptyRowsFallback,
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: invitationsQuery.isPending,
		},
	});

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
				border: 'none',
			}}
		>
			<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
				<FormControl size="small" sx={{ minWidth: 200 }}>
					<InputLabel id="staff-invitations-status-filter-label">
						{t('status')}
					</InputLabel>
					<Select
						labelId="staff-invitations-status-filter-label"
						label={t('status')}
						value={statusFilter}
						onChange={(event) => {
							// Filters invalidate cursor history, so reset to the first page.
							resetCursorPagination?.();
							setStatusFilter(event.target.value);
						}}
						displayEmpty
						renderValue={(selected) => {
							if (!selected) {
								return t('all');
							}
							return t(selected as never);
						}}
					>
						<MenuItem value="">{t('all')}</MenuItem>
						<MenuItem value="pending">{t('pending')}</MenuItem>
						<MenuItem value="accepted">{t('accepted')}</MenuItem>
						<MenuItem value="expired">{t('expired')}</MenuItem>
						<MenuItem value="revoked">{t('revoked')}</MenuItem>
					</Select>
				</FormControl>
			</Box>

			<MaterialReactTable table={table} />
		</Box>
	);
};

export default StaffInvitationsTable;

const EmailCell: MRT_ColumnDef<StaffInvitationRowData, string>['Cell'] = (
	props,
) => {
	const email = props.cell.getValue();
	const id = props.row.original.id;

	return (
		<Box
			sx={{
				minWidth: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 0.25,
			}}
		>
			<Typography variant="body2" noWrap>
				{email || '-'}
			</Typography>
			<Link
				component={RouterLink}
				href={FRONT_PATH_NAMES.staff.invitations.details(id)}
				underline="hover"
				sx={{
					color: 'text.disabled',
					fontSize: '0.75rem',
					display: 'block',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{id}
			</Link>
		</Box>
	);
};

const ProfileCell: MRT_ColumnDef<StaffInvitationRowData, string>['Cell'] = (
	props,
) => {
	const profileName = props.cell.getValue();

	return (
		<Box sx={{ color: profileName ? 'text.primary' : 'text.disabled' }}>
			{profileName || '-'}
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<
	StaffInvitationRowData,
	StaffInvitationStatus
>['Cell'] = (props) => {
	const { t } = useTranslate();
	const status = props.cell.getValue();

	let label: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === 'pending') {
		label = t('pending');
		color = 'warning';
	} else if (status === 'accepted') {
		label = t('accepted');
		color = 'success';
	} else if (status === 'expired') {
		label = t('expired');
		color = 'error';
	} else if (status === 'revoked') {
		label = t('revoked');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{label}
		</Label>
	);
};

const InvitedByCell: MRT_ColumnDef<StaffInvitationRowData, string>['Cell'] = (
	props,
) => {
	const invitedByName = props.cell.getValue();

	return (
		<Typography variant="body2" sx={{ color: 'text.primary' }}>
			{invitedByName || '-'}
		</Typography>
	);
};

const DateCell: MRT_ColumnDef<StaffInvitationRowData, Date | null>['Cell'] = (
	props,
) => {
	const dateValue = props.cell.getValue();

	if (!dateValue) {
		return <Typography variant="body2">-</Typography>;
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography variant="body2">{fDate(dateValue)}</Typography>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{fToNow(dateValue)}
			</Typography>
		</Box>
	);
};

const ExpiryDateCell: MRT_ColumnDef<
	StaffInvitationRowData,
	Date | null
>['Cell'] = (props) => {
	const { t } = useTranslate();
	const expiresAt = props.cell.getValue();

	if (!expiresAt) {
		return <Typography variant="body2">-</Typography>;
	}

	const isExpired = fIsAfter(new Date(), expiresAt);

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column' }}>
			<Typography
				variant="body2"
				sx={{ color: isExpired ? 'error.main' : 'text.primary' }}
			>
				{fDate(expiresAt)}
			</Typography>
			<Typography
				variant="caption"
				sx={{ color: isExpired ? 'error.main' : 'text.secondary' }}
			>
				{isExpired ? t('expired') : fToNow(expiresAt)}
			</Typography>
		</Box>
	);
};

const InvitationActionsCell: MRT_ColumnDef<StaffInvitationRowData>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();

	const invitationId = props.row.original.id;
	const status = props.row.original.status;
	// Only pending invitations can be resent, revoked, or copied.
	const canManage = status === 'pending';

	const { mutateAsync: getInvitationLink, isPending: isGettingLink } =
		useGetStaffInvitationLink();
	const { mutateAsync: resendInvitation, isPending: isResending } =
		useResendStaffInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-resent'));
			},
		});
	const { mutateAsync: revokeInvitation, isPending: isRevoking } =
		useRevokeStaffInvitation({
			onSuccess: () => {
				toast.success(t('staff-invitation-revoked'));
				queryClient.invalidateQueries({
					queryKey: useFindStaffInvitations.getKey(),
				});
			},
		});

	const handleCopyLink = async () => {
		const result = await getInvitationLink({ invitationId });
		if (!result?.link) {
			logger.warn('Invitation link response missing', { invitationId });
			return;
		}
		await navigator.clipboard.writeText(result.link);
		toast.success(t('staff-invitation-link-copied'));
	};

	const handleResend = async () => {
		await resendInvitation({ invitationId });
	};

	const handleConfirmRevoke = async () => {
		await revokeInvitation({ invitationId });
		confirmDialog.onFalse();
	};

	const renderConfirmDialog = () => (
		<ConfirmDialog
			open={confirmDialog.value}
			onClose={confirmDialog.onFalse}
			title={t('revoke-invitation')}
			content={t('confirm-revoke-invitation')}
			action={
				<Button variant="contained" color="error" onClick={handleConfirmRevoke}>
					{t('staff-revoke')}
				</Button>
			}
		/>
	);

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				{canManage && (
					<Tooltip title={t('copy-link')} placement="top" arrow>
						<IconButton
							color="default"
							loading={isGettingLink}
							onClick={handleCopyLink}
							size="small"
						>
							<Iconify icon="solar:copy-bold-duotone" />
						</IconButton>
					</Tooltip>
				)}

				{canManage && (
					<Tooltip title={t('resend-invitation')} placement="top" arrow>
						<IconButton
							color="default"
							loading={isResending}
							onClick={handleResend}
							size="small"
						>
							<Iconify icon="solar:letter-bold" />
						</IconButton>
					</Tooltip>
				)}

				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color="default"
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.invitations.details(invitationId)}
						size="small"
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				{canManage && (
					<Tooltip title={t('revoke-invitation')} placement="top" arrow>
						<IconButton
							color="default"
							loading={isRevoking}
							onClick={confirmDialog.onTrue}
							sx={{ color: 'error.main' }}
							size="small"
						>
							<Iconify icon="solar:close-circle-bold" />
						</IconButton>
					</Tooltip>
				)}
			</Box>
			{renderConfirmDialog()}
		</>
	);
};
