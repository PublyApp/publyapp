import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useBoolean, useDebounce } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { DEFAULT_PAGE_SIZE } from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useFindTenantInvitations,
	useRevokeTenantInvitation,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import {
	type DatePickerFormat,
	fDate,
	fIsAfter,
} from '#app/utils/format-time.ts';

import TenantInvitationsExportDialogController, {
	type TenantInvitationsExportDialogControllerRef,
} from './tenant-invitations-export-dialog-controller';

export type TenantInvitationRowData = {
	id: string;
	email: string;
	scope: string;
	profileName: string;
	status: string;
	expiresAt: DatePickerFormat;
	acceptedAt?: DatePickerFormat;
	createdAt: DatePickerFormat;
	invitedByName: string;
};

const columnHelper = createMRTColumnHelper<TenantInvitationRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};
const SELECTION_MODE_MENU_MIN_WIDTH = 220;

const parseStatusFilter = (value: string) => {
	if (!value) {
		return [];
	}

	return value.split(',').filter(Boolean);
};

const STATUS_OPTIONS = [
	{ label: 'Pending', value: 'pending' },
	{ label: 'Accepted', value: 'accepted' },
	{ label: 'Expired', value: 'expired' },
	{ label: 'Revoked', value: 'revoked' },
];

const TenantInvitationsTable = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const searchTooltipId = useId();
	const statusTooltipId = useId();

	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsString.withDefault(''),
	});

	const [searchValue, setSearchValue] = useState(filterStates.q);
	const [statusFilter, setStatusFilter] = useState<string[]>(() =>
		parseStatusFilter(filterStates.status),
	);
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [selectionActionAnchorEl, setSelectionActionAnchorEl] =
		useState<null | HTMLElement>(null);
	const [bulkRevokeDialogOpen, setBulkRevokeDialogOpen] = useState(false);
	const exportDialogRef =
		useRef<TenantInvitationsExportDialogControllerRef>(null);

	const debouncedSearchValue = useDebounce(searchValue, 300);

	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,
		hasNextPage,
		hasPreviousPage,
		resetCursorPagination,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	useEffect(() => {
		if (debouncedSearchValue === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		void setFilterStates({
			q: debouncedSearchValue,
			status: statusFilter.join(','),
		});
	}, [
		debouncedSearchValue,
		filterStates.q,
		resetCursorPagination,
		setFilterStates,
		statusFilter,
	]);

	useEffect(() => {
		setSearchValue(filterStates.q);
	}, [filterStates.q]);

	useEffect(() => {
		const nextStatusFilter = parseStatusFilter(filterStates.status);
		if (!_.isEqual(nextStatusFilter, statusFilter)) {
			setStatusFilter(nextStatusFilter);
		}
	}, [filterStates.status, statusFilter]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchValue(e.target.value);
	};

	const handleStatusChange = (
		_value: React.SyntheticEvent,
		selectedOptions: typeof STATUS_OPTIONS,
	) => {
		const nextStatusFilter = selectedOptions.map((option) => option.value);
		resetCursorPagination?.();
		setStatusFilter(nextStatusFilter);
		void setFilterStates({
			q: searchValue,
			status: nextStatusFilter.join(','),
		});
	};

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('email', {
				id: 'email',
				header: t('email'),
				size: 250,
			}),
			columnHelper.accessor((row) => getInvitationStatus(row), {
				id: 'status',
				header: t('status'),
				enableSorting: false,
				size: 120,
				Cell: StatusCell,
			}),
			columnHelper.accessor('invitedByName', {
				header: t('invited-by'),
				enableSorting: false,
				size: 150,
			}),
			columnHelper.accessor('expiresAt', {
				id: 'expires_at',
				header: t('expires', { defaultValue: 'Expires' }),
				size: 150,
				Cell: ({ cell }) => {
					const date = cell.getValue();
					if (!date) return '-';
					return fDate(date);
				},
			}),
			columnHelper.accessor('profileName', {
				header: t('profiles'),
				enableSorting: false,
				size: 200,
				Cell: ({ cell }) => {
					const value = cell.getValue();
					if (value) {
						return value;
					}

					return t('admin');
				},
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: InvitationActionsCell,
				size: 120,
			}),
		];
	}, [t]);

	const tenantInvitationsQuery = useFindTenantInvitations({
		variables: {
			tenantId: _.toString(tenantId),
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			status: filterStates.status || undefined,
			q: filterStates.q || undefined,
		},
		enabled: !!tenantId,
	});

	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(tenantInvitationsQuery.data?.nextCursor);
		}
	}, [tenantInvitationsQuery.data?.nextCursor, setNextCursor]);

	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: tenantInvitationsQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', {
					item: t('invitations'),
					ns: 'response-message',
				}),
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

	const rows: TenantInvitationRowData[] = useMemo(() => {
		if (!tenantInvitationsQuery.data?.data) {
			return [];
		}

		return _.map(tenantInvitationsQuery.data.data, (invitation) => {
			return {
				id: invitation.id || '',
				email: invitation.email || '',
				scope: invitation.scope || '',
				profileName: invitation.profileName || '',
				status: invitation.status || '',
				expiresAt: invitation.expiresAt || '',
				acceptedAt: invitation.acceptedAt,
				createdAt: invitation.createdAt || '',
				invitedByName: invitation.invitedByName || '',
			};
		});
	}, [tenantInvitationsQuery.data]);

	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;
	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
	const selectedRows = useMemo(() => {
		return rows.filter((row) => rowSelection[row.id]);
	}, [rowSelection, rows]);
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
		useRevokeTenantInvitation({
			meta: { skipGlobalErrorHandler: true },
		});

	const handleBulkRevoke = async () => {
		let succeeded = 0;
		let failed = 0;
		let firstFailureMessage: string | undefined;

		for (const invitationId of Object.keys(rowSelection)) {
			try {
				await revokeInvitationAsync({
					tenantId: _.toString(tenantId),
					invitationId,
				});
				succeeded += 1;
			} catch (error) {
				failed += 1;

				const failure = toApiFailure(error);
				if (firstFailureMessage == null) {
					firstFailureMessage = getFailureMessage(failure);
				}
			}
		}

		setBulkRevokeDialogOpen(false);
		setRowSelection({});
		await queryClient.invalidateQueries({
			queryKey: useFindTenantInvitations.getKey({
				tenantId: _.toString(tenantId),
			}),
		});

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

	const renderToolbarFilters = () => {
		return (
			<>
				<Tooltip
					title={isSelectionMode ? selectionModeDisabledReason : ''}
					arrow
					disableHoverListener={!isSelectionMode}
					describeChild
					slotProps={{ tooltip: { id: searchTooltipId } }}
				>
					<Box component="span">
						<TextField
							size="small"
							placeholder={t('search-invitations', {
								defaultValue: 'Search invitations',
							})}
							value={searchValue}
							onChange={handleSearchChange}
							disabled={isSelectionMode}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<Iconify icon="eva:search-fill" />
										</InputAdornment>
									),
								},
							}}
							sx={{ minWidth: 260 }}
						/>
					</Box>
				</Tooltip>

				<Tooltip
					title={isSelectionMode ? selectionModeDisabledReason : ''}
					arrow
					disableHoverListener={!isSelectionMode}
					describeChild
					slotProps={{ tooltip: { id: statusTooltipId } }}
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
								'& .MuiAutocomplete-tag': {
									maxWidth: 120,
								},
							}}
						/>
					</Box>
				</Tooltip>
			</>
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
				<IconButton
					size="small"
					onClick={(event) => {
						setSelectionActionAnchorEl(event.currentTarget);
					}}
					sx={{ width: 32, height: 32 }}
				>
					<Iconify icon="eva:more-vertical-fill" width={18} />
				</IconButton>
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
					<MenuItem
						onClick={() => {
							closeSelectionActionMenu();
							setBulkRevokeDialogOpen(true);
						}}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
						<ListItemText
							primary={t('revoke-selected', {
								defaultValue: 'Revoke selected',
							})}
							sx={{ ml: 1 }}
						/>
					</MenuItem>
				</Menu>
			</>
		);
	};

	const table = useMRTTable('minimal-cursor', {
		columns,
		data: rows,
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
		meta: {
			handlePaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: tenantInvitationsQuery.isPending,
			disablePaginationControls: isSelectionMode,
			renderToolbarFilters,
			renderSelectionActions,
			renderExportActions,
		},
		renderEmptyRowsFallback,
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		muiTableProps: {
			sx: {
				'& .MuiTableBody-root > tr > td:not(:nth-of-type(2)), & .MuiTableHead-root > tr > th:not(:nth-of-type(2))':
					{
						flex: '1 1 auto !important',
					},
			},
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
			} satisfies MRT_TableOptions<TenantInvitationRowData>['muiTableHeadCellProps'];
		},
	});

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />

			<TenantInvitationsExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={rows}
				selectedRows={selectedRows}
				getInvitationStatus={getInvitationStatus}
			/>

			<ConfirmDialog
				open={bulkRevokeDialogOpen}
				onClose={() => setBulkRevokeDialogOpen(false)}
				title={t('revoke-selected', {
					defaultValue: 'Revoke selected',
				})}
				content={t('confirm-bulk-revoke-invitations', {
					count: selectedCount,
					defaultValue:
						'Are you sure you want to revoke {{count}} selected invitation(s)?',
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleBulkRevoke}
						disabled={isBulkRevoking}
					>
						{t('revoke', { defaultValue: 'Revoke' })}
					</Button>
				}
			/>
		</Box>
	);
};

