import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import map from 'lodash/map';
import pick from 'lodash/pick';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_Localization,
	type MRT_SortingState,
	type MRT_TableOptions,
} from 'material-react-table';
import { useDebounce } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import type { StaffProfileUserItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { EmptyContent } from '#app/components/empty-content/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import {
	useFindStaffProfileUsers,
	useUnassignStaffProfileUsers,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import {
	useGetStaffUserProfiles,
	useReactivateStaffUser,
	useSuspendStaffUser,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

import StaffProfileUsersExportDialogController, {
	type StaffProfileUsersExportDialogControllerRef,
} from './staff-profile-users-export-dialog-controller.tsx';

export const defaultStaffProfileUsersSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

export type ProfileUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<ProfileUserRowData>();

export const StaffProfileUsersTable = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const resolvedProfileId = toStr(profileId);
	const exportDialogRef =
		useRef<StaffProfileUsersExportDialogControllerRef | null>(null);

	// Search state with nuqs (URL-persisted)
	const [filterStates, setFilterStates] = useQueryStates({
		q: parseAsString.withDefault(''),
	});
	const [search, setSearch] = useState(filterStates.q);
	const debouncedQ = useDebounce(search, 300);

	// Row selection enables "bulk actions" mode (shared MRT toolbar pattern).
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		paginationState,
		setPaginationState,
	} = useTableState({
		defaultSorting: defaultStaffProfileUsersSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
	});

	const selectedCount = Object.values(rowSelection).filter(Boolean).length;
	const isSelectionMode = selectedCount > 0;

	useEffect(() => {
		if (debouncedQ === filterStates.q) {
			return;
		}

		// Offset pagination: reset to page 1 when the query changes.
		setPaginationState({
			...paginationState,
			page: '1',
		});
		void setFilterStates({ q: debouncedQ });
	}, [
		debouncedQ,
		filterStates.q,
		paginationState,
		setFilterStates,
		setPaginationState,
	]);

	useEffect(() => {
		setSearch(filterStates.q);
	}, [filterStates.q]);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
					size: 420,
				},
			),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 170,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: UserActionsCell,
				size: 80,
			}),
		];
	}, [t]);

	const usersQuery = useFindStaffProfileUsers({
		variables: {
			profileId: resolvedProfileId,
			...apiVariables,
			q: filterStates.q || undefined,
		},
		enabled: !!resolvedProfileId,
	});

	const data = useMemo(() => {
		return map(usersQuery.data?.users, mapProfileUserRowData);
	}, [usersQuery.data]);

	// Derive selected rows from the currently loaded page.
	// Selection mode locks query controls (sorting/filter/pagination) so users don't
	// lose selected rows mid-operation.
	const selectedRowsFromData = useMemo(() => {
		return data.filter((row) => rowSelection[row.id]);
	}, [data, rowSelection]);
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

	const table = useMRTTable('minimal', {
		columns,
		data,
		rowCount: getUntypedNumber(usersQuery.data?.count, 0),
		manualPagination: true,
		onPaginationChange: (updater) => {
			if (isSelectionMode) {
				return;
			}

			handlePaginationChange(updater);
		},
		manualSorting: true,
		localization: sortTooltipLocalization,
		onSortingChange: (updater) => {
			if (isSelectionMode) {
				return;
			}

			handleSortingChange(updater);
		},
		enableRowSelection: true,
		getRowId: (row) => row.id,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				return typeof updater === 'function' ? updater(prev) : updater;
			});
		},
		state: {
			...tableState,
			density: 'compact',
			isLoading: usersQuery.isPending,
			rowSelection,
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
			} satisfies MRT_TableOptions<ProfileUserRowData>['muiTableHeadCellProps'];
		},
		meta: {
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
								placeholder={t('search-by-email-or-name')}
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
			renderSelectionActions: () => {
				return (
					<ProfileUsersSelectionActions
						rows={selectedRowsFromData}
						onOpenExportDialog={() => exportDialogRef.current?.open()}
						onClearSelection={() => setRowSelection({})}
					/>
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
			disablePaginationControls: isSelectionMode,
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent
				title={t('no-data')}
				sx={{
					minHeight: 400,
				}}
			/>
		),
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<>
			<MaterialReactTable table={table} />
			<StaffProfileUsersExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={data}
				selectedRows={selectedRowsFromData}
			/>
		</>
	);
};

