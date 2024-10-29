import { useMemo } from 'react';

import _ from 'lodash';
import {
	MaterialReactTable,
	useMaterialReactTable,
	type MRT_ColumnDef, // if using TypeScript (optional, but recommended)
} from 'material-react-table';

// If using TypeScript, define the shape of your data (optional, but recommended)
interface Person {
	name: string;
	age: number;
}
// type TenantTableItem = {
// 	name: string;
// 	usersCount: number;
// };

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

const TenantsTable = () => {
	// column definitions - strongly typed if you are using TypeScript (optional, but recommended)
	const columns = useMemo<MRT_ColumnDef<Person>[]>(() => {
		return [
			{
				accessorKey: 'name', // simple recommended way to define a column
				header: 'Name',
				muiTableHeadCellProps: { style: { color: 'green' } }, // custom props
				enableHiding: false, // disable a feature for this column
			},
			{
				accessorFn: (originalRow) => {
					return _.toInteger(originalRow.age);
				}, // alternate way
				id: 'age', // id required if you use accessorFn instead of accessorKey
				header: 'Age',
				Header: <i style={{ color: 'red' }}>Age</i>, // optional custom markup
				// eslint-disable-next-line react/no-unstable-nested-components
				Cell: ({ cell }) => {
					return <i>{cell.getValue<number>().toLocaleString()}</i>;
				}, // optional custom cell render
			},
		];
	}, []);
	// pass table options to useMaterialReactTable
	const table = useMaterialReactTable({
		columns,
		data, // must be memoized or stable (useState, useMemo, defined outside of this component, etc.)
		enableRowSelection: true, // enable some features
		enableColumnOrdering: true, // enable a feature for all columns
		enableGlobalFilter: false, // turn off a feature
	});
	// note: you can also pass table options as props directly to <MaterialReactTable /> instead of using useMaterialReactTable
	// but the useMaterialReactTable hook will be the most recommended way to define table options
	return <MaterialReactTable table={table} />;
};

export default TenantsTable;
