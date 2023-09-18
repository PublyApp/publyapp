import { useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
	Box,
	Button,
	FormControl,
	FormHelperText,
	// InputLabel,
	MenuItem,
	Select,
	TableRow,
	TextField,
	useTheme,
} from '@mui/material';
import { createColumnHelper, PaginationState, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useToggle } from 'react-use';

import { AITool, PRICING_MODELS, PRICING_TYPES } from '@aktiveo/shared/types/aiTool.types';
import { CreateAIToolInput, createAIToolInputSchema } from '@aktiveo/shared/validations/aiTool.validations';
import BestTable, { CustomTableCell } from '@aktiveo/ui-react/components/BestTable';
import TableHeaderCell from '@aktiveo/ui-react/components/TableHeaderCell';
import { GetAIToolsFunctionResult } from '@aktiveo/ui-react/query/features/aiTools/aiTool.actions';
import { useCreateAITool, useGetAITools } from '@aktiveo/ui-react/query/features/aiTools/aiTool.hooks';
import { pxToRem } from '@aktiveo/ui-react/utils/cssUtils';

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

	const [openCreationRow, toggleOpenCreationRow] = useToggle(false);

	const columns = useMemo<ColumnDef<AITool, any>[]>(() => {
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
					return row.name;
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
					return row.pricingType;
				},
				{
					id: 'pricingType',
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
					return row.pricingModel;
				},
				{
					id: 'pricingModel',
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
		result: { data: aiToolsData, isLoading },
	} = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

	return (
		<Box padding={pxToRem(32)} id={AI_TABLE_CONTAINER_ID}>
			<Button
				variant="contained"
				onClick={() => {
					toggleOpenCreationRow();
				}}
			>
				Add AI Tool
			</Button>
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
				// =======
				openCreationRowForm={openCreationRow}
				// eslint-disable-next-line @typescript-eslint/no-use-before-define
				creationRowForm={<AIToolCreationRowFrom />}
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

const AIToolCreationRowFrom = () => {
	const theme = useTheme();
	const form = useForm<CreateAIToolInput>({
		resolver: zodResolver(createAIToolInputSchema),
	});

	const {
		result: { mutate: createAITool },
	} = useCreateAITool();

	const onSubmit: SubmitHandler<CreateAIToolInput> = async (data) => {
		console.log('====================================');
		console.log(data);
		console.log('====================================');
		createAITool(data);
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
					{/* <TextField
						{...form.register('pricingType')}
						error={!!form.formState.errors.pricingType}
						helperText={form.formState.errors.pricingType?.message}
					/> */}
					<FormControl fullWidth>
						{/* <InputLabel id="demo-simple-select-label">Age</InputLabel> */}
						<Select
							// labelId="demo-simple-select-label"
							// id="demo-simple-select"
							// value={age}
							// label="Age"
							// onChange={handleChange}
							defaultValue={PRICING_TYPES[2]}
							{...form.register('pricingType', { value: PRICING_TYPES[2] })}
							error={!!form.formState.errors.pricingType}
							// helperText={form.formState.errors.pricingType?.message}
						>
							{PRICING_TYPES.map((type, index) => {
								return (
									// eslint-disable-next-line react/no-array-index-key
									<MenuItem key={index} value={type}>
										{type}
									</MenuItem>
								);
							})}
							{/* <MenuItem value={10}>Ten</MenuItem>
							<MenuItem value={20}>Twenty</MenuItem>
							<MenuItem value={30}>Thirty</MenuItem> */}
						</Select>
						{form.formState.errors.pricingType && typeof form.formState.errors.pricingType.message === 'string' && (
							<FormHelperText
								sx={{ color: theme.palette.error.main }}
								// children={form.formState.errors.pricingType.message}
							>
								{form.formState.errors.pricingType.message}
							</FormHelperText>
						)}
					</FormControl>
				</CustomTableCell>
				<CustomTableCell>
					{/* <TextField
						{...form.register('pricingType')}
						error={!!form.formState.errors.pricingType}
						helperText={form.formState.errors.pricingType?.message}
					/> */}
					<FormControl fullWidth>
						{/* <InputLabel id="demo-simple-select-label">Age</InputLabel> */}
						<Select
							// labelId="demo-simple-select-label"
							// id="demo-simple-select"
							// value={age}
							// label="Age"
							// onChange={handleChange}
							// value={PRICING_MODELS[2]}
							defaultValue={PRICING_MODELS[2]}
							{...form.register('pricingModel')}
							// value={pricingModelState}
							// value={form.getValues().pricingModel}
							error={!!form.formState.errors.pricingType}
							// helperText={form.formState.errors.pricingType?.message}
						>
							{PRICING_MODELS.map((type, index) => {
								return (
									// eslint-disable-next-line react/no-array-index-key
									<MenuItem key={index} value={type}>
										{type}
									</MenuItem>
								);
							})}
							{/* <MenuItem value={10}>Ten</MenuItem>
							<MenuItem value={20}>Twenty</MenuItem>
							<MenuItem value={30}>Thirty</MenuItem> */}
						</Select>
						{form.formState.errors.pricingModel && typeof form.formState.errors.pricingModel.message === 'string' && (
							<FormHelperText sx={{ color: theme.palette.error.main }}>
								{form.formState.errors.pricingModel.message}
							</FormHelperText>
						)}
					</FormControl>
				</CustomTableCell>
				<CustomTableCell>
					<Button variant="contained" color="info" onClick={form.handleSubmit(onSubmit)}>
						Save
					</Button>
				</CustomTableCell>
				{/* </Box> */}
			</TableRow>
		</>
	);
};
