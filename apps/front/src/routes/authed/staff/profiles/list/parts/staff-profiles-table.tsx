import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import map from 'lodash/map';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type { StaffProfileItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import StaffProfilePreviewDrawer, {
	type StaffProfilePreviewOption,
} from '#app/components/staff-profile-preview-drawer.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableQueryOptions } from '#app/hooks/use-table-query-options.tsx';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import {
	useDeleteStaffProfile,
	useFindStaffProfiles,
	useGetStaffProfileById,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import { getQueryKey } from '#app/lib/react-query/query-utils.ts';

import StaffProfilesExportDialogController, {
	type StaffProfilesExportDialogControllerRef,
} from './staff-profiles-export-dialog-controller.tsx';

// Row Data Type
export type StaffProfileRowData = {
	id: string;
	name: string;
	description: string | null;
	user_account_count: number;
};

// Row Data Mapper
const StaffProfileRowDataMapper = (
	profile: StaffProfileItem,
): StaffProfileRowData => {
	return {
		id: profile.id || '',
		name: profile.name || '-',
		description: profile.description || null,
		user_account_count: getUntypedNumber(profile.userAccountCount, 0),
	};
};

// Column Helper
const columnHelper = createMRTColumnHelper<StaffProfileRowData>();

// Default Sorting
const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const staffProfileUsersQueryKeyRoot = getQueryKey<ApiClient>((client) => {
	return client.staff.profiles.byProfileId('').users.get;
});

const staffProfilePermissionsQueryKeyRoot = getQueryKey<ApiClient>((client) => {
	return client.staff.profiles.byProfileId('').permissions.get;
});

const staffUserProfilesQueryKeyRoot = getQueryKey<ApiClient>((client) => {
	return client.staff.users.byUserId('').profiles.get;
});

const getQueryKeyRoot = (queryKey: unknown) => {
	// Predicate invalidation only needs the stable root segment; query variables differ
	// across pages/details views but should all be swept after destructive profile changes.
	if (Array.isArray(queryKey)) {
		return queryKey[0];
	}

	return queryKey;
};

// Main Table Component
const StaffProfilesTable = () => {
	const { t } = useTranslate();
	const exportDialogRef = useRef<StaffProfilesExportDialogControllerRef | null>(
		null,
	);

	// Search state with nuqs (URL-persisted)
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
	});
	const [search, setSearch] = useState(filterStates.q);
	const debouncedQ = useDebounce(search, 300);

	// Column definitions
	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: t('name'),
				Cell: ProfileNameCell,
				size: 300,
			}),
			columnHelper.accessor('description', {
				enableSorting: false,
				header: t('description'),
				Cell: DescriptionCell,
				size: 400,
			}),
			columnHelper.accessor('user_account_count', {
				header: t('user-accounts'),
				Cell: UserAccountCountCell,
				size: 120,
				muiTableHeadCellProps: {
					align: 'center',
				},
				muiTableBodyCellProps: {
					align: 'center',
				},
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: ProfileActionsCell,
				size: 100,
			}),
		];
	}, [t]);

	// Table state management with CURSOR MODE enabled
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
		if (debouncedQ === filterStates.q) {
			return;
		}

		resetCursorPagination?.();
		void setFilterStates({ q: debouncedQ });
	}, [debouncedQ, filterStates.q, resetCursorPagination, setFilterStates]);

	useEffect(() => {
		setSearch(filterStates.q);
	}, [filterStates.q]);

	// Data fetching with cursor from apiVariables
	const profilesQuery = useFindStaffProfiles({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
			q: filterStates.q || undefined,
		},
	});

	// Hook that provides query-aware table options (empty/error fallback, loading state)
	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: profilesQuery,
		emptyContent: {
			title: capitalize(
				t('no-items-found', { item: t('profiles'), ns: 'response-message' }),
			),
			renderAction: () => (
				<Button
					variant="contained"
					startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.profiles.new}
					sx={{ mt: 2 }}
				>
					{t('new-item', { item: t('profile') })}
				</Button>
			),
		},
		errorContent: {
			title: capitalize(
				t('error-loading-items', {
					item: t('profiles'),
					ns: 'response-message',
				}),
			),
		},
	});

	const handleCursorPaginationChange: typeof handlePaginationChange =
		useCallback(
			(updater) => {
				setNextCursor?.(profilesQuery.data?.nextCursor);
				handlePaginationChange(updater);
			},
			[handlePaginationChange, profilesQuery.data?.nextCursor, setNextCursor],
		);
	const hasNextPage = profilesQuery.data?.nextCursor != null;

	// Transform data
	const dataTable = useMemo(() => {
		return map(profilesQuery.data?.data, StaffProfileRowDataMapper);
	}, [profilesQuery.data]);

	// Row selection state enables selection mode (bulk/selected actions).
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const selectedRows = useMemo(() => {
		return dataTable.filter((row) => rowSelection[row.id]);
	}, [dataTable, rowSelection]);
	const selectedCount = Object.keys(rowSelection).length;
	const isSelectionMode = selectedCount > 0;

	const selectionModeDisabledReason = t('selection-mode-disable-controls');
	const sortingDisabledReason = t('selection-mode-disable-sorting');
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

	// Table configuration with cursor pagination preset
	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		enableRowSelection: true,
		getRowId: (row) => row.id,
		manualSorting: true,
		localization: sortTooltipLocalization,
		onSortingChange: (updater) => {
			// Selection mode locks query controls (sorting/filter/pagination) to prevent
			// users from losing their selected rows mid-operation.
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
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				return typeof updater === 'function' ? updater(prev) : updater;
			});
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
			} satisfies MRT_TableOptions<StaffProfileRowData>['muiTableHeadCellProps'];
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		meta: {
			handlePaginationChange: handleCursorPaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: profilesQuery.isPending,
			disablePaginationControls: isSelectionMode,
			renderToolbarFilters: () => {
				return (
					<Tooltip
						title={isSelectionMode ? selectionModeDisabledReason : ''}
						arrow
						disableHoverListener={!isSelectionMode}
					>
						<Box component="span">
							<TextField
								size="small"
								placeholder={t('search')}
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								disabled={isSelectionMode}
								sx={{ minWidth: 320 }}
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<Iconify icon="eva:search-fill" />
											</InputAdornment>
										),
										'aria-label': t('search'),
									},
								}}
							/>
						</Box>
					</Tooltip>
				);
			},
			renderExportActions: () => {
				return (
					<Tooltip title={t('export')} placement="top" arrow>
						<IconButton
							color="default"
							onClick={() => exportDialogRef.current?.open()}
						>
							<Iconify icon="solar:download-bold" width={18} />
						</IconButton>
					</Tooltip>
				);
			},
			renderSelectionActions: () => {
				return (
					<StaffProfilesSelectionActions
						onExportSelected={() => exportDialogRef.current?.open()}
						selectedRows={selectedRows}
						onClearSelection={() => setRowSelection({})}
					/>
				);
			},
		},
		renderEmptyRowsFallback,
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

			<StaffProfilesExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={dataTable}
				selectedRows={selectedRows}
			/>
		</Box>
	);
};

