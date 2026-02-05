import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useMemo } from 'react';

import { EmptyContent } from '@/front/components/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';

// Type definition for users assigned to this profile
export type ProfileUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<ProfileUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'createdAt',
};

const StaffProfileDetailsUsersTabPage = () => {
	const { t } = useTranslate();

	const { handlePaginationChange, handleSortingChange, tableState } =
		useTableState({
			defaultSorting,
			defaultPageSize: DEFAULT_PAGE_SIZE,
		});

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
					size: 900,
				},
			),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: UserActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	// Empty data for now - will be replaced with API integration later
	const dataTable: ProfileUserRowData[] = useMemo(() => {
		return [];
	}, []);

	const table = useMRTTable('minimal', {
		columns,
		data: dataTable,
		rowCount: 0,
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: false,
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

export default StaffProfileDetailsUsersTabPage;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = _.trim(props.cell.getValue()) || t('un-named');
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

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

const StatusCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		t_message = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		t_message = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		t_message = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		t_message = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.DELETED) {
		t_message = t('deleted');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		t_message = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const UserActionsCell: MRT_ColumnDef<ProfileUserRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const userId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title={t('view-details')} placement="top" arrow>
				<IconButton
					color="default"
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton color="default" sx={{ color: 'error.main' }}>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
