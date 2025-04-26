import _ from 'lodash';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';

import Button from '@mui/material/Button';
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
import { Link } from '@mui/material';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { Label } from '@/front/components/label/label';

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

const StaffMembersListPage = () => {
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
							fullName={props.cell.getValue()}
							avatarUrl={props.row.original.avatarUrl}
							email={props.row.original.email}
						/>
					),
				},
			),
			columnHelper.accessor('role', {
				header: t('role'),
				Cell(props) {
					return props.cell.getValue();
				},
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell(props) {
					return <StatusCell status={props.cell.getValue()} />;
				},
			}),
			columnHelper.display({
				header: 'Actions',
				Cell() {
					return <div>LOL</div>;
				},
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
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={t('list-of-items', { items: _.toLower(t('staff-members')) })}
				links={[
					{
						name: _.capitalize(t('staff-members')),
						href: FRONT_PATH_NAMES.staff.staffMembers.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href="#"
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{t('new-item', { item: _.toLower(t('staff-member')) })}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Card>
				<MaterialReactTable table={table} />
			</Card>
		</DashboardContent>
	);
};

export default StaffMembersListPage;

// ----------------------------------------------------------------------

type UserCellProps = {
	fullName: string;
	avatarUrl: string;
	email: string;
};

const UserCell = ({ fullName, avatarUrl, email }: UserCellProps) => {
	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Link
					component={RouterLink}
					href="#" /* {editHref} */
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
