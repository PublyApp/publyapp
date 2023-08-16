import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';

import ReactDOM from 'react-dom/client';
import {
	MaterialReactTable,
	type MRT_ColumnDef,
	// type MRT_ColumnFiltersState,
	type MRT_PaginationState,
	// type MRT_SortingState,
	// type MRT_TableInstance,
} from 'material-react-table';
import { Box, Button, IconButton, TableCell, TableRow, TextField } from '@mui/material';
import { Cancel, Edit } from '@mui/icons-material';
// import { useToggle } from 'react-use';
import _ from 'lodash';
import { useToggle } from 'react-use';

import { useGetAITools } from '@aktiveo/ui-react/query/features/aiTools/aiTool.hooks';
import { pxToRem } from '@aktiveo/ui-react/utils/styles';
import { AITool } from '@aktiveo/shared/types/aiTool.types';
import { DEFAULT_PAGE_SIZE } from '@aktiveo/shared/utils/constants';
// import { GetAIToolsFunctionResult } from '@aktiveo/ui-react/query/features/aiTools/aiTool.actions';

// const NEW_IDENTIFIER = 'new_identifier';
const AI_TABLE_CONTAINER_ID = 'AI_TABLE_CONTAINER_ID';

const AITools = () => {
	const [pagination, setPagination] = useState<MRT_PaginationState>({
		pageIndex: 0,
		pageSize: DEFAULT_PAGE_SIZE,
	});
	const [showCreationRow, setShowCreationRow] = useToggle(false);
	// const tableInstanceRef = useRef<MRT_TableInstance<AITool>>(null);
	const tableContainerRef = useRef<HTMLDivElement>(null);

	const prependElement = useMemo(() => {
		return (
			<TableRow /* sx={{ display: showCreationRow ? 'block' : 'none' }} */>
				<TableCell>X</TableCell>
				<TableCell>X</TableCell>
				<TableCell>
					<TextField variant="standard" />
				</TableCell>
			</TableRow>
		);
	}, []);

	useEffect(() => {
		const tbody = document.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);
		const div = document.createElement('div');
		tbody?.prepend(div);
		ReactDOM.createRoot(div)?.render(prependElement);

		return () => {
			tbody?.removeChild(div);
		};
	}, [prependElement]);

	// const [tableData, setTableData] = useState<GetAIToolsFunctionResult['aiTools'] | undefined>();

	// eslint-disable-next-line no-underscore-dangle
	// const tableHasNewData = tableData?.[0]._id === NEW_IDENTIFIER;

	// const handleRenderCreationRow = () => {};

	const columns = useMemo<MRT_ColumnDef<AITool>[]>(() => {
		return [
			{
				header: 'id',
				accessorKey: '_id',
			},
			{
				header: 'name',
				accessorKey: 'name',
				// eslint-disable-next-line react/no-unstable-nested-components
				Cell: ({ cell }) => {
					// eslint-disable-next-line react/prop-types
					return <Box bgcolor="red">{cell.getValue<string>()}</Box>;
				},
				// eslint-disable-next-line react/no-unstable-nested-components
				Edit: ({ cell }) => {
					return <TextField value={cell.getValue<string>()} sx={{ bgcolor: 'yellow' }} />;
				},
			},
			{
				header: 'pricing model',
				accessorKey: 'pricingModel',
			},
			{
				header: 'tags',
				accessorKey: 'tags',
			},
		];
	}, []);

	const {
		result: { data: aiToolsData },
	} = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize });

	const originalTableElement = (
		<MaterialReactTable
			// ref={tableRef}
			// tableInstanceRef={tableInstanceRef}
			columns={columns}
			/* data={data?.data ?? []} */
			// data={tableData ?? []}
			data={aiToolsData?.aiTools ?? []}
			manualPagination
			rowCount={aiToolsData?.meta.totalCount}
			onPaginationChange={setPagination}
			state={{
				pagination,
			}}
			enableEditing
			editingMode="row"
			enableRowActions
			renderRowActions={({ row, table }) => {
				// eslint-disable-next-line react-hooks/rules-of-hooks
				const { editingRow } = table.getState();

				// eslint-disable-next-line no-underscore-dangle
				// const isNew = row.original._id === NEW_IDENTIFIER;

				// eslint-disable-next-line react-hooks/rules-of-hooks
				// useEffect(() => {
				// 	if (isNew) {
				// 		table.setEditingRow(row);
				// 	}
				// }, [isNew, row, table]);

				const isEdited = _.isEqual(row, editingRow);

				return (
					<>
						{!isEdited && (
							<IconButton
								onClick={() => {
									table.setEditingRow(row);
								}}
							>
								<Edit />
							</IconButton>
						)}
						{isEdited && (
							<IconButton
								onClick={() => {
									// if (isNew) {
									// 	setTableData(tableData?.slice(1));
									// }

									table.setEditingRow(null);
								}}
							>
								<Cancel />
							</IconButton>
						)}
					</>
				);
			}}
			positionActionsColumn="last"
			enableRowSelection
			renderTopToolbarCustomActions={
				(/* { table } */) => {
					// const emptyAITool: AITool = {
					// 	_id: NEW_IDENTIFIER, // isNew
					// 	name: '',
					// 	description: '',
					// 	pricingType: '',
					// 	pricingModel: '',
					// 	tags: [],
					// } as any;

					return (
						<Button
							color="info"
							// disabled={!table.getIsSomeRowsSelected()}
							onClick={() => {
								// if (tableHasNewData) return;
								// setTableData([emptyAITool, ...(tableData || [])]);
								// tableInstanceRef.current?.
								// tableContainerRef.current?.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);
								// const tbody = document.querySelector(`#${AI_TABLE_CONTAINER_ID} tbody`);
								// tbody?.prepend(prependElement);
							}}
							variant="contained"
						>
							Add New AI Tool
						</Button>
					);
				}
			}
		/>
	);

	console.log('====================================');
	console.log(originalTableElement);
	console.log('====================================');

	const tableWithCreationRow = cloneElement(originalTableElement, {
		// children: [originalTableElement.props.children]
	});

	return (
		<Box padding={pxToRem(32)} ref={tableContainerRef} id={AI_TABLE_CONTAINER_ID}>
			{tableWithCreationRow}
		</Box>
	);
};

export default AITools;
