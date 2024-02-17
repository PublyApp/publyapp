import { useCallback, useEffect, useState } from 'react';

import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import {
	DataGrid,
	GridActionsCellItem,
	GridToolbarColumnsButton,
	GridToolbarContainer,
	GridToolbarExport,
	GridToolbarFilterButton,
	GridToolbarQuickFilter,
	type GridColDef,
	type GridColumnVisibilityModel,
	type GridRowSelectionModel,
} from '@mui/x-data-grid';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import { useSnackbar } from 'notistack';

// import { PRODUCT_STOCK_OPTIONS } from '@/office/_mock';
// import { useGetProducts } from '@/office/api/product';
// import CustomBreadcrumbs from '@/office/components/custom-breadcrumbs';
// import { ConfirmDialog } from '@/office/components/custom-dialog';
import EmptyContent from '@/office/components/EmptyContent';
import PageHeader from '@/office/components/PageHeader';
import RouterLink from '@/office/components/RouterLink';
import { selectPosts, selectSetPosts } from '@/office/lib/zustand/features/post.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
// import Iconify from '@/office/components/iconify';
// import { useSettingsContext } from '@/office/components/settings';
// import { useSnackbar } from '@/office/components/snackbar';
// import { useBoolean } from '@/office/hooks/use-boolean';
// import { RouterLink } from '@/office/routes/components';
// import { useRouter } from '@/office/routes/hooks';
// import { paths } from '@/office/routes/paths';
import Iconify from '@/ui-react/components/Iconify';
import useBoolean from '@/ui-react/hooks/useBoolean';
import useRouter from '@/ui-react/hooks/useRouter';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useFindPostQuery } from '@/ui-react/lib/react-query/features/posts/post.hooks';
import type { IProductTableFilters } from '@/ui-react/types/product';

import ProductTableFiltersResult from './ProductTableFiltersResult';
import {
	RenderCellCreatedAt,
	RenderCellPrice,
	RenderCellProduct,
	RenderCellPublish,
	// RenderCellStock,
} from './ProductTableRow';
import ProductTableToolbar from './ProductTableToolbar';

// import { IProductItem, IProductTableFilters, IProductTableFilterValue } from '@/office/types/product';

// ----------------------------------------------------------------------

const PUBLISH_OPTIONS = [
	{ value: 'published', label: 'Published' },
	{ value: 'draft', label: 'Draft' },
];

const defaultFilters: IProductTableFilters = {
	publish: [],
	stock: [],
};

const HIDE_COLUMNS = {
	category: false,
};

const HIDE_COLUMNS_TOGGLABLE = ['category', 'actions'];

export const PRODUCT_STOCK_OPTIONS = [
	{ value: 'in stock', label: 'In stock' },
	{ value: 'low stock', label: 'Low stock' },
	{ value: 'out of stock', label: 'Out of stock' },
];

// ----------------------------------------------------------------------

