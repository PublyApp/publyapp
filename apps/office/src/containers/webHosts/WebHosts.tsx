import { /* Suspense,  useEffect, */ useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
// import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	FormControl,
	TableContainer,
	TableRow,
	TextField,
	// FormControl,
	// FormHelperText,
	// InputLabel,
	// MenuItem,
	// Select,
	// useTheme,
} from '@mui/material';
import {
	createColumnHelper,
	type ColumnDef,
	type PaginationState,
	type Row,
	type RowSelectionState,
	type SortingState,
} from '@tanstack/react-table';
// import _ from 'lodash';
// import { ErrorBoundary, type ErrorBoundaryProps } from 'react-error-boundary';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// import { toast } from 'react-toastify';
import { useToggle } from 'react-use';

// import { NumberParam, StringParam, useQueryParam } from 'use-query-params';

import type { WebHost } from '@devist/shared/types/webHost.types';
import {
	/* getCreateWebHostInputSchema, type CreateWebHostInput */
	getSaveWebHostInputSchema,
	type SaveWebHostInput,
} from '@devist/shared/validations/webHost.validations';
import BestTable, { CustomTableCell } from '@devist/ui-react/components/BestTable';
import TableActionsCell from '@devist/ui-react/components/TableActionsCell';
import TableHeaderCell from '@devist/ui-react/components/TableHeaderCell';
import TableRowCell from '@devist/ui-react/components/TableRowCell';
import { useGetWebHosts, useSaveWebHost } from '@devist/ui-react/query/features/webHosts/webHost.hooks';
import { pxToRem } from '@devist/ui-react/utils/cssUtils';

// import i18n from '@devist/ui-react/utils/i18n';

// @link https://muhimasri.com/blogs/react-editable-table/

// import { TableLoader } from '@office/components/loaders/TableLoader';

