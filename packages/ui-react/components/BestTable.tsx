import { ReactNode } from 'react';

import {
	Box,
	LinearProgress,
	styled,
	Table,
	TableBody,
	TableCell, // TableFooter,
	TableHead,
	TablePagination,
	TableRow,
	// type TablePaginationProps,
	type TableProps,
} from '@mui/material';
import {
	flexRender,
	getCoreRowModel,
	// getPaginationRowModel,
	getSortedRowModel,
	RowData,
	useReactTable,
	type ColumnDef,
	type OnChangeFn,
	type PaginationState,
	// type ColumnDefResolved,
	type SortingState,
	type TableState,
} from '@tanstack/react-table';

type Props<TData, TValue> = {
	columns: ColumnDef<TData, TValue>[];
	// columns: ColumnDefResolved<TData, TValue>[];
	data: TData[];
	isLoading: boolean;
	rowsCount: number;
	pageCount: number;
	state: Partial<TableState>;
	setPagination: OnChangeFn<PaginationState>;
	setSorting: OnChangeFn<SortingState>;
	tableProps?: TableProps;
	openCreationRowForm?: boolean;
	creationRowForm?: ReactNode;
	// rowsCount: number;
	// rowsPerPage: number;
	// setRowsPerPage: (value: number) => void;
	// pageIndex: number;
	// setPageIndex: (value: number) => void;
};

export const ROWS_PER_PAGE_OPTION = {
	5: 5,
	10: 10,
	20: 20,
	50: 50,
	100: 100,
} as const;

export type RowPerPageOption = keyof typeof ROWS_PER_PAGE_OPTION;

export const CustomTableCell = styled(TableCell)(() => {
	return {
		padding: 0,
	};
});

const BestTable = <TData extends RowData = RowData, TValue = any>({
	columns,
	data,
	isLoading,
	state,
	rowsCount,
	pageCount,
	setPagination,
	setSorting,
	openCreationRowForm = false,
	creationRowForm,
	tableProps = {},
}: // state,
// pagination,
/* rowsCount,
	rowsPerPage,
	setRowsPerPage,
	pageIndex,
	setPageIndex, */
Props<TData, TValue>) => {
	const table = useReactTable({
		// columns,
		columns,
		data,
		state,
		// state: {
		// 	pagination,
		// },
		getCoreRowModel: getCoreRowModel(),
		// getPaginationRowModel: getPaginationRowModel(),
		pageCount,
		manualPagination: true,
		onPaginationChange: setPagination,
		manualSorting: true,
		enableMultiSort: true,
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(), // order doesn't matter anymore!
		// etc.
		debugTable: true,
	});
	// const theme = useTheme();

	// const a = table.getState();
	// a.rowSelection

	// console.log('====================================');
	// console.log(data.length, table.getRowModel().rows.length);
	// console.log('====================================');

	// const [rowsPerPage, setRowsPerPage] = useState<RowPerPageOption>(ROWS_PER_PAGE_OPTION[5]);

	return (
		<Box className="table-container">
			{isLoading && <LinearProgress />}
			<Table
				// css={{
				// 	borderCollapse: 'separate',
				// 	borderSpacing: '0px',
				// 	border: `1px solid ${theme.palette.grey[500]}`,
				// 	borderRadius: '10px',
				// 	overflow: 'hidden',
				// 	'th, td': {
				// 		border: `1px solid ${theme.palette.grey[500]}`,
				// 		borderTop: 'unset',
				// 		borderRight: 'unset',
				// 		padding: 0,
				// 	},
				// 	'thead th:first-of-type, tr td:first-of-type': {
				// 		borderLeft: 'unset',
				// 	},
				// 	'tr:last-of-type td': {
				// 		borderBottom: 'unset',
				// 	},
				// 	// ==========
				// 	width: '100%',
				// }}
				{...tableProps}
			>
				<TableHead>
					{table.getHeaderGroups().map((headerGroup) => {
						return (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<CustomTableCell key={header.id}>
											{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
										</CustomTableCell>
									);
								})}
							</TableRow>
						);
					})}
				</TableHead>
				<TableBody>
					{openCreationRowForm && creationRowForm}
					{table.getRowModel().rows.map((row) => {
						return (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => {
									return (
										<CustomTableCell key={cell.id}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</CustomTableCell>
									);
								})}
							</TableRow>
						);
					})}
				</TableBody>
				{/* <TableFooter>
				{table.getFooterGroups().map((footerGroup) => {
					return (
						<TableRow key={footerGroup.id}>
							{footerGroup.headers.map((header) => {
								return (
									<TableCell key={header.id}>
										{header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
									</TableCell>
								);
							})}
						</TableRow>
					);
				})}
			</TableFooter> */}
			</Table>
			<TablePagination
				component="div"
				count={rowsCount}
				page={table.getState().pagination.pageIndex}
				onPageChange={(_, iPage) => {
					// setPageIndex(iPage);
					table.setPageIndex(iPage);
				}}
				rowsPerPage={table.getState().pagination.pageSize}
				onRowsPerPageChange={(event) => {
					// setRowsPerPage(Number(event.target.value) as RowPerPageOption);
					// table.getState().pagination.
					// table.setPagination((prev) => {
					// 	return {
					// 		...prev,
					// 		pageSize: Number(event.target.value),
					// 	};
					// });
					table.setPageSize(Number(event.target.value));
				}}
				rowsPerPageOptions={Object.values(ROWS_PER_PAGE_OPTION)}
			/>
		</Box>
	);
};

export default BestTable;