const ProductListView = () => {
	const { t } = useTranslate();

	const { enqueueSnackbar } = useSnackbar();

	const confirmRows = useBoolean();

	const router = useRouter();

	// const settings = useSettingsContext();

	// const { products, productsLoading } = useGetProducts();
	const {
		result: { data: findPostData, /* isLoading: isFindPostLoading, */ isFetching: isFindPostFetching },
	} = useFindPostQuery({ params: {} });

	// const [tableData, setTableData] = useState<IProductItem[]>([]);

	const [filters, setFilters] = useState(defaultFilters);

	const [selectedRowIds, setSelectedRowIds] = useState<GridRowSelectionModel>([]);

	const [columnVisibilityModel, setColumnVisibilityModel] = useState<GridColumnVisibilityModel>(HIDE_COLUMNS);

	const posts = useMainStore(selectPosts);
	const setPosts = useMainStore(selectSetPosts);

	useEffect(() => {
		if (findPostData?.length) {
			// setTableData(products);
			setPosts(findPostData);
		}
	}, [findPostData, setPosts]);

	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	// const dataFiltered = applyFilter({
	// 	inputData: tableData,
	// 	filters,
	// });
	// const dataFiltered: any[] = [];

	const canReset = !_.isEqual(defaultFilters, filters);

	const handleFilters = useCallback((name: string, value: IProductTableFilterValue) => {
		setFilters((prevState) => {
			return {
				...prevState,
				[name]: value,
			};
		});
	}, []);

	const handleResetFilters = useCallback(() => {
		setFilters(defaultFilters);
	}, []);

	const handleDeleteRow = useCallback(
		(_id: string) => {
			// const deleteRow = tableData.filter((row) => {
			// 	return row.id !== id;
			// });

			enqueueSnackbar('Delete success!');

			// setTableData(deleteRow);
		},
		[enqueueSnackbar /* , tableData */],
	);

	// const handleDeleteRows = useCallback(() => {
	// 	// const deleteRows = tableData.filter((row) => {
	// 	// 	return !selectedRowIds.includes(row.id);
	// 	// });

	// 	enqueueSnackbar('Delete success!');

	// 	// setTableData(deleteRows);
	// }, [enqueueSnackbar /* , selectedRowIds, tableData */]);

	const handleEditRow = useCallback(
		(id: string) => {
			router.push(BO_PATH_NAMES.dashboard.posts.edit(id));
		},
		[router],
	);

	const handleViewRow = useCallback(
		(id: string) => {
			router.push(BO_PATH_NAMES.dashboard.posts.details(id));
		},
		[router],
	);

	const columns: GridColDef[] = [
		// {
		// 	field: 'category',
		// 	headerName: 'Category',
		// 	filterable: false,
		// },
		{
			field: 'title',
			headerName: 'Product',
			flex: 1,
			minWidth: 360,
			hideable: false,
			renderCell: (params) => {
				return <RenderCellProduct params={params} />;
			},
		},
		{
			field: 'createdAt',
			headerName: t('created-at'),
			width: 160,
			renderCell: (params) => {
				return <RenderCellCreatedAt params={params} />;
			},
		},
		// {
		// 	field: 'inventoryType',
		// 	headerName: 'Stock',
		// 	width: 160,
		// 	type: 'singleSelect',
		// 	valueOptions: PRODUCT_STOCK_OPTIONS,
		// 	renderCell: (params) => {
		// 		return <RenderCellStock params={params} />;
		// 	},
		// },
		{
			field: 'price',
			headerName: t('common:views'),
			width: 140,
			editable: true,
			renderCell: (params) => {
				return <RenderCellPrice params={params} />;
			},
		},
		{
			field: 'publish',
			headerName: 'Publish',
			width: 110,
			type: 'singleSelect',
			editable: true,
			valueOptions: PUBLISH_OPTIONS,
			renderCell: (params) => {
				return <RenderCellPublish params={params} />;
			},
		},
		{
			type: 'actions',
			field: 'actions',
			headerName: ' ',
			align: 'right',
			headerAlign: 'right',
			width: 80,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			getActions: (params) => {
				return [
					<GridActionsCellItem
						key={nanoid()}
						showInMenu
						icon={<Iconify icon="solar:eye-bold" />}
						label="View"
						onClick={() => {
							return handleViewRow(params.row.id);
						}}
					/>,
					<GridActionsCellItem
						key={nanoid()}
						showInMenu
						icon={<Iconify icon="solar:pen-bold" />}
						label="Edit"
						onClick={() => {
							return handleEditRow(params.row.id);
						}}
					/>,
					<GridActionsCellItem
						key={nanoid()}
						showInMenu
						icon={<Iconify icon="solar:trash-bin-trash-bold" />}
						label="Delete"
						onClick={() => {
							handleDeleteRow(params.row.id);
						}}
						sx={{ color: 'error.main' }}
					/>,
				];
			},
		},
	];

	const getTogglableColumns = () => {
		return columns
			.filter((column) => {
				return !HIDE_COLUMNS_TOGGLABLE.includes(column.field);
			})
			.map((column) => {
				return column.field;
			});
	};

	return (
		<>
			<Container
				maxWidth={/* settings.themeStretch ? false :  */ 'lg'}
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<PageHeader
					heading="List"
					// links={[
					// 	{ name: 'Dashboard', href: paths.dashboard.root },
					// 	{
					// 		name: 'Product',
					// 		href: paths.dashboard.product.root,
					// 	},
					// 	{ name: 'List' },
					// ]}
					breadcrumbs={
						<PageHeader.Breadcrumbs
							links={[
								{ name: 'Dashboard', href: BO_PATH_NAMES.dashboard.root },
								{
									name: 'Posts',
									href: BO_PATH_NAMES.dashboard.posts.root,
								},
								{ name: 'List' },
							]}
							// links={links}
							/* separator=">" */ /* sx={{ marginBottom: '22px' }} */
						/>
					}
					action={
						<Button
							component={RouterLink}
							href={BO_PATH_NAMES.dashboard.posts.create}
							variant="contained"
							startIcon={<Iconify icon="mingcute:add-line" />}
						>
							{/* New Post */}
							{t('common:new-post')}
						</Button>
					}
					sx={{
						mb: {
							xs: 3,
							md: 5,
						},
					}}
				/>

				<Card
					sx={{
						height: { xs: 800, md: 2 },
						flexGrow: { md: 1 },
						display: { md: 'flex' },
						flexDirection: { md: 'column' },
					}}
				>
					<DataGrid
						getRowId={(row) => {
							return row.objectId;
						}}
						checkboxSelection
						disableRowSelectionOnClick
						// rows={dataFiltered}
						rows={posts}
						columns={columns}
						loading={isFindPostFetching}
						getRowHeight={() => {
							return 'auto';
						}}
						pageSizeOptions={[5, 10, 25]}
						initialState={{
							pagination: {
								paginationModel: { pageSize: 10 },
							},
						}}
						onRowSelectionModelChange={(newSelectionModel) => {
							setSelectedRowIds(newSelectionModel);
						}}
						columnVisibilityModel={columnVisibilityModel}
						onColumnVisibilityModelChange={(newModel) => {
							return setColumnVisibilityModel(newModel);
						}}
						slots={{
							// eslint-disable-next-line react/no-unstable-nested-components
							toolbar: () => {
								return (
									<>
										<GridToolbarContainer>
											<ProductTableToolbar
												filters={filters}
												onFilters={handleFilters}
												stockOptions={PRODUCT_STOCK_OPTIONS}
												publishOptions={PUBLISH_OPTIONS}
											/>

											<GridToolbarQuickFilter />

											<Stack spacing={1} flexGrow={1} direction="row" alignItems="center" justifyContent="flex-end">
												{!!selectedRowIds.length && (
													<Button
														size="small"
														color="error"
														startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
														onClick={confirmRows.setTrue}
													>
														Delete ({selectedRowIds.length})
													</Button>
												)}

												<GridToolbarColumnsButton />
												<GridToolbarFilterButton />
												<GridToolbarExport />
											</Stack>
										</GridToolbarContainer>

										{canReset && (
											<ProductTableFiltersResult
												filters={filters}
												onFilters={handleFilters}
												onResetFilters={handleResetFilters}
												// results={dataFiltered.length}
												results={posts.length}
												sx={{ p: 2.5, pt: 0 }}
											/>
										)}
									</>
								);
							},
							// eslint-disable-next-line react/no-unstable-nested-components
							noRowsOverlay: () => {
								return <EmptyContent title="No Data" />;
							},
							// eslint-disable-next-line react/no-unstable-nested-components
							noResultsOverlay: () => {
								return <EmptyContent title="No results found" />;
							},
						}}
						slotProps={{
							columnsPanel: {
								getTogglableColumns,
							},
						}}
					/>
				</Card>
			</Container>

			{/* <ConfirmDialog
				open={confirmRows.value}
				onClose={confirmRows.onFalse}
				title="Delete"
				content={
					<>
						Are you sure want to delete <strong> {selectedRowIds.length} </strong> items?
					</>
				}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => {
							handleDeleteRows();
							confirmRows.onFalse();
						}}
					>
						Delete
					</Button>
				}
			/> */}
		</>
	);
};

export default ProductListView;

// ----------------------------------------------------------------------

// const applyFilter = ({ inputData, filters }: { inputData: IProductItem[]; filters: IProductTableFilters }) => {
// 	const { stock, publish } = filters;

// 	if (stock.length) {
// 		inputData = inputData.filter((product) => {
// 			return stock.includes(product.inventoryType);
// 		});
// 	}

// 	if (publish.length) {
// 		inputData = inputData.filter((product) => {
// 			return publish.includes(product.publish);
// 		});
// 	}

// 	return inputData;
// };
