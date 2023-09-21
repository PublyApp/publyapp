export {};
// import { /* useEffect, */ useMemo, useRef, useState } from 'react';

// import { Cancel, Edit } from '@mui/icons-material';
// import { Box /* TableCell, */, Button, IconButton, TextField } from '@mui/material';
// import _ from 'lodash';
// // import { useToggle } from 'react-use';
// // import ReactDOM from 'react-dom/client';
// import {
// 	MaterialReactTable,
// 	type MRT_ColumnDef,
// 	// type MRT_ColumnFiltersState,
// 	type MRT_PaginationState,
// 	// type MRT_SortingState,
// 	// type MRT_TableInstance,
// } from 'material-react-table';

// // import { useToggle } from 'react-use';
// // import { useQueryClient } from '@tanstack/react-query';
// import { AITool } from '@devist/shared/types/aiTool.types';
// import { DEFAULT_PAGE_SIZE } from '@devist/shared/utils/constants';
// import { useGetAITools } from '@devist/ui-react/query/features/aiTools/aiTool.hooks';
// import { pxToRem } from '@devist/ui-react/utils/cssUtils';

// // import { GetAIToolsFunctionResult } from '@devist/ui-react/query/features/aiTools/aiTool.actions';

// // import BOProviders from '../../providers/BOProviders';

// // const NEW_IDENTIFIER = 'new_identifier';
// const AI_TABLE_CONTAINER_ID = 'AI_TABLE_CONTAINER_ID';
// // const AI_TABLE_CREATION_ROW_ID = 'AI_TABLE_CREATION_ROW_ID';

// const AITools = () => {
// 	const [pagination, setPagination] = useState<MRT_PaginationState>({
// 		pageIndex: 0,
// 		pageSize: DEFAULT_PAGE_SIZE / 4,
// 	});
// 	// const [showCreationRow, toggleCreationRow] = useToggle(false);
// 	// const tableInstanceRef = useRef<MRT_TableInstance<AITool>>(null);
// 	const tableContainerRef = useRef<HTMLDivElement>(null);
// 	// const queryClient = useQueryClient();

// 	// const prependElement = useMemo(() => {
// 	// 	return (
// 	// 		// <TableRow /* sx={{ display: showCreationRow ? 'block' : 'none' }} */>
// 	// 		<BOProviders queryClient={queryClient}>
// 	// 			<TableCell>X</TableCell>
// 	// 			<TableCell>X</TableCell>
// 	// 			<TableCell>
// 	// 				<TextField variant="standard" />
// 	// 			</TableCell>
// 	// 		</BOProviders>
// 	// 		// </TableRow>
// 	// 	);
// 	// }, [queryClient]);

// 	// useEffect(() => {
// 	// 	const tbody = document.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);

// 	// 	if (!showCreationRow) {
// 	// 		const foundNewTr = tbody?.querySelector(`#${AI_TABLE_CREATION_ROW_ID}`);

// 	// 		if (foundNewTr) {
// 	// 			tbody?.removeChild(foundNewTr);
// 	// 		}

// 	// 		return () => {
// 	// 			// if (newTr) tbody?.removeChild(newTr);
// 	// 		};
// 	// 	}

// 	// 	const oldTr = tbody?.lastElementChild;
// 	// 	// const div = document.createElement('div');
// 	// 	const newTr = document.createElement('tr');
// 	// 	newTr.className = oldTr?.className || '';
// 	// 	newTr.setAttribute('id', AI_TABLE_CREATION_ROW_ID);

// 	// 	tbody?.prepend(newTr);
// 	// 	ReactDOM.createRoot(newTr)?.render(prependElement);

// 	// 	return () => {
// 	// 		tbody?.removeChild(newTr);
// 	// 	};
// 	// }, [prependElement, showCreationRow]);

// 	// const [tableData, setTableData] = useState<GetAIToolsFunctionResult['aiTools'] | undefined>();

// 	// eslint-disable-next-line no-underscore-dangle
// 	// const tableHasNewData = tableData?.[0]._id === NEW_IDENTIFIER;

// 	// const handleRenderCreationRow = () => {};