export default TenantInvitationsTable;

// ----------------------------------------------------------------------

const getInvitationStatus = (invitation: TenantInvitationRowData): string => {
	const status = _.snakeCase(invitation.status);
	if (status) return status;
	if (fIsAfter(new Date(), invitation.expiresAt)) return 'expired';
	return 'pending';
};

const StatusCell: MRT_ColumnDef<TenantInvitationRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const invitation = props.row.original;
	const status = getInvitationStatus(invitation);

	let label: string;
	let color: 'success' | 'error' | 'warning' | 'default';

	switch (status) {
		case 'accepted':
			label = t('accepted');
			color = 'success';
			break;
		case 'revoked':
			label = t('revoked');
			color = 'error';
			break;
		case 'expired':
			label = t('expired');
			color = 'default';
			break;
		default:
			label = t('pending');
			color = 'warning';
	}

	return (
		<Box
			component="span"
			sx={(theme) => {
				const backgroundByColor = {
					success: varAlpha(theme.vars.palette.success.mainChannel, 0.16),
					error: varAlpha(theme.vars.palette.error.mainChannel, 0.16),
					warning: varAlpha(theme.vars.palette.warning.mainChannel, 0.16),
					default: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
				} as const;

				const textByColor = {
					success: theme.vars.palette.success.main,
					error: theme.vars.palette.error.main,
					warning: theme.vars.palette.warning.main,
					default: theme.vars.palette.text.secondary,
				} as const;

				return {
					px: 1,
					py: 0.5,
					borderRadius: 1,
					typography: 'caption',
					fontWeight: 600,
					bgcolor: backgroundByColor[color],
					color: textByColor[color],
				};
			}}
		>
			{label}
		</Box>
	);
};

