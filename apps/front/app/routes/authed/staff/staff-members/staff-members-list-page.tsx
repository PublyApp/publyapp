import _ from 'lodash';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';

import type { CSSObject, SxProps, Theme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	useMaterialReactTable,
} from 'material-react-table';
import { nanoid } from 'nanoid';
import { useEffect, useMemo } from 'react';

type StaffMemberRowData = {
	id: string;
	avatar: string;
	firstName: string;
	lastName: string;
	role: string;
	// phoneNumber: string;
};

const data: StaffMemberRowData[] = [
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
		// phoneNumber: '123-456-7890',
	},
];

const columnHelper = createMRTColumnHelper<StaffMemberRowData>();

const StaffMembersListPage = () => {
	const { t } = useTranslate();

	const columns = [
		columnHelper.accessor(
			(row) => {
				return getUserFullName({
					firstName: row.firstName,
					lastName: row.lastName,
				});
			},
			{
				header: t('name'),
				Cell(props) {
					return props.cell.getValue();
				},
			},
		),
		columnHelper.accessor('role', {
			header: t('role'),
			Cell(props) {
				return props.cell.getValue();
			},
		}),
	];

	const table = useMaterialReactTable({
		columns,
		data,
		enableStickyHeader: true,
		// enableStickyFooter: true,
		enableRowSelection: true,
		enableColumnFilters: false,
		enableDensityToggle: false,
		enableFullScreenToggle: false,
		enableColumnActions: false,
		enableHiding: false,
		enableGlobalFilter: false,
		muiTablePaperProps: {
			sx: {
				minHeight: 640,
				flexGrow: { md: 1 },
				display: { md: 'flex' },
				flexDirection: { md: 'column' },
				height: { xs: 800, md: '1px' },
			},
		},
	});

	// const selectedIds = table.getSelectedRowModel().rows.map((row) => {
	// 	return row.original.id;
	// });

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
