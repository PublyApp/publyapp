import { useMemo } from 'react';

import {
	MantineReactTable,
	useMantineReactTable,
	type MRT_ColumnDef, // if using TypeScript (optional, but recommended)
} from 'mantine-react-table';

// If using TypeScript, define the shape of your data (optional, but recommended)
interface Person {
	name: string;
	age: number;
}

// mock data - strongly typed if you are using TypeScript (optional, but recommended)
const data: Person[] = [
	{
		name: 'John',
		age: 30,
	},
	{
		name: 'Sara',
		age: 25,
	},
];

const Table = () => {
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
		];
	}, []);

	// pass table options to useMantineReactTable
	const table = useMantineReactTable({
		columns,
		data, // must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
		enableRowSelection: true, // enable some features
		enableColumnOrdering: true, // enable a feature for all columns
		enableGlobalFilter: false, // turn off a feature
	});

	return <MantineReactTable table={table} />;
};

export default Table;
