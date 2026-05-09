import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import isEqual from 'lodash/isEqual';
import map from 'lodash/map';
import snakeCase from 'lodash/snakeCase';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { parseAsString, useQueryStates } from 'nuqs';
import {
	type MouseEvent,
	type SyntheticEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import type { InvitationListItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import type { LabelColor } from '#app/components/label/types.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTableRowSelection } from '#app/hooks/table/use-table-row-selection.ts';
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
import {
	parseStatusFilter,
	STAFF_INVITATION_STATUS_VALUES,
	type StaffInvitationStatus,
	type StaffInvitationStatusOption,
} from './staff-invitation-status';
import { StaffInvitationsBulkRevokeDialog } from './staff-invitations-bulk-revoke-dialog';
import { StaffInvitationsExportAction } from './staff-invitations-export-action';
import StaffInvitationsExportDialogController, {
	type StaffInvitationsExportDialogControllerRef,
} from './staff-invitations-export-dialog-controller';
import { StaffInvitationsSelectionActions } from './staff-invitations-selection-actions';
import { StaffInvitationsToolbarFilters } from './staff-invitations-toolbar-filters';
import { useStaffInvitationBulkRevoke } from './use-staff-invitation-bulk-revoke';

export type StaffInvitationRowData = {
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
	const status = invitation.status ? snakeCase(invitation.status) : undefined;
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

const useStaffInvitationColumns = () => {
	const { t } = useTranslate();

	return useMemo(() => {
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
				header: t('accepted-at'),
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
};

const createHeadCellProps = (
	isSelectionMode: boolean,
	sortingDisabledReason: string,
): MRT_TableOptions<StaffInvitationRowData>['muiTableHeadCellProps'] => {
	return ({ column }) => {
		if (!column.getCanSort()) {
			return {};
		}

		if (!isSelectionMode) {
			return {
				title: undefined,
			};
		}

		return {
			title: sortingDisabledReason,
			sx: {
				'& .MuiTableSortLabel-root': {
					cursor: 'not-allowed',
					pointerEvents: 'none',
					opacity: 0.56,
				},
				'& .MuiTableSortLabel-icon': {
					opacity: '1 !important',
				},
			},
		};
	};
};

const StaffInvitationsTable = () => {
	const { t } = useTranslate();
	const exportDialogRef =
		useRef<StaffInvitationsExportDialogControllerRef>(null);
	const [filterStates, setFilterStates] = useQueryStates({
		status: parseAsString.withDefault(''),
	});
	// Mirror the URL-backed filter so onChange handlers can write through optimistically
	// without waiting for the next render.
	const [statusFilter, setStatusFilter] = useState<StaffInvitationStatus[]>(
		() => parseStatusFilter(filterStates.status),
	);
	const [selectionActionAnchorEl, setSelectionActionAnchorEl] =
		useState<null | HTMLElement>(null);
	const [bulkRevokeDialogOpen, setBulkRevokeDialogOpen] = useState(false);

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

	const normalizedStatusFilter = useMemo(
		() => parseStatusFilter(filterStates.status).join(','),
		[filterStates.status],
	);

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);
		if (!isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
			resetCursorPagination?.();
		}
	}, [filterStates.status, statusFilter, resetCursorPagination]);

	// Rewrite the URL when the raw value contains unknown/malformed tokens so
	// the API query, the UI checkbox state, and the URL all agree. Triggered
	// only on mismatch, so user-driven updates via handleStatusChange (which
	// already writes a normalized list) do not loop back through this effect.
	useEffect(() => {
		if (filterStates.status !== normalizedStatusFilter) {
			void setFilterStates({ status: normalizedStatusFilter });
		}
	}, [filterStates.status, normalizedStatusFilter, setFilterStates]);

	const invitationsQuery = useFindStaffInvitations({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			status: normalizedStatusFilter || undefined,
		},
	});

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: invitationsQuery,
		emptyContent: {
			title: capitalize(
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
			title: capitalize(
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
		return map(invitationsQuery.data?.data, StaffInvitationRowDataMapper);
	}, [invitationsQuery.data]);

	const {
		rowSelection,
		setRowSelection,
		selectedRows,
		selectedCount,
		isSelectionMode,
		clearSelection,
	} = useTableRowSelection({
		rows: dataTable,
	});

	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
	const isSelectionActionMenuOpen = Boolean(selectionActionAnchorEl);

	const sortTooltipLocalization = useMemo<Partial<MRT_Localization>>(() => {
		if (!isSelectionMode) {
			return {};
		}

		return {
			sortByColumnAsc: sortingDisabledReason,
			sortByColumnDesc: sortingDisabledReason,
			sortedByColumnAsc: sortingDisabledReason,
			sortedByColumnDesc: sortingDisabledReason,
		};
	}, [isSelectionMode, sortingDisabledReason]);

	const closeSelectionActionMenu = () => {
		setSelectionActionAnchorEl(null);
	};

	const openExportDialog = () => {
		closeSelectionActionMenu();
		exportDialogRef.current?.open();
	};

	const eligibleBulkRevokeRows = useMemo(() => {
		return selectedRows.filter((row) => row.status === 'pending');
	}, [selectedRows]);
	const eligibleBulkRevokeCount = eligibleBulkRevokeRows.length;
	const ineligibleBulkRevokeCount = selectedCount - eligibleBulkRevokeCount;

	const closeBulkRevokeDialog = () => setBulkRevokeDialogOpen(false);
	const { handleBulkRevoke, isBulkRevoking } = useStaffInvitationBulkRevoke({
		eligibleRows: eligibleBulkRevokeRows,
		clearSelection,
		setRowSelection,
		closeDialog: closeBulkRevokeDialog,
	});

	const columns = useStaffInvitationColumns();

	const statusOptions = useMemo<StaffInvitationStatusOption[]>(() => {
		return STAFF_INVITATION_STATUS_VALUES.map((value) => ({
			label: t(value),
			value,
		}));
	}, [t]);
	const selectedStatusOptions = useMemo(() => {
		return statusOptions.filter((option) =>
			statusFilter.includes(option.value),
		);
	}, [statusOptions, statusFilter]);

	const handleStatusChange = (
		_event: SyntheticEvent,
		selectedOptions: StaffInvitationStatusOption[],
	) => {
		const nextStatusFilter = selectedOptions.map((option) => option.value);
		// Filters invalidate cursor history, so reset to the first page.
		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		void setFilterStates({ status: nextStatusFilter.join(',') });
	};

	const renderToolbarFilters = () => {
		return (
			<StaffInvitationsToolbarFilters
				isSelectionMode={isSelectionMode}
				selectionModeDisabledReason={selectionModeDisabledReason}
				statusOptions={statusOptions}
				selectedStatusOptions={selectedStatusOptions}
				statusFilterLength={statusFilter.length}
				onStatusChange={handleStatusChange}
			/>
		);
	};

	const renderExportActions = () => {
		return <StaffInvitationsExportAction onClick={openExportDialog} />;
	};

	const renderSelectionActions = () => {
		return (
			<StaffInvitationsSelectionActions
				anchorEl={selectionActionAnchorEl}
				eligibleBulkRevokeCount={eligibleBulkRevokeCount}
				selectedCount={selectedCount}
				isOpen={isSelectionActionMenuOpen}
				onOpenMenu={(event: MouseEvent<HTMLButtonElement>) => {
					setSelectionActionAnchorEl(event.currentTarget);
				}}
				onCloseMenu={closeSelectionActionMenu}
				onOpenExportDialog={openExportDialog}
				onOpenBulkRevokeDialog={() => {
					closeSelectionActionMenu();
					setBulkRevokeDialogOpen(true);
				}}
			/>
		);
	};
	const muiTableHeadCellProps = useMemo(
		() => createHeadCellProps(isSelectionMode, sortingDisabledReason),
		[isSelectionMode, sortingDisabledReason],
	);

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		enableRowSelection: true,
		getRowId: (row) => row.id,
		manualSorting: true,
		localization: sortTooltipLocalization,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				if (typeof updater === 'function') {
					return updater(prev);
				}

				return updater;
			});
		},
		onSortingChange: (updater) => {
			if (isSelectionMode) {
				return;
			}

			handleSortingChange(updater);
		},
		state: {
			...tableState,
			...queryState,
			density: 'compact',
			rowSelection,
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
			disablePaginationControls: isSelectionMode,
			renderToolbarFilters,
			renderSelectionActions,
			renderExportActions,
		},
		muiTableHeadCellProps,
	});

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<MaterialReactTable table={table} />

			<StaffInvitationsExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={dataTable}
				selectedRows={selectedRows}
			/>

			<StaffInvitationsBulkRevokeDialog
				open={bulkRevokeDialogOpen}
				onClose={closeBulkRevokeDialog}
				eligibleCount={eligibleBulkRevokeCount}
				ineligibleCount={ineligibleBulkRevokeCount}
				isPending={isBulkRevoking}
				onConfirm={handleBulkRevoke}
			/>
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
			<Link
				component={RouterLink}
				href={FRONT_PATH_NAMES.staff.invitations.details(id)}
				color="inherit"
			>
				{email || '-'}
			</Link>
			<Typography
				variant="caption"
				sx={{
					color: 'text.disabled',
					display: 'block',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{id}
			</Typography>
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
	const invitation = props.row.original;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<CopyInvitationLinkAction invitation={invitation} />
			<ResendInvitationAction invitation={invitation} />
			<RevokeInvitationAction invitation={invitation} />
		</Box>
	);
};