const mapProfileUserRowData = (
	user: StaffProfileUserItem,
): ProfileUserRowData => {
	return {
		id: toStr(user.id),
		avatarUrl: user.avatarUrl || '',
		firstName: user.firstName || '',
		lastName: user.lastName || '',
		email: user.email || '',
		status: user.status || '',
	};
};

const UserCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = trim(props.cell.getValue()) || t('un-named');
	const avatarUrl = props.row.original.avatarUrl;
	const normalizedAvatarUrl = trim(avatarUrl);
	const email = props.row.original.email;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar
				alt={fullName}
				src={normalizedAvatarUrl || undefined}
				sx={
					normalizedAvatarUrl
						? {}
						: {
								bgcolor: 'background.neutral',
								color: 'text.disabled',
							}
				}
			>
				{!normalizedAvatarUrl ? (
					<Iconify icon="solar:user-rounded-bold" width={20} />
				) : null}
			</Avatar>

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Link
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
					color="inherit"
					sx={{ cursor: 'pointer' }}
				>
					{fullName}
				</Link>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
		</Box>
	);
};

type ProfileUsersSelectionActionsProps = {
	rows: ProfileUserRowData[];
	onOpenExportDialog: () => void;
	onClearSelection: () => void;
};

// Bulk actions shown when at least one row is selected.
const ProfileUsersSelectionActions = ({
	rows,
	onOpenExportDialog,
	onClearSelection,
}: ProfileUsersSelectionActionsProps) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const { profileId } = useParams();
	const resolvedProfileId = toStr(profileId);
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const open = Boolean(anchorEl);
	const closeMenu = () => setAnchorEl(null);
	const [confirmBulkUnassignOpen, setConfirmBulkUnassignOpen] = useState(false);

	const { mutateAsync: unassignUsers, isPending: isUnassigning } =
		useUnassignStaffProfileUsers({
			onSuccess: async () => {
				// Unassigning from the profile changes both sides of the relationship:
				// refresh the profile-users table and each affected staff-user profile chip set.
				void queryClient.invalidateQueries({
					queryKey: useFindStaffProfileUsers.getKey(),
				});
				await Promise.all(
					rows.map((row) => {
						return queryClient.invalidateQueries({
							queryKey: useGetStaffUserProfiles.getKey({ userId: row.id }),
						});
					}),
				);
			},
		});

	const handleConfirmBulkUnassign = async () => {
		if (!resolvedProfileId) {
			return;
		}

		try {
			await unassignUsers({
				profileId: resolvedProfileId,
				userIds: rows.map((row) => row.id),
			});

			toast.success(
				t('staff-profile-users-unassigned-success', { ns: 'response-message' }),
			);
			setConfirmBulkUnassignOpen(false);
			onClearSelection();
		} catch {
			toast.error(t('something-went-wrong'));
		}
	};

	return (
		<>
			<IconButton
				size="small"
				onClick={(event) => setAnchorEl(event.currentTarget)}
				sx={{ width: 32, height: 32 }}
			>
				<Iconify icon="eva:more-vertical-fill" width={18} />
			</IconButton>
			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={closeMenu}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				<MenuItem
					onClick={() => {
						closeMenu();
						onOpenExportDialog();
					}}
				>
					<Iconify icon="solar:download-bold" width={18} />
					<ListItemText primary={t('export-selected')} sx={{ ml: 1 }} />
				</MenuItem>
				<MenuItem
					onClick={() => {
						closeMenu();
						setConfirmBulkUnassignOpen(true);
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="lucide:user-minus" width={18} />
					<ListItemText primary={t('unassign')} sx={{ ml: 1 }} />
				</MenuItem>
			</Menu>

			<ConfirmDialog
				open={confirmBulkUnassignOpen}
				onClose={() => setConfirmBulkUnassignOpen(false)}
				title={t('unassign-user-from-profile')}
				content={t('unassign-user-from-profile-confirm')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmBulkUnassign}
						disabled={isUnassigning}
					>
						{t('unassign')}
					</Button>
				}
			/>
		</>
	);
};

const StatusCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const user = props.row.original;

	const status = props.cell.getValue();
	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
	const [pendingStatus, setPendingStatus] = useState<string | null>(null);

	let tMessage: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		tMessage = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		tMessage = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		tMessage = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		tMessage = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		tMessage = t('inactive');
		color = 'default';
	}

	const isActive = status === USER_STATUS_ENUM.ACTIVE;
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const canChangeStatus = isActive || isSuspended;

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendStaffUser({
		meta: { successMessage: 'staff-user-suspended-success' },
		onSuccess: () => {
			// This status control mutates the user-level status, not a profile-local flag.
			// Refresh the current projection so suspended users stay visible with updated status.
			// Refresh any "staff profile -> users" lists after a staff user status change.
			void queryClient.invalidateQueries({
				queryKey: useFindStaffProfileUsers.getKey(),
			});
			setConfirmDialogOpen(false);
			setMenuAnchorEl(null);
		},
	});

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateStaffUser({
			meta: { successMessage: 'staff-user-reactivated-success' },
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: useFindStaffProfileUsers.getKey(),
				});
				setConfirmDialogOpen(false);
				setMenuAnchorEl(null);
			},
		});

	const isMutating = isSuspending || isReactivating;

	const handleStatusClick = (newStatus: string) => {
		if (newStatus === status) {
			setMenuAnchorEl(null);
			return;
		}

		setPendingStatus(newStatus);
		setConfirmDialogOpen(true);
	};

	const handleConfirm = () => {
		if (!pendingStatus) {
			return;
		}

		if (pendingStatus === USER_STATUS_ENUM.SUSPENDED) {
			suspendUser({ userId: user.id });
			return;
		}

		if (pendingStatus === USER_STATUS_ENUM.ACTIVE) {
			reactivateUser({ userId: user.id });
		}
	};

	if (!canChangeStatus) {
		return (
			<Label variant="soft" color={color}>
				{tMessage}
			</Label>
		);
	}

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center' }}>
				<Tooltip title={t('change-status')} placement="top" arrow>
					<ButtonBase
						onClick={(event) => {
							setMenuAnchorEl(event.currentTarget);
						}}
						disabled={isMutating}
						sx={(theme) => ({
							gap: 0.5,
							px: 0.5,
							py: 0.25,
							borderRadius: 1,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							transition: theme.transitions.create('background-color', {
								duration: theme.transitions.duration.shorter,
							}),
							'&:hover': {
								backgroundColor: varAlpha(
									theme.vars.palette.grey['500Channel'],
									0.08,
								),
							},
							'&:disabled': {
								opacity: 0.48,
							},
						})}
					>
						<Label variant="soft" color={color}>
							{tMessage}
						</Label>
						<Iconify icon="eva:arrow-ios-downward-fill" width={16} />
					</ButtonBase>
				</Tooltip>

				<Menu
					open={menuAnchorEl !== null}
					disableAutoFocusItem
					onClose={() => {
						setMenuAnchorEl(null);
					}}
					anchorEl={menuAnchorEl}
					anchorOrigin={{
						vertical: 'bottom',
						horizontal: 'left',
					}}
					transformOrigin={{
						vertical: 'top',
						horizontal: 'left',
					}}
				>
					<MenuItem
						selected={isActive}
						onClick={() => handleStatusClick(USER_STATUS_ENUM.ACTIVE)}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							{isActive ? (
								<Iconify icon="solar:check-circle-bold" width={18} />
							) : (
								<Iconify icon="solar:shield-check-bold" width={18} />
							)}
							{t('active')}
						</Stack>
					</MenuItem>

					<MenuItem
						selected={isSuspended}
						onClick={() => handleStatusClick(USER_STATUS_ENUM.SUSPENDED)}
					>
						<Stack direction="row" alignItems="center" gap={1}>
							{isSuspended ? (
								<Iconify icon="solar:check-circle-bold" width={18} />
							) : (
								<Iconify icon="solar:stop-circle-bold" width={18} />
							)}
							{t('suspended')}
						</Stack>
					</MenuItem>
				</Menu>
			</Box>

			<ConfirmDialog
				open={confirmDialogOpen}
				onClose={() => setConfirmDialogOpen(false)}
				title={
					pendingStatus === USER_STATUS_ENUM.SUSPENDED
						? t('suspend-staff-user')
						: t('reactivate-staff-user')
				}
				content={
					pendingStatus === USER_STATUS_ENUM.SUSPENDED
						? t('suspend-staff-user-confirm')
						: t('reactivate-staff-user-confirm')
				}
				action={
					<Button
						variant="contained"
						color={
							pendingStatus === USER_STATUS_ENUM.SUSPENDED ? 'error' : 'primary'
						}
						onClick={handleConfirm}
						disabled={isMutating}
					>
						{pendingStatus === USER_STATUS_ENUM.SUSPENDED
							? t('suspend')
							: t('reactivate')}
					</Button>
				}
			/>
		</>
	);
};

