import { useMemo, useState } from 'react';

import { Box, Button } from '@mui/material';
import { createColumnHelper, PaginationState, type ColumnDef, type SortingState } from '@tanstack/react-table';

import { AITool } from '@aktiveo/shared/types/aiTool.types';
import BestTable /* , { ROWS_PER_PAGE_OPTION }  */ from '@aktiveo/ui-react/components/BestTable';
import { GetAIToolsFunctionResult } from '@aktiveo/ui-react/query/features/aiTools/aiTool.actions';
import { useGetAITools } from '@aktiveo/ui-react/query/features/aiTools/aiTool.hooks';
import { pxToRem } from '@aktiveo/ui-react/utils/styles';

// import { DEFAULT_PAGE_SIZE } from '@aktiveo/shared/utils/constants';
// import ReactDOM from 'react-dom/client';
// import { useToggle } from 'react-use';
// import { useQueryClient } from '@tanstack/react-query';
// import { useToggle } from 'react-use';
// import { GetAIToolsFunctionResult } from '@aktiveo/ui-react/query/features/aiTools/aiTool.actions';
// import BOProviders from '../../providers/BOProviders';
// const NEW_IDENTIFIER = 'new_identifier';
// const AI_TABLE_CREATION_ROW_ID = 'AI_TABLE_CREATION_ROW_ID';

const AI_TABLE_CONTAINER_ID = 'AI_TABLE_CONTAINER_ID';
const columnHelper = createColumnHelper<GetAIToolsFunctionResult['aiTools'][0]>();

const AITools = () => {
	// const [pageIndex, setPageIndex] = useState<number>(0);
	// const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTION[50]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

	const columns = useMemo<ColumnDef<AITool, string>[]>(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return row.objectId;
				},
				{
					id: 'objectId',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return (
							<>
								{props.header.column.id}
								<Button
									onClick={() => {
										// props.header.column.getToggleSortingHandler()
										props.header.column.toggleSorting(undefined, true);
									}}
								>
									Sort:{' '}
									{{
										asc: ' 🔼',
										desc: ' 🔽',
									}[props.header.column.getIsSorted() as string] ?? '-'}
								</Button>
							</>
						);
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
			columnHelper.accessor(
				(row) => {
					return row.name;
				},
				{
					id: 'name',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return (
							<>
								{props.header.column.id}
								<Button
									onClick={() => {
										// props.header.column.getToggleSortingHandler()
										props.header.column.toggleSorting(undefined, true);
									}}
								>
									Sort:{' '}
									{{
										asc: ' 🔼',
										desc: ' 🔽',
									}[props.header.column.getIsSorted() as string] ?? '-'}
								</Button>
							</>
						);
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
		];
	}, []);

	const {
		result: { data: aiToolsData, isLoading },
	} = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

	return (
		<Box padding={pxToRem(32)} id={AI_TABLE_CONTAINER_ID}>
			<BestTable
				columns={columns}
				data={aiToolsData?.aiTools ?? []}
				isLoading={isLoading}
				rowsCount={aiToolsData?.meta.totalCount ?? 0}
				pageCount={aiToolsData?.meta.lastPage ?? 0}
				setPagination={setPagination}
				setSorting={setSorting}
				state={{
					pagination,
					sorting,
				}}
				// rowsCount={aiToolsData?.meta.totalCount ?? 0}
				// ==
				// rowsPerPage={rowsPerPage}
				// setRowsPerPage={setRowsPerPage}
				// // ==
				// pageIndex={pageIndex}
				// setPageIndex={setPageIndex}
				// // ==
			/>
		</Box>
	);
};

export default AITools;
