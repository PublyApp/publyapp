import { useMemo } from 'react';

import Box from '@mui/material/Box';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

import type { WebHost } from '@/shared/types/db/webHost.types';
import BestTable from '@/ui-react/components/BestTable';
import TableActionsCell from '@/ui-react/components/TableActionsCell';
import TableHeaderCell from '@/ui-react/components/TableHeaderCell';
import TableRowCell from '@/ui-react/components/TableRowCell';

import useWebHosts from './useWebHosts';

const columnHelper = createColumnHelper<WebHost>();

const WebHostsTable = () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const columns = useMemo<ColumnDef<WebHost, any>[]>(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return row.objectId;
				},
				{
					id: '_id',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return <TableHeaderCell ctx={props} label="objectId" />;
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						// if (props.getValue() === 'UJULgKy7Js') console.log('####', props.row);
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
			columnHelper.accessor(
				(row) => {
					return row.translations.en.name;
				},
				{
					id: 'translations.en.name',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return <TableHeaderCell ctx={props} label={props.column.id} />;
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						// return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
						return <TableRowCell ctx={props} />;
					},
					meta: {
						type: 'text',
					},
				},
			),
			columnHelper.accessor(
				(row) => {
					return row.translations.en.description;
				},
				{
					id: 'translations.en.description',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return <TableHeaderCell ctx={props} label={props.column.id} />;
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						// return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
						return <TableRowCell ctx={props} />;
					},
					meta: {
						type: 'text',
					},
				},
			),
			columnHelper.display({
				id: 'actions',
				// eslint-disable-next-line react/no-unstable-nested-components
				header: (/* props */) => {
					return 'Actions';
				},
				// eslint-disable-next-line react/no-unstable-nested-components
				cell: (props) => {
					return (
						<>
							<TableActionsCell ctx={props} />
							{/* <Button
								variant="contained"
								color="info"
								onClick={}
							>
								Edit
							</Button>
							<Button variant="contained" color="error">
								Delete
							</Button> */}
						</>
					);
				},
			}),
		];
	}, []);

	const { pagination, setPagination, sorting, setSorting, toggleEditDialog, setDialogEditedRow } = useWebHosts();

	const {
		getWebHostsReturn: {
			result: { data: webHostsData, isFetching: isWebHostListFetching /* , refetch: refetchWebHostList */ },
		},
	} = useWebHosts();

	return (
		<BestTable
			columns={columns}
			data={webHostsData?.webHosts ?? []}
			isLoading={isWebHostListFetching}
			rowsCount={webHostsData?.meta.totalCount ?? 0}
			pageCount={webHostsData?.meta.lastPage ?? 0}
			setPagination={setPagination}
			setSorting={setSorting}
			state={{
				pagination,
				sorting,
			}}
			// =======
			openCreationRowForm={false}
			creationRowForm={null}
			editedRows={{}}
			setEditedRows={() => {}}
			// ============
			toggleEditDialog={toggleEditDialog}
			setDialogEditedRow={setDialogEditedRow}
		/>
	);
};

export default WebHostsTable;
