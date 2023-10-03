import { /*  useEffect, useState, */ type ReactNode } from 'react';

import {
	// Box,
	LinearProgress,
	styled,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	// TableFooter,
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
	useReactTable,
	type ColumnDef,
	type OnChangeFn,
	type PaginationState,
	type RowData,
	// type RowSelectionState,
	// type RowData,
	// type ColumnDefResolved,
	type SortingState,
	type TableMeta,
	type TableState,
} from '@tanstack/react-table';
// import _ from 'lodash';
import { useForm /* , type SubmitHandler */ } from 'react-hook-form';

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
	toggleEditDialog: TableMeta<TData>['toggleEditDialog'];
	editedRows: TableMeta<TData>['editedRows'];
	setEditedRows: TableMeta<TData>['setEditedRows'];
	// ====
	setDialogEditedRow: TableMeta<TData>['setDialogEditedRow'];
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
	// data: defaultData,
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
	toggleEditDialog,
	editedRows,
	setEditedRows,
	// =====
	setDialogEditedRow,
}: // state,
// pagination,
/* rowsCount,
	rowsPerPage,
	setRowsPerPage,
	pageIndex,
	setPageIndex, */
Props<TData, TValue>) => {
	// const [data, setData] = useState<TData[]>([]);
	// const [originalData, setOriginalData] = useState<TData[]>([]);

	// useEffect(() => {
	// 	setData(defaultData);
	// 	setOriginalData(_.cloneDeep(defaultData));
	// }, [defaultData]);

	// const [forms, setForms] = useState<Record<string, any>>({});
	// const [editedRows, setEditedRows] = useState<Record<string, { form: any, /* ... */ }>>({});

	// useEffect(() => {
	// 	const novo: Record<string, any> = {};
	// 	Object.entries(editedRows).forEach(([k, v]) => {
	// 		if (v) novo[k] = useForm();
	// 	});

	// 	setForms((prev) => {
	// 		return {
	// 			...novo,
	// 			...prev,
	// 		};
	// 	});
	// }, [editedRows]);

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
		// enableRowSelection: true,
		// enableSubRowSelection: true,
		meta: {
			editedRows,
			setEditedRows,

			toggleEditDialog,
			setDialogEditedRow,

			// forms,
			// updateData: (rowIndex: number, columnId: string, value: unknown) => {
			// 	setData((old) => {
			// 		const newValue = old.map((row, index) => {
			// 			if (index === rowIndex) {
			// 				const newRow = _.set((old as any[])[rowIndex], columnId, value);
			// 				return newRow;
			// 			}

			// 			return row;
			// 		});
			// 		return newValue;
			// 	});
			// },
			// revertData: (rowIndex: number, revert: boolean) => {
			// 	if (revert) {
			// 		setData((prev) => {
			// 			return prev.map((row, index) => {
			// 				return index === rowIndex ? _.cloneDeep(originalData[rowIndex]) : row;
			// 			});
			// 		});
			// 	} else {
			// 		setOriginalData((prev) => {
			// 			return prev.map((row, index) => {
			// 				return index === rowIndex ? _.cloneDeep(data[rowIndex]) : row;
			// 			});
			// 		});
			// 	}
			// },
		},
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
		<TableContainer>
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
					{/* =============================== */}
					{table.getRowModel().rows.map((row) => {
						const Row = ({ form }: { form?: any }) => {
							return (
								<TableRow /* key={row.id} */>
									{row.getVisibleCells().map((cell) => {
										const cellContext = cell.getContext();

										try {
											cellContext.row.hookForm = form;
											// Object.assign(cellContext.row, { hookForm: form });
										} catch (error) {
											if (
												error instanceof TypeError &&
												// eslint-disable-next-line quotes
												error.message === "Cannot assign to read only property 'hookForm' of object '#<Object>'"
											) {
												console.log(error.message);
												// do nothing
											} else {
												throw error;
											}
										}

										return (
											<CustomTableCell key={cell.id}>
												{flexRender(cell.column.columnDef.cell, cellContext)}
											</CustomTableCell>
										);
									})}
								</TableRow>
							);
						};

						const RowWithForm = () => {
							const form = useForm({
								defaultValues: async (/* _payload */) => {
									const defaultValues = {};

									row.getVisibleCells().forEach((cell) => {
										Object.assign(defaultValues, { [cell.column.id]: cell.getContext().getValue() });
									});

									return defaultValues;
								},
							});
							return <Row form={form} />;
						};

						// return table.options.meta?.editedRows[row.id] ? <RowWithForm key={row.id} /> : <Row key={row.id} />;
						return <RowWithForm key={row.id} />;
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
				onPageChange={(_e, iPage) => {
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
					table.setPageIndex(0);
				}}
				rowsPerPageOptions={Object.values(ROWS_PER_PAGE_OPTION)}
			/>
		</TableContainer>
	);
};

export default BestTable;