// 	const columns = useMemo<MRT_ColumnDef<AITool>[]>(() => {
// 		return [
// 			{
// 				header: 'id',
// 				accessorKey: 'objectId',
// 			},
// 			{
// 				header: 'name',
// 				accessorKey: 'name',
// 				// eslint-disable-next-line react/no-unstable-nested-components
// 				Cell: ({ cell }) => {
// 					// eslint-disable-next-line react/prop-types
// 					return <Box bgcolor="red">{cell.getValue<string>()}</Box>;
// 				},
// 				// eslint-disable-next-line react/no-unstable-nested-components
// 				Edit: ({ cell }) => {
// 					return <TextField value={cell.getValue<string>()} variant="standard" />;
// 				},
// 			},
// 			{
// 				header: 'pricing model',
// 				accessorKey: 'pricingModel',
// 			},
// 			{
// 				header: 'tags',
// 				accessorKey: 'tags',
// 			},
// 		];
// 	}, []);

// 	const {
// 		result: { data: aiToolsData },
// 	} = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize });

// 	// console.log('====================================');
// 	// console.log(originalTableElement);
// 	// console.log('====================================');

// 	// const tableWithCreationRow = cloneElement(originalTableElement, {
// 	// 	// children: [originalTableElement.props.children]
// 	// });

// 	return (
// 		<Box padding={pxToRem(32)} ref={tableContainerRef} id={AI_TABLE_CONTAINER_ID}>
// 			<MaterialReactTable
// 				// ref={tableRef}
// 				// tableInstanceRef={tableInstanceRef}
// 				columns={columns}
// 				/* data={data?.data ?? []} */
// 				// data={tableData ?? []}
// 				data={aiToolsData?.aiTools ?? []}
// 				manualPagination
// 				rowCount={aiToolsData?.meta.totalCount}
// 				onPaginationChange={setPagination}
// 				state={{
// 					pagination,
// 				}}
// 				enableEditing
// 				// editingMode="modal"
// 				enableRowActions
// 				renderRowActions={({ row, table }) => {
// 					// eslint-disable-next-line react-hooks/rules-of-hooks
// 					const { editingRow } = table.getState();
// 					// eslint-disable-next-line no-underscore-dangle
// 					// const isNew = row.original._id === NEW_IDENTIFIER;

// 					// eslint-disable-next-line react-hooks/rules-of-hooks
// 					// useEffect(() => {
// 					// 	if (isNew) {
// 					// 		table.setEditingRow(row);
// 					// 	}
// 					// }, [isNew, row, table]);

// 					const isEdited = _.isEqual(row, editingRow);

// 					return (
// 						<>
// 							{!isEdited && (
// 								<IconButton
// 									onClick={() => {
// 										table.setEditingRow(row);
// 									}}
// 								>
// 									<Edit />
// 								</IconButton>
// 							)}
// 							{isEdited && (
// 								<IconButton
// 									onClick={() => {
// 										// if (isNew) {
// 										// 	setTableData(tableData?.slice(1));
// 										// }

// 										table.setEditingRow(null);
// 									}}
// 								>
// 									<Cancel />
// 								</IconButton>
// 							)}
// 						</>
// 					);
// 				}}
// 				positionActionsColumn="last"
// 				enableRowSelection
// 				renderTopToolbarCustomActions={
// 					(/* { table } */) => {
// 						// const emptyAITool: AITool = {
// 						// 	_id: NEW_IDENTIFIER, // isNew
// 						// 	name: '',
// 						// 	description: '',
// 						// 	pricingType: '',
// 						// 	pricingModel: '',
// 						// 	tags: [],
// 						// } as any;

// 						return (
// 							<Button
// 								color="info"
// 								// disabled={!table.getIsSomeRowsSelected()}
// 								onClick={() => {
// 									// if (tableHasNewData) return;
// 									// setTableData([emptyAITool, ...(tableData || [])]);
// 									// tableInstanceRef.current?.
// 									// tableContainerRef.current?.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);
// 									// const tbody = document.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);
// 									// tbody?.prepend(prependElement);
// 									// toggleCreationRow();
// 								}}
// 								variant="contained"
// 							>
// 								Add New AI Tool
// 							</Button>
// 						);
// 					}
// 				}
// 			/>
// 		</Box>
// 	);
// };

// export default AITools;
