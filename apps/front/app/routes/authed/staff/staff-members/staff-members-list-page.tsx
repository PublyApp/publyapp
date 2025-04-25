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
	MRT_GlobalFilterTextField,
	useMaterialReactTable,
	type MRT_TableInstance,
} from 'material-react-table';
import { nanoid } from 'nanoid';
import { useMemo } from 'react';
// import { GridToolbarContainer } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import { textFieldClasses } from '@mui/material/TextField';
import { inputBaseClasses } from '@mui/material/InputBase';

type StaffMemberRowData = {
	id: string;
	avatar: string;
	firstName: string;
	lastName: string;
	role: string;
};

const data: StaffMemberRowData[] = [
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'Alex',
		lastName: 'Hunter',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
	{
		id: nanoid(),
		avatar: '/static/images/avatars/avatar_1.jpg',
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	},
];

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
					Cell(props) {
						return getUserFullName({
							firstName: props.row.original.firstName,
							lastName: props.row.original.lastName,
						});
					},
				},
			),
			columnHelper.accessor('role', {
				header: t('role'),
				Cell(props) {
					return props.cell.getValue();
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

	const table = useMaterialReactTable({
		columns,
		data,
		enableStickyHeader: true,
		enableRowSelection: true,
		// enableColumnFilters: false,
		// enableDensityToggle: false,
		// enableFullScreenToggle: false,
		// enableColumnActions: false,
		// enableHiding: false,
		// enableGlobalFilter: true,
		// enableColumnResizing: true,
		// enableTopToolbar: true,
		renderTopToolbar: (props) => {
			return (
				<CustomToolbar
					table={props.table}
					onOpenConfirmDeleteRows={(): void => {
						throw new Error('Function not implemented.');
					}}
				/>
			);
		},
		state: {
			showGlobalFilter: true,
		},
		muiTablePaperProps: {
			sx: {
				minHeight: 640,
				flexGrow: { md: 1 },
				display: { md: 'flex' },
				flexDirection: { md: 'column' },
				height: { xs: 800, md: '1px' },
			},
		},
		muiTableContainerProps: {
			sx: {
				scrollbarWidth: 'unset',
			},
		},
		muiPaginationProps: {
			showFirstButton: false,
			showLastButton: false,
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

// ----------------------------------------------------------------------

// declare module '@mui/x-data-grid' {
//   interface ToolbarPropsOverrides {
//     setFilterButtonEl: React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>;
//   }
// }

type CustomToolbarProps = /* GridSlotProps['toolbar'] & */ {
	// canReset: boolean;
	// filteredResults: number;
	// selectedRowIds: string[] /* GridRowSelectionModel */;
	// filters: UseSetStateReturn<IProductTableFilters>;

	onOpenConfirmDeleteRows: () => void;

	table: MRT_TableInstance<any>;
};

function CustomToolbar({
	// filters,
	// canReset,
	// selectedRowIds,
	// filteredResults,
	// setFilterButtonEl,
	onOpenConfirmDeleteRows,
	table,
}: CustomToolbarProps) {
	const selectedRowIds = table.getSelectedRowModel().rows.map((row) => {
		return row.original.id;
	});

	return (
		<Box
			sx={(theme) => {
				return {
					display: 'flex',
					gap: theme.spacing(2),
					padding: theme.spacing(2),
					[`& .${textFieldClasses.root}`]: {
						padding: 0,
						width: '100%',
						[`& .${inputBaseClasses.input}`]: {
							paddingTop: theme.spacing(2),
							paddingBottom: theme.spacing(2),
						},
						[theme.breakpoints.up('md')]: { width: 'unset' },
					},
				};
			}}
		>
			{/* <GridToolbarContainer> */}
			{/* <ProductTableToolbar
          filters={filters}
          options={{ stocks: PRODUCT_STOCK_OPTIONS, publishs: PUBLISH_OPTIONS }}
        /> */}

			{/* <GridToolbarQuickFilter /> */}
			<MRT_GlobalFilterTextField table={table} />

			<Box
				sx={{
					gap: 1,
					flexGrow: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-end',
				}}
			>
				{!!selectedRowIds.length && (
					<Button
						size="small"
						color="error"
						startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
						onClick={onOpenConfirmDeleteRows}
					>
						Delete ({selectedRowIds.length})
					</Button>
				)}

				{/* <GridToolbarColumnsButton /> */}
				{/* <GridToolbarFilterButton ref={setFilterButtonEl} /> */}
				{/* <GridToolbarExport /> */}
			</Box>
			{/* </GridToolbarContainer> */}
			{/* {canReset && (
				<ProductTableFiltersResult
					filters={filters}
					totalResults={filteredResults}
					sx={{ p: 2.5, pt: 0 }}
				/>
			)} */}
		</Box>
	);
}