type InvitationRowActionProps = {
	invitation: StaffInvitationRowData;
};

const CopyInvitationLinkAction = ({ invitation }: InvitationRowActionProps) => {
	const { t } = useTranslate();
	const canManage = invitation.status === 'pending';
	const disabledReason = t('only-pending-invitations-can-be-copied');

	const { mutateAsync, isPending } = useGetStaffInvitationLink();

	const handleCopy = async () => {
		const result = await mutateAsync({ invitationId: invitation.id });
		if (!result?.link) {
			logger.warn('Invitation link response missing', {
				invitationId: invitation.id,
			});
			return;
		}
		await navigator.clipboard.writeText(result.link);
		toast.success(t('staff-invitation-link-copied'));
	};

	return (
		<Tooltip
			title={canManage ? t('copy-link') : disabledReason}
			placement="top"
			arrow
		>
			<Box component="span">
				<IconButton
					color="default"
					aria-label={canManage ? t('copy-link') : disabledReason}
					loading={isPending}
					onClick={handleCopy}
					disabled={!canManage}
					size="small"
					sx={(theme) => ({
						color: canManage
							? theme.vars.palette.text.secondary
							: theme.vars.palette.text.disabled,
					})}
				>
					<Iconify icon="solar:copy-bold-duotone" />
				</IconButton>
			</Box>
		</Tooltip>
	);
};