export default StaffProfilesTable;

// ProfileNameCell Component
const ProfileNameCell: MRT_ColumnDef<StaffProfileRowData, string>['Cell'] = (
	props,
) => {
	const name = props.row.original.name;
	const href = FRONT_PATH_NAMES.staff.profiles.details(
		props.row.original.id,
	).root;

	return (
		<Box
			sx={{
				gap: 1.5,
				width: 1,
				minWidth: 0,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar
				alt={name}
				variant="rounded"
				sx={{
					width: 36,
					height: 36,
					flexShrink: 0,
					bgcolor: 'background.neutral',
					color: 'text.disabled',
				}}
			>
				<Iconify icon="solar:user-id-bold" width={20} />
			</Avatar>

			<Box
				sx={{
					minWidth: 0,
					flex: '1 1 auto',
					display: 'flex',
					flexDirection: 'column',
					gap: 0.25,
				}}
			>
				<Link
					component={RouterLink}
					href={href}
					color="inherit"
					underline="hover"
					sx={{
						typography: 'body2',
						fontWeight: 500,
						display: 'block',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{name}
				</Link>
				<Box
					component="span"
					sx={{
						color: 'text.disabled',
						typography: 'caption',
						display: 'block',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{props.row.original.id}
				</Box>
			</Box>
		</Box>
	);
};

const DescriptionCell: MRT_ColumnDef<StaffProfileRowData, string>['Cell'] = (
	props,
) => {
	const description = props.cell.getValue();
	return (
		<Box
			sx={{
				color: description ? 'text.primary' : 'text.disabled',
			}}
		>
			{description || '-'}
		</Box>
	);
};

const UserAccountCountCell: MRT_ColumnDef<
	StaffProfileRowData,
	number
>['Cell'] = (props) => {
	const count = props.cell.getValue();
	return (
		<Label variant="soft" color={count > 0 ? 'info' : 'default'}>
			{count}
		</Label>
	);
};

const ProfileActionsCell: MRT_ColumnDef<StaffProfileRowData>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const row = props.row.original;
	// Keep preview/confirm state local to the row action so opening one drawer/dialog
	// does not re-render the entire table.
	const [previewedProfile, setPreviewedProfile] =
		useState<StaffProfilePreviewOption | null>(null);
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

	const { mutate: deleteProfile, isPending: isDeleting } =
		useDeleteStaffProfile({
			onSuccess: () => {
				toast.success(
					t('staff-profile-deleted-success', { ns: 'response-message' }),
				);
				setConfirmDeleteOpen(false);

				// A deleted profile can affect list views, detail pages, and any cached
				// "user -> assigned profiles" chips shown elsewhere in staff screens.
				void Promise.all([
					queryClient.invalidateQueries({
						queryKey: useFindStaffProfiles.getKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: useGetStaffProfileById.getKey({ profileId: row.id }),
					}),
					queryClient.invalidateQueries({
						predicate: (query) => {
							return (
								getQueryKeyRoot(query.queryKey) ===
								staffProfileUsersQueryKeyRoot
							);
						},
					}),
					queryClient.invalidateQueries({
						predicate: (query) => {
							return (
								getQueryKeyRoot(query.queryKey) ===
								staffProfilePermissionsQueryKeyRoot
							);
						},
					}),
					queryClient.invalidateQueries({
						predicate: (query) => {
							return (
								getQueryKeyRoot(query.queryKey) ===
								staffUserProfilesQueryKeyRoot
							);
						},
					}),
				]);
			},
		});

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<Tooltip title={t('preview')} placement="top" arrow>
					<IconButton
						color="default"
						size="small"
						onClick={() => {
							setPreviewedProfile({
								id: row.id,
								name: row.name,
								description: row.description,
							});
						}}
					>
						<Iconify icon="solar:list-bold" width={18} />
					</IconButton>
				</Tooltip>

				<Tooltip title={t('delete')} placement="top" arrow>
					<IconButton
						color="default"
						size="small"
						onClick={() => setConfirmDeleteOpen(true)}
						disabled={isDeleting}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Tooltip>
			</Box>

			<StaffProfilePreviewDrawer
				open={previewedProfile != null}
				onClose={() => setPreviewedProfile(null)}
				profile={previewedProfile}
			/>

			<ConfirmDialog
				open={confirmDeleteOpen}
				onClose={() => setConfirmDeleteOpen(false)}
				title={t('delete-item', { item: t('profile'), ns: 'response-message' })}
				content={t('confirm-delete-dialog-text', { ns: 'response-message' })}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => deleteProfile({ profileId: row.id })}
						disabled={isDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};

// ----------------------------------------------------------------------

type StaffProfilesSelectionActionsProps = {
	onExportSelected: () => void;
	selectedRows: StaffProfileRowData[];
	onClearSelection: () => void;
};

const StaffProfilesSelectionActions = ({
	onExportSelected,
	selectedRows,
	onClearSelection,
}: StaffProfilesSelectionActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const open = Boolean(anchorEl);
	const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);

	const { mutateAsync: deleteProfile, isPending: isBulkDeleting } =
		useDeleteStaffProfile({
			meta: { skipGlobalErrorHandler: true },
		});

	const closeMenu = () => setAnchorEl(null);

	const handleConfirmBulkDelete = async () => {
		// We still call the single-delete endpoint once per row until the API exposes
		// a bulk delete route; the important part here is batching the cache refresh.
		let succeeded = 0;
		let failed = 0;
		let firstFailureMessage: string | undefined;

		for (const row of selectedRows) {
			try {
				// Keep the mutation sequential so a single failure doesn't mask the rest.
				// This matches the repo's existing bulk-table fallback behavior.
				// oxlint-disable-next-line no-await-in-loop -- sequential retries are intentional here
				await deleteProfile({ profileId: row.id });
				succeeded += 1;
			} catch (error) {
				failed += 1;

				if (firstFailureMessage == null) {
					firstFailureMessage = getFailureMessage(toApiFailure(error), {
						fallback: t('something-went-wrong'),
					});
				}
			}
		}

		setConfirmBulkDeleteOpen(false);
		if (succeeded > 0) {
			await queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
		}

		if (failed > 0 && succeeded === 0) {
			toast.error(
				firstFailureMessage || t('staff-profile-bulk-delete-failure'),
			);
			return;
		}

		if (failed > 0) {
			toast.warning(
				t('staff-profile-bulk-delete-partial-success', {
					succeeded,
					failed,
				}),
			);
			return;
		}

		onClearSelection();
		toast.success(
			t('staff-profile-bulk-delete-success', {
				count: succeeded,
			}),
		);
	};

	return (
		<>
			<Tooltip title={t('actions')} placement="top" arrow>
				<IconButton
					size="small"
					onClick={(event) => setAnchorEl(event.currentTarget)}
					sx={{ width: 32, height: 32 }}
				>
					<Iconify icon="solar:menu-dots-bold-duotone" width={18} />
				</IconButton>
			</Tooltip>

			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={closeMenu}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							minWidth: 220,
						},
					},
				}}
			>
				<MenuItem
					onClick={() => {
						closeMenu();
						onExportSelected();
					}}
				>
					<Iconify icon="solar:download-bold" width={18} />
					<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
				</MenuItem>
				<MenuItem
					onClick={() => {
						closeMenu();
						setConfirmBulkDeleteOpen(true);
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					<ListItemText primary={t('delete')} sx={{ ml: 1 }} />
				</MenuItem>
			</Menu>

			<ConfirmDialog
				open={confirmBulkDeleteOpen}
				onClose={() => setConfirmBulkDeleteOpen(false)}
				title={t('delete-item', {
					item: t('profiles'),
					ns: 'response-message',
				})}
				content={t('confirm-delete-dialog-text', { ns: 'response-message' })}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmBulkDelete}
						disabled={isBulkDeleting}
					>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};
