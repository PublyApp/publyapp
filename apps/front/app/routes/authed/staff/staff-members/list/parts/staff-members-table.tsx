import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { useFindStaffMember } from '@/front/lib/react-query/features/staff-member/staff-member.hooks';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	roleEnum,
} from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	type MRT_ColumnDef,
	type MRT_SortingState,
	MaterialReactTable,
	createMRTColumnHelper,
} from 'material-react-table';
import { useMemo } from 'react';

export type StaffMemberRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	role: string;
	status: string;
	email: string;
};

const columnHelper = createMRTColumnHelper<StaffMemberRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'createdAt',
};

const StaffMembersTable = () => {
	const { t } = useTranslate();

	// Use the custom table state hook
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
	} = useTableState({
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
					// grow: 1,
					size: 300,
					enableSorting: false,
				},
			),
			columnHelper.accessor('role', {
				header: t('role'),
				Cell: RoleCell,
				size: 70,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 70,
				enableSorting: false,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: UserActionsCell,
				size: 70,
			}),
		];
	}, [t]);

	const { data, isPending } = useFindStaffMember({
		variables: apiVariables,
	});

	const rows: StaffMemberRowData[] = useMemo(() => {
		if (!data?.rows) return [];

		return _.map(data.rows, (staffMember) => {
			return {
				id: staffMember.objectId,
				avatarUrl: staffMember.avatarUrl || '',
				firstName: staffMember.firstName || '',
				lastName: staffMember.lastName || '',
				role: staffMember.roleData?.role || '',
				status: staffMember.status || '',
				email: staffMember.email || '',
			};
		});
	}, [data]);

	const table = useMRTTable('default', {
		columns,
		data: rows,
		rowCount: data?.count || 0,
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'comfortable',
			isLoading: isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default StaffMembersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const fullName = props.cell.getValue();
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
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
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

const StatusCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === 'active') {
		t_message = t('active');
		color = 'success';
	} else if (status === 'pending') {
		t_message = t('pending');
		color = 'warning';
	} else if (status === 'banned') {
		t_message = t('banned');
		color = 'error';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const RoleCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const role = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'role' });
	let color: LabelColor = 'default';

	if (role === roleEnum.STAFF_ADMIN.name) {
		t_message = t('admin');
		color = 'success';
	} else if (role === roleEnum.STAFF_EDITOR.name) {
		t_message = t('editor');
		color = 'info';
	} else if (role === roleEnum.STAFF_USER.name) {
		t_message = t('user');
		color = 'warning';
	} else if (role === roleEnum.STAFF_CONTRIBUTOR.name) {
		t_message = t('contributor');
		color = 'error';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const UserActionsCell: MRT_ColumnDef<StaffMemberRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title="View details" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					// onClick={/* quickEditForm.onTrue */ () => {}}
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title="Quick Edit" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					onClick={/* quickEditForm.onTrue */ () => {}}
				>
					<Iconify icon="solar:pen-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title="Delete" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					onClick={/* quickEditForm.onTrue */ () => {}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>

			{/* <IconButton
              color={menuActions.open ? 'inherit' : 'default'}
              onClick={menuActions.onOpen}
            >
              <Iconify icon="eva:more-vertical-fill" />
            </IconButton> */}
		</Box>
	);
};
