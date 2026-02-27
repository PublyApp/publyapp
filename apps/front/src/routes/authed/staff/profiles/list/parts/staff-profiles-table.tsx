import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
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
import { useTableQueryOptions } from '@/front/hooks/use-table-query-options';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';
import { useFindStaffProfiles } from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import type { StaffProfileItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';

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
	const profilesQuery = useFindStaffProfiles({
		variables: {
			cursor: apiVariables.cursor || undefined,
			limit: apiVariables.limit,
			sort: apiVariables.sort,
		},
	});

	// Hook that provides query-aware table options (empty/error fallback, loading state)
	const { renderEmptyRowsFallback, queryState } = useTableQueryOptions({
		query: profilesQuery,
		emptyContent: {
			title: _.capitalize(
				t('no-items-found', { item: t('profiles'), ns: 'response-message' }),
			),
			renderAction: () => (
				<Button
					variant="contained"
					startIcon={<Iconify icon="mingcute:add-line" />}
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.profiles.new}
					sx={{ mt: 2 }}
				>
					{t('new-item', { item: t('profile') })}
				</Button>
			),
		},
		errorContent: {
			title: _.capitalize(
				t('error-loading-items', {
					item: t('profiles'),
					ns: 'response-message',
				}),
			),
		},
	});

	// Sync latest cursor into the table state outside render.
	useEffect(() => {
		if (setNextCursor) {
			setNextCursor(profilesQuery.data?.nextCursor);
		}
	}, [profilesQuery.data?.nextCursor, setNextCursor]);

	// Transform data
	const dataTable = useMemo(() => {
		return _.map(profilesQuery.data?.data, StaffProfileRowDataMapper);
	}, [profilesQuery.data]);

	// Table configuration with cursor pagination preset
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
		meta: {
			handlePaginationChange,
			hasNextPage,
			hasPreviousPage,
			isPending: profilesQuery.isPending,
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
				py: 1,
				gap: 2,
				width: 1,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar alt={name} variant="rounded" sx={{ width: 40, height: 40 }}>
				<Iconify icon="solar:user-id-bold" width={24} />
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
