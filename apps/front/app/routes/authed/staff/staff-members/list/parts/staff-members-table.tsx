import { useTranslate } from '@/front/hooks/use-translate';
import Card from '@mui/material/Card';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_PaginationState,
} from 'material-react-table';
import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
// import { GridToolbarContainer } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { Label } from '@/front/components/label/label';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import _ from 'lodash';
import { getUserFullName } from '@/shared/utils/user.utils';
import { RouterLink } from '@/front/components/router-link';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { Iconify } from '@/front/components/iconify/iconify';

type StaffMemberRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	role: string;
	status: string;
	email: string;
};

// const data: StaffMemberRowData[] = [];
const data: StaffMemberRowData[] = [
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_1.jpg',
		firstName: 'Alex',
		lastName: 'Hunter',
		role: 'Admin',
		status: 'active',
		email: 'alex.hunter@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_2.jpg',
		firstName: 'Sarah',
		lastName: 'Connor',
		role: 'Manager',
		status: 'active',
		email: 'sarah.connor@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_3.jpg',
		firstName: 'James',
		lastName: 'Wilson',
		role: 'Staff',
		status: 'inactive',
		email: 'james.wilson@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_4.jpg',
		firstName: 'Emma',
		lastName: 'Davis',
		role: 'Admin',
		status: 'active',
		email: 'emma.davis@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_5.jpg',
		firstName: 'Michael',
		lastName: 'Brown',
		role: 'Staff',
		status: 'active',
		email: 'michael.brown@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_2.jpg',
		firstName: 'Sarah',
		lastName: 'Connor',
		role: 'Manager',
		status: 'active',
		email: 'sarah.connor@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_3.jpg',
		firstName: 'James',
		lastName: 'Wilson',
		role: 'Staff',
		status: 'inactive',
		email: 'james.wilson@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_4.jpg',
		firstName: 'Emma',
		lastName: 'Davis',
		role: 'Admin',
		status: 'active',
		email: 'emma.davis@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_5.jpg',
		firstName: 'Michael',
		lastName: 'Brown',
		role: 'Staff',
		status: 'active',
		email: 'michael.brown@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_2.jpg',
		firstName: 'Sarah',
		lastName: 'Connor',
		role: 'Manager',
		status: 'active',
		email: 'sarah.connor@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_3.jpg',
		firstName: 'James',
		lastName: 'Wilson',
		role: 'Staff',
		status: 'inactive',
		email: 'james.wilson@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_4.jpg',
		firstName: 'Emma',
		lastName: 'Davis',
		role: 'Admin',
		status: 'active',
		email: 'emma.davis@example.com',
	},
	{
		id: nanoid(),
		avatarUrl: '/static/images/avatars/avatar_5.jpg',
		firstName: 'Michael',
		lastName: 'Brown',
		role: 'Staff',
		status: 'active',
		email: 'michael.brown@example.com',
	},
];
// data.length = 0;

const columnHelper = createMRTColumnHelper<StaffMemberRowData>();

const staffMembersTable = () => {
	const { t } = useTranslate();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: (props) => (
						<UserCell
							userId={props.row.original.id}
							fullName={props.cell.getValue()}
							avatarUrl={props.row.original.avatarUrl}
							email={props.row.original.email}
						/>
					),
					// grow: 1,
					size: 300,
				},
			),
			columnHelper.accessor('role', {
				header: t('role'),
				Cell(props) {
					return props.cell.getValue();
				},
				size: 70,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell(props) {
					return <StatusCell status={props.cell.getValue()} />;
				},
				size: 70,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: (props) => {
					return <UserActionsCell userId={props.row.original.id} />;
				},
				size: 70,
			}),
		];
	}, [t]);

	const [pagination, setPagination] = useState<MRT_PaginationState>({
		pageIndex: 0,
		pageSize: 20, //customize the default page size
	});

	const slicedData = useMemo(() => {
		const startIndex = pagination.pageIndex * pagination.pageSize;
		const endIndex = startIndex + pagination.pageSize;
		return _.slice(data, startIndex, endIndex);
	}, [pagination]);

	const table = useMRTTable('default', {
		columns,
		data: slicedData,
		manualPagination: true,
		rowCount: data.length,
		onPaginationChange: setPagination,
		state: {
			pagination,
			density: 'comfortable',
		},
	});
	return (
		<Card>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default staffMembersTable;

// ----------------------------------------------------------------------

type UserCellProps = {
	fullName: string;
	avatarUrl: string;
	email: string;
	userId: string;
};

const UserCell = ({ fullName, avatarUrl, email, userId }: UserCellProps) => {
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

const StatusCell = ({ status }: { status: string }) => {
	const { t } = useTranslate();

	return (
		<Label
			variant="soft"
			color={
				(status === 'active' && 'success') ||
				(status === 'pending' && 'warning') ||
				(status === 'banned' && 'error') ||
				'default'
			}
		>
			{status || _.toLower(t('unknown-item', { item: 'status' }))}
		</Label>
	);
};

const UserActionsCell = ({ userId }: { userId: string }) => {
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