const WebHosts = () => {
	const [openCreationRow, toggleOpenCreationRow] = useToggle(false);
	// const [num, setNum] = useQueryParam('x', NumberParam);

	// useEffect(() => {
	// 	console.log('@@@@@@@@@', num);
	// }, [num]);

	return (
		<Box padding={pxToRem(32)} /* id={AI_TABLE_CONTAINER_ID} */>
			<Button
				variant="contained"
				onClick={() => {
					// setNum(_.isNumber(num) ? num + 1 : 0);
					toggleOpenCreationRow();
				}}
			>
				Add Web Host
			</Button>
			<TableContainer>
				{/* <ErrorBoundary fallbackRender={TableError}>
					<Suspense fallback={<TableLoader />}>
						<WebHostsTable openCreationRow={openCreationRow} />
					</Suspense>
				</ErrorBoundary> */}
				{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
				<WebHostsTable openCreationRow={openCreationRow} />
			</TableContainer>
		</Box>
	);
};

export default WebHosts;

const WebHostCreationRowFrom = () => {
	const { t } = useTranslation();
	const saveWebHostInputSchema = getSaveWebHostInputSchema(t /* i18n.t */);

	// const theme = useTheme();

	const form = useForm<SaveWebHostInput>({
		resolver: zodResolver(saveWebHostInputSchema),
		defaultValues: {},
	});

	const {
		result: { mutate: saveWebHost, /* error, isError, isSuccess, */ isPending },
	} = useSaveWebHost();

	// // ? may should I put this effect inside the useSaveWebHost hook too?
	// useEffect(() => {
	// 	if (isError && error) {
	// 		toast.error(error.message);
	// 	}
	// }, [isError, error]);

	// // ? may should I put this effect inside the useSaveWebHost hook too?
	// useEffect(() => {
	// 	if (isSuccess) {
	// 		toast.success('TODO: Translated success message');
	// 	}
	// }, [isSuccess]);

	const onSubmit: SubmitHandler<SaveWebHostInput> = async (data) => {
		saveWebHost(data);
	};

	return (
		<>
			{/* <Box component="form" display="hidden" >
				<input type="text" />
			</Box> */}
			<TableRow>
				{/* <Box component="form"> */}
				<CustomTableCell>{/* <TextField value="OK" /> */}</CustomTableCell>
				<CustomTableCell>
					<TextField
						{...form.register('name')}
						error={!!form.formState.errors.name}
						helperText={form.formState.errors.name?.message}
					/>
				</CustomTableCell>

				<CustomTableCell>
					<TextField
						{...form.register('description')}
						error={!!form.formState.errors.name}
						helperText={form.formState.errors.name?.message}
					/>
				</CustomTableCell>

				<CustomTableCell>
					<Button variant="contained" color="info" onClick={form.handleSubmit(onSubmit)}>
						{isPending ? <CircularProgress /> : 'Save'}
					</Button>
				</CustomTableCell>
				{/* </Box> */}
			</TableRow>
		</>
	);
};

// const TableError: NonNullable<ErrorBoundaryProps['fallbackRender']> = ({ resetErrorBoundary }) => {
// 	return (
// 		<>
// 			<ErrorOutlineIcon fontSize="large" />
// 			<Button
// 				variant="contained"
// 				color="primary"
// 				onClick={() => {
// 					resetErrorBoundary();
// 				}}
// 			>
// 				Retry
// 			</Button>
// 		</>
// 	);
// };

type WebHostsTableProps = { openCreationRow: boolean };

const columnHelper = createColumnHelper<WebHost>();

const WebHostsTable = ({ openCreationRow }: WebHostsTableProps) => {
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

	const {
		editedRows, // for inline editing
		setEditedRows, // for inline editing
		editDialogOpen,
		toggleEditDialog,
		sorting,
		setSorting,
		pagination,
		setPagination,
		dialogEditedRow,
		setDialogEditedRow,
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
	} = useTableSetup<WebHost>();

	const {
		result: { data: webHostsData, isFetching: isWebHostListFetching, refetch: refetchWebHostList },
	} = useGetWebHosts({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

	const { original: dialogRowData } = dialogEditedRow ?? {};

	const { t } = useTranslation();
	const saveWebHostInputSchema = getSaveWebHostInputSchema(t);

	const form = useForm<SaveWebHostInput>({
		resolver: zodResolver(saveWebHostInputSchema),
		values: {
			objectId: dialogRowData?.objectId,
			name: dialogRowData?.translations.en.name ?? '',
			description: dialogRowData?.translations.en.description ?? '',
		},
	});

	const handleEditDialogClose = () => {
		toggleEditDialog();
		form.reset();
	};

	const handleEditDialogCancel = () => {
		handleEditDialogClose();
		// setDialogEditedRow(undefined);
		// // setTimeout(() => {
		// // 	setDialogEditedRow(undefined);
		// // }, 5000);
		// console.log('====================================');
		// console.log('not waiting 5s');
		// console.log('====================================');
	};

	const {
		result: { mutate: saveWebHost, isPending: isSaveWebHostPending },
	} = useSaveWebHost({
		successMessage: 'TODO: Success message',
		onSuccess: () => {
			handleEditDialogClose();
			refetchWebHostList();
		},
	});

	const handleEditDialogSave = form.handleSubmit((data) => {
		saveWebHost(data);
	}); /* () => {
		// save action
		toggleEditDialog();
	}; */

	return (
		<>
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
				openCreationRowForm={openCreationRow}
				// eslint-disable-next-line @typescript-eslint/no-use-before-define
				creationRowForm={<WebHostCreationRowFrom />}
				// rowsCount={aiToolsData?.meta.totalCount ?? 0}
				// ==
				// rowsPerPage={rowsPerPage}
				// setRowsPerPage={setRowsPerPage}
				// // ==
				// pageIndex={pageIndex}
				// setPageIndex={setPageIndex}
				// // ==
				editedRows={editedRows}
				setEditedRows={setEditedRows}
				// ============
				toggleEditDialog={toggleEditDialog}
				setDialogEditedRow={setDialogEditedRow}
			/>
			<Dialog open={editDialogOpen} onClose={handleEditDialogClose}>
				<DialogTitle>Update web host</DialogTitle>
				<DialogContent>
					<DialogContentText>modify Web Host with id {dialogRowData?.objectId}</DialogContentText>
					<FormControl sx={{ display: 'block' }}>
						<TextField {...form.register('name')} />
					</FormControl>
					<FormControl>
						<TextField {...form.register('description')} />
					</FormControl>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleEditDialogCancel}>Cancel</Button>
					<Button onClick={handleEditDialogSave}>
						{isSaveWebHostPending ? <CircularProgress size={16} /> : 'save'}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

function useTableSetup<TData = unknown>() {
	const [editedRows, setEditedRows] = useState<RowSelectionState>({});

	const [dialogEditedRow, setDialogEditedRow] = useState<Row<TData>>();
	const [editDialogOpen, toggleEditDialog] = useToggle(false);

	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5, // TODO: set to an constant
	});

	return {
		editedRows,
		setEditedRows,
		editDialogOpen,
		toggleEditDialog,
		sorting,
		setSorting,
		pagination,
		setPagination,
		dialogEditedRow,
		setDialogEditedRow,
	};
}