const UserActionsCell: MRT_ColumnDef<ProfileUserRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const { profileId } = useParams();
	const resolvedProfileId = toStr(profileId);
	const userId = props.row.original.id;
	const user = props.row.original;
	const fullName = trim(
		getUserFullName({ firstName: user.firstName, lastName: user.lastName }),
	);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [confirmUnassignOpen, setConfirmUnassignOpen] = useState(false);

	const status = user.status;
	let statusLabel: string = t('unknown-item', { item: 'status' });
	let statusColor: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		statusLabel = t('active');
		statusColor = 'success';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		statusLabel = t('banned');
		statusColor = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		statusLabel = t('suspended');
		statusColor = 'warning';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		statusLabel = t('inactive');
		statusColor = 'default';
	}

	const { mutateAsync: unassignUsers, isPending: isUnassigning } =
		useUnassignStaffProfileUsers({
			onSuccess: async () => {
				// Keep the "profile -> users" projection in sync after unassignment.
				void queryClient.invalidateQueries({
					queryKey: useFindStaffProfileUsers.getKey(),
				});
				await queryClient.invalidateQueries({
					queryKey: useGetStaffUserProfiles.getKey({ userId }),
				});
				setConfirmUnassignOpen(false);
			},
		});

	const handleConfirmUnassign = async () => {
		if (!resolvedProfileId) {
			return;
		}

		try {
			await unassignUsers({
				profileId: resolvedProfileId,
				userIds: [userId],
			});

			toast.success(
				t('staff-profile-users-unassigned-success', { ns: 'response-message' }),
			);
		} catch {
			toast.error(t('something-went-wrong'));
		}
	};

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<Tooltip title={t('preview')} placement="top" arrow>
					<IconButton
						color="default"
						onClick={() => {
							setDrawerOpen(true);
						}}
					>
						<Iconify icon="solar:list-bold" width={18} />
					</IconButton>
				</Tooltip>

				<Tooltip title={t('unassign')} placement="top" arrow>
					<IconButton
						color="default"
						onClick={() => setConfirmUnassignOpen(true)}
						disabled={isUnassigning}
					>
						{isUnassigning ? (
							<CircularProgress size={18} />
						) : (
							<Iconify icon="lucide:user-minus" width={18} />
						)}
					</IconButton>
				</Tooltip>
			</Box>

			<Drawer
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				anchor="right"
				sx={(theme) => ({
					// Match the other staff-area preview drawers so the overlay properly
					// covers the app sidebar instead of sitting underneath it.
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: {
						sx: {
							width: 480,
							maxWidth: '100%',
							overflow: 'unset',
						},
					},
				}}
			>
				<DrawerAnchor
					onClick={() => setDrawerOpen(false)}
					aria-label={t('close')}
					sx={{ left: 0 }}
				>
					<Iconify icon="mingcute:close-line" width={18} />
				</DrawerAnchor>

				<Box sx={{ p: 3, pt: 8 }}>
					<Stack spacing={2.5}>
						<Box>
							<Box sx={{ typography: 'overline', color: 'text.secondary' }}>
								{t('user')}
							</Box>
							<Box sx={{ typography: 'h4' }}>{fullName || '-'}</Box>
							<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
								{user.email}
							</Box>
						</Box>

						<Box>
							<Box sx={{ typography: 'subtitle2', color: 'text.secondary' }}>
								{t('status')}
							</Box>
							<Label variant="soft" color={statusColor}>
								{statusLabel}
							</Label>
						</Box>

						<Box sx={{ display: 'flex' }}>
							<Link
								component={RouterLink}
								href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
								underline="none"
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 1,
									fontWeight: 600,
								}}
							>
								{t('view-details')}
								<Iconify icon="eva:external-link-outline" width={18} />
							</Link>
						</Box>
					</Stack>
				</Box>
			</Drawer>

			<ConfirmDialog
				open={confirmUnassignOpen}
				onClose={() => setConfirmUnassignOpen(false)}
				title={t('unassign-user-from-profile')}
				content={t('unassign-user-from-profile-confirm')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={handleConfirmUnassign}
						disabled={isUnassigning}
					>
						{t('unassign')}
					</Button>
				}
			/>
		</>
	);
};