const InvitationActionsCell: MRT_ColumnDef<TenantInvitationRowData>['Cell'] = (
	props,
) => {
	const invitation = props.row.original;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<RevokeInvitationAction invitation={invitation} />
		</Box>
	);
};

type RevokeInvitationActionProps = {
	invitation: TenantInvitationRowData;
};

const RevokeInvitationAction = ({
	invitation,
}: RevokeInvitationActionProps) => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const queryClient = useQueryClient();
	const confirmDialog = useBoolean();

	const canRevoke = getInvitationStatus(invitation) === 'pending';
	const disabledReason = t('only-pending-invitations-can-be-revoked', {
		defaultValue: 'Only pending invitations can be revoked.',
	});

	const { mutate: revokeInvitation, isPending } = useRevokeTenantInvitation({
		meta: { skipGlobalErrorHandler: true },
		onSuccess: () => {
			toast.success(t('invitation-revoked-success'));
			confirmDialog.onFalse();
			if (tenantId) {
				void queryClient.invalidateQueries({
					queryKey: useFindTenantInvitations.getKey({ tenantId }),
				});
			}
		},
		onError: (error) => {
			const failure = toApiFailure(error);
			const message = getFailureMessage(failure, {
				fallback: t('invitation-revoke-error', {
					defaultValue: 'Failed to revoke invitation.',
				}),
			});
			toast.error(message);
		},
	});

	const onConfirmRevoke = () => {
		if (!tenantId) {
			return;
		}

		revokeInvitation({
			tenantId,
			invitationId: invitation.id,
		});
	};

	return (
		<>
			<Tooltip
				title={canRevoke ? t('revoke') : disabledReason}
				placement="top"
				arrow
			>
				<Box component="span">
					<IconButton
						color="default"
						onClick={confirmDialog.onTrue}
						disabled={!canRevoke || isPending}
						sx={(theme) => ({
							color: canRevoke
								? theme.vars.palette.error.main
								: theme.vars.palette.text.disabled,
						})}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>

			<ConfirmDialog
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('revoke-invitation')}
				content={t('confirm-revoke-invitation', {
					email: invitation.email,
					defaultValue:
						'Are you sure you want to revoke the invitation for {{email}}?',
				})}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={onConfirmRevoke}
						disabled={isPending}
					>
						{t('revoke')}
					</Button>
				}
			/>
		</>
	);
};
