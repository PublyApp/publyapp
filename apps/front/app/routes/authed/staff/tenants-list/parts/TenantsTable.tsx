/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useMemo } from 'react';

import { Button } from '@mantine/core';
import {
	MRT_EditActionButtons,
	useMantineReactTable, // if using TypeScript (optional, but recommended)
	type MRT_ColumnDef,
} from 'mantine-react-table';

import BasicTable from '@/front/components/BasicTable';

// If using TypeScript, define the shape of your data (optional, but recommended)
interface Person {
	name: string;
	age: number;
	email: string;
	address: string;
	phone: string;
	company: string;
	avatar: string;
	createdAt: string;
	updatedAt: string;
}

// mock data - strongly typed if you are using TypeScript (optional, but recommended)
const data: Person[] = [
	{
		name: 'John Doe',
		age: 30,
		email: 'john.doe@example.com',
		address: '123 Main St, City, Country',
		phone: '+1-234-567-8901',
		company: 'Tech Corp',
		avatar: 'https://example.com/avatars/john.jpg',
		createdAt: '2023-01-15T09:00:00Z',
		updatedAt: '2023-06-20T14:30:00Z',
	},
	{
		name: 'Sara Smith',
		age: 25,
		email: 'sara.smith@example.com',
		address: '456 Oak Ave, Town, Country',
		phone: '+1-234-567-8902',
		company: 'Design Studio',
		avatar: 'https://example.com/avatars/sara.jpg',
		createdAt: '2023-02-20T10:15:00Z',
		updatedAt: '2023-06-21T11:45:00Z',
	},
];

const TenantsTable = () => {
	// column definitions - strongly typed if you are using TypeScript (optional, but recommended)
	const columns = useMemo<MRT_ColumnDef<Person>[]>(() => {
		return [
			{
				accessorKey: 'name', // simple recommended way to define a column
				header: 'Name',
				mantineTableHeadCellProps: { style: { color: 'green' } }, // custom props
				enableHiding: false, // disable a feature for this column
			},
			{
				accessorFn: (originalRow) => {
					return originalRow.age;
				}, // alternate way
				id: 'age', // id required if you use accessorFn instead of accessorKey
				header: 'Age',
				Header: <i style={{ color: 'red' }}>Age</i>, // optional custom markup
			},
			{
				accessorFn: (originalRow) => {
					return originalRow.email;
				}, // alternate way
				id: 'email', // id required if you use accessorFn instead of accessorKey
				header: 'Email',
				Header: <i style={{ color: 'red' }}>email</i>, // optional custom markup
			},
			{
				accessorFn: (originalRow) => {
					return originalRow.address;
				}, // alternate way
				id: 'address', // id required if you use accessorFn instead of accessorKey
				header: 'address',
				Header: <i style={{ color: 'red' }}>address</i>, // optional custom markup
			},
			{
				accessorFn: (originalRow) => {
					return originalRow.phone;
				}, // alternate way
				id: 'phone', // id required if you use accessorFn instead of accessorKey
				header: 'phone',
				Header: <i style={{ color: 'red' }}>phone</i>, // optional custom markup
			},
		];
	}, []);

	// pass table options to useMantineReactTable
	const table = useMantineReactTable({
		columns,
		data, // must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
		enableRowSelection: true, // enable some features
		enableColumnOrdering: true, // enable a feature for all columns
		enableGlobalFilter: false, // turn off a feature
		enableDensityToggle: false,
		enableRowActions: true, // enable a feature for all rows
		positionActionsColumn: 'last',
		renderRowActions: () => {
			return (
				<>
					<div
						onClick={() => {
							return console.info('Edit');
						}}
					>
						Edit
					</div>
					<div
						onClick={() => {
							return console.info('Delete');
						}}
					>
						Delete
					</div>
				</>
			);
		},
		createDisplayMode: 'modal',
		renderCreateRowModalContent: ({ table: t, row, internalEditComponents }) => (
			// eslint-disable-next-line arrow-body-style
			<div>
				<div /* order={3} */>Create New User</div>
				{internalEditComponents}
				<div /* justify="flex-end" mt="xl" */>
					{/* eslint-disable-next-line react/jsx-pascal-case */}
					<MRT_EditActionButtons variant="text" table={t} row={row} />
				</div>
			</div>
		),
		renderTopToolbarCustomActions: () => {
			return (
				<Button
					onClick={() => {
						table.setCreatingRow(true); // simplest way to open the create row modal with no default values
						// or you can pass in a row object to set default values with the `createRow` helper function
						// table.setCreatingRow(
						//   createRow(table, {
						//     //optionally pass in default values for the new row, useful for nested data or other complex scenarios
						//   }),
						// );
					}}
				>
					Create New User
				</Button>
			);
		},
	});

	return <BasicTable table={table} />;
};

export default TenantsTable;
