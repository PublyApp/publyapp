import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
	Box,
	Button,
	CircularProgress,
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
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useToggle } from 'react-use';

import type { WebHost } from '@devist/shared/types/webHost.types';
import { getCreateWebHostInputSchema, type CreateWebHostInput } from '@devist/shared/validations/webHost.validations';
import BestTable, { CustomTableCell } from '@devist/ui-react/components/BestTable';
import TableHeaderCell from '@devist/ui-react/components/TableHeaderCell';
import { useCreateWebHost /* , useGetAITools */ } from '@devist/ui-react/query/features/webHosts/webHost.hooks';
import { pxToRem } from '@devist/ui-react/utils/cssUtils';
import i18n from '@devist/ui-react/utils/i18n';

const columnHelper = createColumnHelper<WebHost>();

const WebHostingProviders = () => {
	// const [pageIndex, setPageIndex] = useState<number>(0);
	// const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTION[50]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const [sorting, setSorting] = useState<SortingState>([]);

	const [openCreationRow, toggleOpenCreationRow] = useToggle(false);

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
			// columnHelper.accessor(
			// 	(row) => {
			// 		return row.pricingType;
			// 	},
			// 	{
			// 		id: 'pricingType',
			// 		// eslint-disable-next-line react/no-unstable-nested-components
			// 		header: (props) => {
			// 			return <TableHeaderCell ctx={props} label={props.column.id} />;
			// 		},
			// 		// eslint-disable-next-line react/no-unstable-nested-components
			// 		cell: (props) => {
			// 			return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
			// 		},
			// 	},
			// ),
			// columnHelper.accessor(
			// 	(row) => {
			// 		return row.pricingModel;
			// 	},
			// 	{
			// 		id: 'pricingModel',
			// 		// eslint-disable-next-line react/no-unstable-nested-components
			// 		header: (props) => {
			// 			return <TableHeaderCell ctx={props} label={props.column.id} />;
			// 		},
			// 		// eslint-disable-next-line react/no-unstable-nested-components
			// 		cell: (props) => {
			// 			return <Box /* bgcolor="red" */>{props.getValue()}</Box>;
			// 		},
			// 	},
			// ),
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

	// const {
	// 	result: { data: aiToolsData, isLoading },
	// } = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

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
			<BestTable
				columns={columns}
				data={/* aiToolsData?.aiTools ?? */ []}
				isLoading={/* isLoading */ false}
				rowsCount={/* aiToolsData?.meta.totalCount ?? */ 0}
				pageCount={/* aiToolsData?.meta.lastPage ?? */ 0}
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