const ResendInvitationAction = ({ invitation }: InvitationRowActionProps) => {
	const { t } = useTranslate();
	const canManage = invitation.status === 'pending';
	const disabledReason = t('only-pending-invitations-can-be-resent');

	const { mutateAsync, isPending } = useResendStaffInvitation({
		onSuccess: () => {
			toast.success(t('staff-invitation-resent'));
		},
	});

	const handleResend = async () => {
		await mutateAsync({ invitationId: invitation.id });
	};

	return (
		<Tooltip
			title={canManage ? t('resend-invitation') : disabledReason}
			placement="top"
			arrow
		>
			<Box component="span">
				<IconButton
					color="default"
					aria-label={canManage ? t('resend-invitation') : disabledReason}
					loading={isPending}
					onClick={handleResend}
					disabled={!canManage}
					size="small"
					sx={(theme) => ({
						color: canManage
							? theme.vars.palette.text.secondary
							: theme.vars.palette.text.disabled,
					})}
				>
					<Iconify icon="solar:plain-bold" />
				</IconButton>
			</Box>
		</Tooltip>
	);
};

const RevokeInvitationAction = ({ invitation }: InvitationRowActionProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();
	const canManage = invitation.status === 'pending';
	const disabledReason = t('only-pending-invitations-can-be-revoked');

	const { mutateAsync, isPending } = useRevokeStaffInvitation({
		onSuccess: () => {
			toast.success(t('staff-invitation-revoked'));
			void queryClient.invalidateQueries({
				queryKey: useFindStaffInvitations.getKey(),
			});
		},
	});

	const handleConfirmRevoke = async () => {
		await mutateAsync({ invitationId: invitation.id });
		confirmDialog.onFalse();
	};

	return (
		<>
			<Tooltip
				title={canManage ? t('revoke-invitation') : disabledReason}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						aria-label={canManage ? t('revoke-invitation') : disabledReason}
						loading={isPending}
						onClick={confirmDialog.onTrue}
						disabled={!canManage}
						size="small"
						sx={(theme) => ({
							color: canManage
								? theme.vars.palette.text.secondary
								: theme.vars.palette.text.disabled,
						})}
					>
						<Iconify icon="solar:close-circle-bold" />
					</IconButton>
				</Box>
			</Tooltip>
			<ConfirmDialog
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('revoke-invitation')}
				content={t('confirm-revoke-invitation')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmRevoke}
						disabled={isPending}
					>
						{t('staff-revoke')}
					</Button>
				}
			/>
		</>
	);
};
