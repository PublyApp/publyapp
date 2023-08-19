import { useState } from 'react';

import {
	Box,
	LinearProgress,
	Table,
	TableBody,
	TableCell, // TableFooter,
	TableHead,
	TablePagination,
	TableRow,
	type TableProps,
} from '@mui/material';
import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	// type ColumnDefResolved,
} from '@tanstack/react-table';

// import { Box } from 'lucide-react';

// export type BT_Column<TData> = {

// }

// eslint-disable-next-line @typescript-eslint/naming-convention
export type BTTable_PaginationState = {
	pageIndex: number;
	pageSize: number;
};

type Props<TData, TValue> = {
	columns: ColumnDef<TData, TValue>[];
	// columns: ColumnDefResolved<TData, TValue>[];
	data: TData[];
	isLoading: boolean;
	tableProps?: TableProps;
	rowsCount: number;
	page: number;
};

const ROWS_PER_PAGE_OPTION = {
	5: 5,
	10: 10,
	20: 20,
	50: 50,
	100: 100,
} as const;

type RowPerPageOption = keyof typeof ROWS_PER_PAGE_OPTION;

const BestTable = <TData extends Record<string, unknown> = Record<string, unknown>, TValue = unknown>({
	columns,
	data,
	isLoading,
	tableProps = {},
	rowsCount,
	page,
}: Props<TData, TValue>) => {
	const table = useReactTable({
		// columns,
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(), // order doesn't matter anymore!
		// etc.
	});
	// const theme = useTheme();

	// const a = table.getState();
	// a.rowSelection

	const [rowsPerPage, setRowsPerPage] = useState<RowPerPageOption>(ROWS_PER_PAGE_OPTION[5]);

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
										<TableCell key={header.id}>
											{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
										</TableCell>
									);
								})}
							</TableRow>
						);
					})}
				</TableHead>
				<TableBody>
					{table.getRowModel().rows.map((row) => {
						return (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => {
									return (
										<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
				page={page}
				// eslint-disable-next-line @typescript-eslint/no-empty-function
				onPageChange={/* handleChangePage */ () => {}}
				rowsPerPage={rowsPerPage}
				onRowsPerPageChange={(event) => {
					setRowsPerPage(Number(event.target.value) as RowPerPageOption);
				}}
				rowsPerPageOptions={Object.values(ROWS_PER_PAGE_OPTION)}
			/>
		</Box>
	);
};

export default BestTable;
