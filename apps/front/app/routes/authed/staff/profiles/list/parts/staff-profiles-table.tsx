import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { useFindStaffProfiles } from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import type { StaffProfileItem } from '@/js-client/src/models';
import { DEFAULT_PAGE_SIZE, FRONT_PATH_NAMES } from '@/shared/lib/constants';

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
		user_account_count: profile.userAccountCount || 0,
	};
};

// Column Helper
const columnHelper = createMRTColumnHelper<StaffProfileRowData>();

// Default Sorting
const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

// Main Table Component
const StaffProfilesTable = () => {
	const { t } = useTranslate();

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
		hasNextPage,
		hasPreviousPage,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',
	});

	// Data fetching with cursor from apiVariables
	const { data, isPending, error } = useFindStaffProfiles({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
		},
	});

	// Feed nextCursor back to the hook
	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(data?.nextCursor);
		}
	}, [data?.nextCursor, setNextCursor]);

	// Transform data
	const dataTable = useMemo(() => {
		return _.map(data?.data, StaffProfileRowDataMapper);
	}, [data]);

	// Table configuration
	const table = useMRTTable('default', {
		columns,
		data: dataTable,
		// Cursor pagination configuration
		enablePagination: false, // Disable MRT's built-in pagination
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		// Custom pagination component
		muiBottomToolbarProps: {
			sx: {
				alignItems: 'center',
				'& > .MuiBox-root': {
					px: 2,
				},
			},
		},
		renderBottomToolbarCustomActions: () => (
			<Box
				sx={{
					display: 'flex',
					gap: 2,
					alignItems: 'center',
					width: '100%',
				}}
			>
				{/* Page Size Selector */}
				<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
					<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
						{t('rows-per-page')}:
					</Box>
					<Select
						size="small"
						value={tableState.pagination.pageSize}
						onChange={(e) => {
							handlePaginationChange((prev) => ({
								...prev,
								pageSize: Number(e.target.value),
								pageIndex: 0, // Reset to first page when changing page size
							}));
						}}
						disabled={isPending}
						sx={{ minWidth: 70 }}
						slotProps={{
							input: {
								sx: {
									padding: '4px 10px',
								},
							},
						}}
					>
						<MenuItem value={10}>10</MenuItem>
						<MenuItem value={20}>20</MenuItem>
						<MenuItem value={50}>50</MenuItem>
						<MenuItem value={100}>100</MenuItem>
					</Select>
				</Box>

				{/* Page Navigation */}
				<Box
					sx={{
						ml: 'auto',
						display: 'flex',
						gap: 1,
						justifyContent: 'center',
						alignItems: 'center',
					}}
				>
					<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
						{t('page')} {tableState.pagination.pageIndex + 1}
					</Box>

					<Box sx={{ display: 'flex', gap: 1 }}>
						<Button
							variant="outlined"
							size="small"
							onClick={() => {
								handlePaginationChange((prev) => ({
									...prev,
									pageIndex: prev.pageIndex - 1,
								}));
							}}
							disabled={!hasPreviousPage || isPending}
							startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
						>
							{t('previous')}
						</Button>
						<Button
							variant="outlined"
							size="small"
							onClick={() => {
								handlePaginationChange((prev) => ({
									...prev,
									pageIndex: prev.pageIndex + 1,
								}));
							}}
							disabled={!hasNextPage || isPending}
							endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
						>
							{t('next')}
						</Button>
					</Box>
				</Box>
			</Box>
		),
	});

	// Error State
	if (error) {
		return (
			<Card
				sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}
			>
				<Box sx={{ color: 'error.main', textAlign: 'center' }}>
					{t('error-loading-items', { item: t('profiles') })}
				</Box>
			</Card>
		);
	}

	// Empty State
	if (!isPending && (!data?.data || data.data.length === 0)) {
		return (
			<Card
				sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						minHeight: 400,
						gap: 2,
					}}
				>
					<Iconify
						icon={'solar:inbox-line-bold' as never}
						width={64}
						sx={{ color: 'text.disabled' }}
					/>
					<Box sx={{ textAlign: 'center' }}>
						<Box sx={{ typography: 'h6', color: 'text.secondary' }}>
							{t('no-items-found', { item: t('profiles') })}
						</Box>
						<Box sx={{ typography: 'body2', color: 'text.disabled', mt: 0.5 }}>
							{t('create-first-item', { item: t('profile') })}
						</Box>
					</Box>
				</Box>
			</Card>
		);
	}

	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Card>
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
				py: 1,
				gap: 2,
				width: 1,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar alt={name} variant="rounded" sx={{ width: 40, height: 40 }}>
				{name.charAt(0).toUpperCase()}
			</Avatar>

			<ListItemText
				primary={
					<Link component={RouterLink} href={href} color="inherit">
						{name}
					</Link>
				}
				secondary={props.row.original.id}
				slotProps={{
					primary: { noWrap: true },
					secondary: { sx: { color: 'text.disabled', fontSize: '0.75rem' } },
				}}
			/>
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

const UserAccountCountCell: MRT_ColumnDef<StaffProfileRowData, number>['Cell'] =
	(props) => {
		const count = props.cell.getValue();
		return (
			<Label variant="soft" color={count > 0 ? 'info' : 'default'}>
				{count}
			</Label>
		);
	};

// ProfileActionsCell Component
const ProfileActionsCell: MRT_ColumnDef<StaffProfileRowData>['Cell'] = (
	props,
) => {
	const profileId = props.row.original.id;
	const { t } = useTranslate();

	const handleDelete = () => {
		toast.warning('TODO: implement delete');
	};

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<Tooltip title={t('view-details')} placement="top" arrow>
				<IconButton
					color={'default'}
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.profiles.details(profileId).root}
					size="small"
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton
					color={'default'}
					onClick={handleDelete}
					sx={{ color: 'error.main' }}
					size="small"
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
