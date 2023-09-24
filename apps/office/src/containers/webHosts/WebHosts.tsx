import { Suspense, useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
	Box,
	Button,
	CircularProgress,
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
import { createColumnHelper, type ColumnDef, type PaginationState, type SortingState } from '@tanstack/react-table';
import { ErrorBoundary, type ErrorBoundaryProps } from 'react-error-boundary';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useToggle } from 'react-use';

import type { WebHost } from '@devist/shared/types/webHost.types';
import { getCreateWebHostInputSchema, type CreateWebHostInput } from '@devist/shared/validations/webHost.validations';
import BestTable, { CustomTableCell } from '@devist/ui-react/components/BestTable';
import TableHeaderCell from '@devist/ui-react/components/TableHeaderCell';
import { useCreateWebHost, useGetWebHosts } from '@devist/ui-react/query/features/webHosts/webHost.hooks';
import { pxToRem } from '@devist/ui-react/utils/cssUtils';
import i18n from '@devist/ui-react/utils/i18n';

import { TableLoader } from '@office/components/loaders/TableLoader';

const WebHostingProviders = () => {
	const [openCreationRow, toggleOpenCreationRow] = useToggle(false);

	return (
		<Box padding={pxToRem(32)} /* id={AI_TABLE_CONTAINER_ID} */>
			<Button
				variant="contained"
				onClick={() => {
					toggleOpenCreationRow();
				}}
			>
				Add Web Host
			</Button>
			{/* <TableLoader /> */}
			<TableContainer /* sx={{ bgcolor: 'red' }} */>
				{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
				<ErrorBoundary fallbackRender={TableError}>
					<Suspense fallback={<TableLoader />}>
						{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
						<WebHostsTable openCreationRow={openCreationRow} />
					</Suspense>
				</ErrorBoundary>
			</TableContainer>
		</Box>
	);
};

export default WebHostingProviders;

const WebHostCreationRowFrom = () => {
	const createWebHostInputSchema = getCreateWebHostInputSchema(i18n.t);

	// const theme = useTheme();

	const form = useForm<CreateWebHostInput>({
		resolver: zodResolver(createWebHostInputSchema),
	});

	const {
		result: { mutate: createWebHost, error, isError, isSuccess, isPending },
	} = useCreateWebHost();

	useEffect(() => {
		if (isError && error) {
			toast.error(error.message);
		}
	}, [isError, error]);

	useEffect(() => {
		if (isSuccess) {
			toast.success('TODO: Translated success message');
		}
	}, [isSuccess]);

	const onSubmit: SubmitHandler<CreateWebHostInput> = async (data) => {
		createWebHost(data);
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

const TableError: NonNullable<ErrorBoundaryProps['fallbackRender']> = ({ resetErrorBoundary }) => {
	return (
		<>
			<ErrorOutlineIcon fontSize="large" />
			<Button
				variant="contained"
				color="primary"
				onClick={() => {
					resetErrorBoundary();
				}}
			>
				Retry
			</Button>
		</>
	);
};

type WebHostsTableProps = { openCreationRow: boolean };

const columnHelper = createColumnHelper<WebHost>();

const WebHostsTable = ({ openCreationRow }: WebHostsTableProps) => {
	// const [pageIndex, setPageIndex] = useState<number>(0);
	// const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTION[50]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

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
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
			columnHelper.accessor(
				(row) => {
					return row.translations.en.name;
				},
				{
					id: 'name',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return <TableHeaderCell ctx={props} label={props.column.id} />;
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
			columnHelper.accessor(
				(row) => {
					return row.translations.en.description;
				},
				{
					id: 'description',
					// eslint-disable-next-line react/no-unstable-nested-components
					header: (props) => {
						return <TableHeaderCell ctx={props} label={props.column.id} />;
					},
					// eslint-disable-next-line react/no-unstable-nested-components
					cell: (props) => {
						return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
					},
				},
			),
			columnHelper.display({
				id: 'actions',
				// eslint-disable-next-line react/no-unstable-nested-components
				cell: (/* props */) => {
					return (
						<>
							<Button variant="contained" color="info">
								Edit
							</Button>
							<Button variant="contained" color="error">
								Delete
							</Button>
						</>
					);
				},
				// eslint-disable-next-line react/no-unstable-nested-components
				header: (/* props */) => {
					return 'Actions';
				},
			}),
		];
	}, []);

	const {
		result: { data: webHostsData },
	} = useGetWebHosts({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

	return (
		<BestTable
			columns={columns}
			data={webHostsData.webHosts}
			isLoading={/* isLoading */ false}
			rowsCount={webHostsData.meta.totalCount}
			pageCount={webHostsData.meta.lastPage}
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
		/>
	);
};
