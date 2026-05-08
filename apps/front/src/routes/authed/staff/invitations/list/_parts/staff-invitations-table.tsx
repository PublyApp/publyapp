import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
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
import { varAlpha } from 'minimal-shared/utils';
import { parseAsString, useQueryStates } from 'nuqs';
import {
	useCallback,
	useEffect,
	useId,
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
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { SelectionLockedControl } from '#app/lib/mrt-table/components/selection-locked-control.tsx';
import {
	useFindStaffInvitations,
	useGetStaffInvitationLink,
	useResendStaffInvitation,
	useRevokeStaffInvitation,
} from '#app/lib/react-query/features/staff/staff-invitation.hooks.ts';
import { fDate, fIsAfter, fToNow } from '#app/utils/format-time.ts';

import { NewInvitationButton } from './new-invitation-button';
import StaffInvitationsExportDialogController, {
	type StaffInvitationsExportDialogControllerRef,
} from './staff-invitations-export-dialog-controller';

type StaffInvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

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

const SELECTION_MODE_MENU_MIN_WIDTH = 240;

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

const STATUS_OPTIONS: { label: string; value: StaffInvitationStatus }[] = [
	{ label: 'Pending', value: 'pending' },
	{ label: 'Accepted', value: 'accepted' },
	{ label: 'Expired', value: 'expired' },
	{ label: 'Revoked', value: 'revoked' },
];

const parseStatusFilter = (value: string): StaffInvitationStatus[] => {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((part) => part.trim())
		.filter((part): part is StaffInvitationStatus =>
			STATUS_OPTIONS.some((option) => option.value === part),
		);
};

const StaffInvitationsTable = () => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const statusTooltipId = useId();
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

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);
		if (!isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
		}
	}, [filterStates.status, statusFilter]);

	const invitationsQuery = useFindStaffInvitations({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			status: filterStates.status || undefined,
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

	const { mutateAsync: revokeInvitationAsync, isPending: isBulkRevoking } =
		useRevokeStaffInvitation({
			meta: { skipGlobalErrorHandler: true },
		});

	const eligibleBulkRevokeRows = useMemo(() => {
		return selectedRows.filter((row) => row.status === 'pending');
	}, [selectedRows]);
	const eligibleBulkRevokeCount = eligibleBulkRevokeRows.length;
	const ineligibleBulkRevokeCount = selectedCount - eligibleBulkRevokeCount;

	const handleBulkRevoke = async () => {
		let succeeded = 0;
		let failed = 0;
		let firstFailureMessage: string | undefined;
		const failedIds: string[] = [];

		for (const invitation of eligibleBulkRevokeRows) {
			try {
				await revokeInvitationAsync({ invitationId: invitation.id });
				succeeded += 1;
			} catch (error) {
				failed += 1;
				failedIds.push(invitation.id);
				const failure = toApiFailure(error);
				if (firstFailureMessage == null) {
					firstFailureMessage = getFailureMessage(failure);
				}
			}
		}

		setBulkRevokeDialogOpen(false);
		await queryClient.invalidateQueries({
			queryKey: useFindStaffInvitations.getKey(),
		});

		if (failed === 0) {
			clearSelection();
		} else {
			// Reconcile selection so retried bulk revoke only acts on the still-failed rows.
			setRowSelection((prev) => {
				const next: typeof prev = {};
				for (const id of failedIds) {
					if (prev[id]) {
						next[id] = true;
					}
				}
				return next;
			});
		}

		if (succeeded === 0 && failed > 0) {
			toast.error(
				firstFailureMessage ||
					t('invitation-bulk-revoke-failure', {
						defaultValue: 'Failed to revoke selected invitations.',
					}),
			);
			return;
		}

		if (failed > 0) {
			toast.warning(
				t('invitation-bulk-revoke-partial-success', {
					succeeded,
					failed,
					defaultValue:
						'Revoked {{succeeded}} invitation(s), {{failed}} failed.',
				}),
			);
			return;
		}

		toast.success(
			t('invitation-bulk-revoke-success', {
				count: succeeded,
				defaultValue: 'Successfully revoked {{count}} invitation(s).',
			}),
		);
	};

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

	const handleStatusChange = (
		_event: React.SyntheticEvent,
		selectedOptions: typeof STATUS_OPTIONS,
	) => {
		const nextStatusFilter = selectedOptions.map((option) => option.value);
		// Filters invalidate cursor history, so reset to the first page.
		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		void setFilterStates({ status: nextStatusFilter.join(',') });
	};

	const renderToolbarFilters = () => {
		return (
			<SelectionLockedControl
				isSelectionMode={isSelectionMode}
				disabledReason={selectionModeDisabledReason}
				describeChild
				tooltipId={statusTooltipId}
			>
				<Box component="span">
					<Autocomplete
						multiple
						disableCloseOnSelect
						size="small"
						options={STATUS_OPTIONS}
						value={STATUS_OPTIONS.filter((option) =>
							statusFilter.includes(option.value),
						)}
						onChange={handleStatusChange}
						disabled={isSelectionMode}
						isOptionEqualToValue={(option, value) =>
							option.value === value.value
						}
						getOptionLabel={(option) => option.label}
						renderInput={(params) => (
							<TextField
								{...params}
								placeholder={
									statusFilter.length === 0 ? t('all-statuses') : undefined
								}
								slotProps={{
									input: {
										...params.InputProps,
										startAdornment: (
											<>
												<Box
													component="span"
													sx={{
														color: 'text.secondary',
														typography: 'body2',
														whiteSpace: 'nowrap',
														mr: 1,
														display: 'inline-flex',
														alignItems: 'center',
														alignSelf: 'center',
														minHeight: 24,
													}}
												>
													{t('status')}:
												</Box>
												{params.InputProps.startAdornment}
											</>
										),
									},
								}}
							/>
						)}
						renderOption={(props, option, { selected }) => {
							const { key, ...optionProps } = props;

							return (
								<Box
									component="li"
									key={key}
									{...optionProps}
									sx={(theme) => ({
										'&.Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.grey['500Channel'],
												0.08,
											),
										},
										'&[aria-selected="true"]': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.08,
											),
										},
										'&[aria-selected="true"].Mui-focused': {
											backgroundColor: varAlpha(
												theme.vars.palette.primary.mainChannel,
												0.12,
											),
										},
									})}
								>
									<Checkbox checked={selected} sx={{ mr: 1 }} />
									{option.label}
								</Box>
							);
						}}
						slotProps={{
							popper: {
								// Keep MRT toolbar filters anchored while table rows swap between
								// skeleton and data layouts.
								placement: 'bottom-start',
							},
							paper: {
								sx: {
									width: 280,
								},
							},
							chip: {
								sx: (theme) => ({
									backgroundColor: varAlpha(
										theme.vars.palette.grey['500Channel'],
										0.16,
									),
									color: 'text.secondary',
									'&:hover': {
										backgroundColor: varAlpha(
											theme.vars.palette.grey['500Channel'],
											0.24,
										),
									},
								}),
							},
						}}
						sx={{
							minWidth: 260,
							'& .MuiAutocomplete-tag': {
								maxWidth: 120,
							},
						}}
					/>
				</Box>
			</SelectionLockedControl>
		);
	};

	const renderExportActions = () => {
		return (
			<Button
				size="small"
				variant="outlined"
				onClick={openExportDialog}
				startIcon={<Iconify icon="solar:download-bold" />}
			>
				{t('export')}
			</Button>
		);
	};

	const renderSelectionActions = () => {
		return (
			<>
				<Tooltip title={t('more-actions')} placement="top" arrow>
					<IconButton
						size="small"
						aria-label={t('more-actions')}
						onClick={(event) => {
							setSelectionActionAnchorEl(event.currentTarget);
						}}
						sx={{ width: 32, height: 32 }}
					>
						<Iconify icon="eva:more-vertical-fill" width={18} />
					</IconButton>
				</Tooltip>
				<Menu
					anchorEl={selectionActionAnchorEl}
					open={isSelectionActionMenuOpen}
					onClose={closeSelectionActionMenu}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
					transformOrigin={{ vertical: 'top', horizontal: 'right' }}
					slotProps={{
						paper: {
							sx: {
								minWidth: SELECTION_MODE_MENU_MIN_WIDTH,
							},
						},
					}}
				>
					<MenuItem onClick={openExportDialog}>
						<Iconify icon="solar:download-bold" width={18} />
						<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
					</MenuItem>
					<Tooltip
						title={
							eligibleBulkRevokeCount === 0
								? t('only-pending-invitations-can-be-revoked', {
										defaultValue: 'Only pending invitations can be revoked.',
									})
								: ''
						}
						placement="left"
						arrow
						disableHoverListener={eligibleBulkRevokeCount > 0}
					>
						<Box component="span">
							<MenuItem
								disabled={eligibleBulkRevokeCount === 0}
								onClick={() => {
									closeSelectionActionMenu();
									setBulkRevokeDialogOpen(true);
								}}
								sx={{
									color: 'error.main',
									width: '100%',
									'&.Mui-disabled': { color: 'action.disabled' },
								}}
							>
								<Iconify icon="solar:close-circle-bold" width={18} />
								<ListItemText
									primary={t('revoke-selected', {
										defaultValue: 'Revoke selected',
									})}
									sx={{ ml: 1 }}
								/>
							</MenuItem>
						</Box>
					</Tooltip>
				</Menu>
			</>
		);
	};

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
		muiTableHeadCellProps: ({ column }) => {
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
			} satisfies MRT_TableOptions<StaffInvitationRowData>['muiTableHeadCellProps'];
		},
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

			<ConfirmDialog
				open={bulkRevokeDialogOpen}
				onClose={() => setBulkRevokeDialogOpen(false)}
				title={t('revoke-selected', {
					defaultValue: 'Revoke selected',
				})}
				content={
					ineligibleBulkRevokeCount > 0
						? t('confirm-bulk-revoke-invitations-with-ineligible', {
								eligible: eligibleBulkRevokeCount,
								ineligible: ineligibleBulkRevokeCount,
								defaultValue:
									'{{eligible}} pending invitation(s) will be revoked. {{ineligible}} non-pending selection(s) will be skipped. Continue?',
							})
						: t('confirm-bulk-revoke-invitations', {
								count: eligibleBulkRevokeCount,
								defaultValue:
									'Are you sure you want to revoke {{count}} selected invitation(s)?',
							})
				}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleBulkRevoke}
						disabled={isBulkRevoking}
					>
						{t('staff-revoke')}
					</Button>
				}
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
	const disabledReason = t('only-pending-invitations-can-be-copied', {
		defaultValue: 'Only pending invitations can have their link copied.',
	});

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
	const disabledReason = t('only-pending-invitations-can-be-resent', {
		defaultValue: 'Only pending invitations can be resent.',
	});

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
	const disabledReason = t('only-pending-invitations-can-be-revoked', {
		defaultValue: 'Only pending invitations can be revoked.',
	});

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
