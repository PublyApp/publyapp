import {
	createContext,
	useContext,
	useEffect,
	useMemo /* Suspense,  useEffect, */ /* useState, */,
	useRef,
	type Dispatch,
	type SetStateAction,
} from 'react';

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
// import qs from 'query-string';
// import qs from 'qs';
// import type { Draft } from 'immer';
// import _ from 'lodash';
// import _ from 'lodash';
// import { ErrorBoundary, type ErrorBoundaryProps } from 'react-error-boundary';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
	// ArrayParam,
	JsonParam,
	NumberParam,
	// ObjectParam,
	// StringParam,
	useQueryParam,
	useQueryParams,
	withDefault,
} from 'use-query-params';
// import { toast } from 'react-toastify';
// import { useToggle } from 'react-use';
// import type { Draft } from 'use-immer';
import { /* create, */ createStore, useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { WebHost } from '@devist/shared/types/webHost.types';
import {
	/* getCreateWebHostInputSchema, type CreateWebHostInput */
	getSaveWebHostInputSchema,
	type SaveWebHostInput,
} from '@devist/shared/validations/webHost.validations';
import BestTable, { CustomTableCell, ROWS_PER_PAGE_OPTION } from '@devist/ui-react/components/BestTable';
import TableActionsCell from '@devist/ui-react/components/TableActionsCell';
import TableHeaderCell from '@devist/ui-react/components/TableHeaderCell';
import TableRowCell from '@devist/ui-react/components/TableRowCell';
import { useGetWebHosts, useSaveWebHost } from '@devist/ui-react/query/features/webHosts/webHost.hooks';
import { pxToRem } from '@devist/ui-react/utils/cssUtils';

import { ENABLE_TABLE_INLINE_EDITING } from '@ui-react/utils/constants';

// import i18n from '@devist/ui-react/utils/i18n';

// @link https://muhimasri.com/blogs/react-editable-table/

// import { TableLoader } from '@office/components/loaders/TableLoader';

// const GenericParam = {
// 	encode: (obj: any) => {
// 		return qs.stringify(obj, { encode: false });
// 	},
// 	decode: (str: string) => {
// 		return qs.parse(str);
// 	},
// };

// type WebHostStore = {
// 	openCreationRow: boolean;
// 	editedRows: RowSelectionState;
// 	editDialogOpen: boolean;
// 	sorting: SortingState;
// 	pagination: PaginationState;
// 	dialogEditedRow: Row<WebHost> | undefined;
// 	toggleOpenCreationRow: () => void;
// 	setEditedRows: Dispatch<SetStateAction<RowSelectionState>>;
// 	toggleEditDialog: () => void;
// 	setSorting: Dispatch<SetStateAction<SortingState>>;
// 	setPagination: Dispatch<SetStateAction<PaginationState>>;
// 	setDialogEditedRow: Dispatch<SetStateAction<Row<WebHost> | undefined>>;
// };

type SetType<T> = Parameters<Parameters<typeof immer<T>>[0]>[0];

// @link https://stackoverflow.com/a/70123495/15003148
// eslint-disable-next-line @typescript-eslint/ban-types
const isCallback = (maybeFunction: unknown): maybeFunction is Function => {
	return typeof maybeFunction === 'function';
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createSetter = <T extends Record<string, unknown>>(
	set: SetType<T>,
	key: keyof T,
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
): Dispatch<SetStateAction<T[key]>> => {
	return (s) => {
		set((state) => {
			if (isCallback(s)) {
				// eslint-disable-next-line no-param-reassign
				(state as T)[key] = s((state as T)[key]);
				return;
			}

			// eslint-disable-next-line no-param-reassign
			(state as T)[key] = s;
		});
	};
};

// const useWebHostStore = create<WebHostStore>()(
// 	immer((set) => {
// 		return {
// 			openCreationRow: Boolean(false),
// 			editedRows: {} as RowSelectionState,
// 			editDialogOpen: Boolean(false),
// 			sorting: [] as SortingState,
// 			pagination: {
// 				pageIndex: 0,
// 				pageSize: Number(ROWS_PER_PAGE_OPTION[5]),
// 			},
// 			dialogEditedRow: undefined,
// 			// ACTIONS
// 			toggleOpenCreationRow: () => {
// 				set((state) => {
// 					// eslint-disable-next-line no-param-reassign
// 					state.openCreationRow = !state.openCreationRow; // ? because we are using zustand's  immer middleware
// 				});
// 			},
// 			setEditedRows: createSetter<WebHostStore>(set, 'editedRows'),
// 			toggleEditDialog: () => {
// 				set((state) => {
// 					// eslint-disable-next-line no-param-reassign
// 					state.editDialogOpen = !state.editDialogOpen; // ? because we are using zustand's  immer middleware
// 				});
// 			},
// 			setSorting: createSetter<WebHostStore>(set, 'sorting'),
// 		setPagination: createSetter<WebHostStore>(set, 'pagination'),
// 			setDialogEditedRow: createSetter<WebHostStore>(set, 'dialogEditedRow'),
// 		};
// 	}),
// );

type CreateWebHostStoreProps = {
	openCreationRow: boolean;
	editedRows: RowSelectionState;
	editDialogOpen: boolean;
	sorting: SortingState;
	pagination: PaginationState;
	dialogEditedRow: Row<WebHost> | undefined;
};

type WebHostState = CreateWebHostStoreProps & {
	toggleOpenCreationRow: () => void;
	setEditedRows: Dispatch<SetStateAction<RowSelectionState>>;
	toggleEditDialog: () => void;
	setSorting: Dispatch<SetStateAction<SortingState>>;
	setPagination: Dispatch<SetStateAction<PaginationState>>;
	setDialogEditedRow: Dispatch<SetStateAction<Row<WebHost> | undefined>>;
};

type WebHostStore = ReturnType<typeof createWebHostStore>;

const createWebHostStore = (initialProps?: Partial<CreateWebHostStoreProps>) => {
	const DEFAULT_PROPS: CreateWebHostStoreProps = {
		openCreationRow: Boolean(false),
		editedRows: {} as RowSelectionState,
		editDialogOpen: Boolean(false),
		sorting: [] as SortingState,
		pagination: {
			pageIndex: 0,
			pageSize: Number(ROWS_PER_PAGE_OPTION[5]),
		},
		dialogEditedRow: undefined,
	};

	// const a = {
	// 	...DEFAULT_PROPS,
	// 	...initialProps,
	// };
	// console.log('====================================');
	// console.log('a', a);
	// console.log('====================================');

	return createStore<WebHostState>()(
		immer((set) => {
			return {
				...DEFAULT_PROPS,
				...initialProps,
				// ACTIONS
				toggleOpenCreationRow: () => {
					set((state) => {
						// eslint-disable-next-line no-param-reassign
						state.openCreationRow = !state.openCreationRow; // ? because we are using zustand's  immer middleware
					});
				},
				setEditedRows: createSetter<WebHostState>(set, 'editedRows'),
				toggleEditDialog: () => {
					set((state) => {
						// eslint-disable-next-line no-param-reassign
						state.editDialogOpen = !state.editDialogOpen; // ? because we are using zustand's  immer middleware
					});
				},
				setSorting: createSetter<WebHostState>(set, 'sorting'),
				setPagination: createSetter<WebHostState>(set, 'pagination'),
				setDialogEditedRow: createSetter<WebHostState>(set, 'dialogEditedRow'),
			};
		}),
	);
};

// const createWebHostStore = () =>

type WebHostURLQueryParams = {
	pagination?: PaginationState;
	sorting?: SortingState;
};

const useWebHostQueryParams = () => {
	// const [paginationParam, setPaginationParam] = useQueryParam<WebHostURLQueryParams['pagination']>(
	// 	'pagination',
	// 	GenericParam,
	// );
	const [paginationParam, setPaginationParam] = useQueryParams({
		pageIndex: withDefault(NumberParam, 0),
		pageSize: withDefault(NumberParam, ROWS_PER_PAGE_OPTION[5]),
	});
	const [sortingParam, setSortingParam] = useQueryParam<WebHostURLQueryParams['sorting']>('sorting', JsonParam);
	// useQueryParams [sortingParam, setSortingParam] = useQuery

	return {
		paginationParam,
		setPaginationParam,
		sortingParam,
		setSortingParam,
	};
};

const WebHosts = () => {
	// const {
	// 	toggleOpenCreationRow,
	// 	setDialogEditedRow,
	// 	toggleEditDialog,
	// 	// setPagination,
	// 	// setSorting,
	// 	pagination,
	// 	sorting,
	// } = useWebHostStore();
	const {
		toggleOpenCreationRow,
		setDialogEditedRow,
		toggleEditDialog,
		// setPagination,
		// setSorting,
		// pagination,
		// sorting,
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
	} = useWebHostContext();
	// const { /* paginationParam, */ setPaginationParam, /* sortingParam, */ setSortingParam } = useWebHostQueryParams();

	// useEffect(() => {
	// 	// console.log('rerender AAA');
	// 	if (paginationParam) {
	// 		setPagination(paginationParam);
	// 	}

	// 	if (sortingParam) {
	// 		setSorting(sortingParam);
	// 	}
	// }, [paginationParam, sortingParam, setPagination, setSorting]);
	// useEffect(() => {
	// 	setPaginationParam(pagination);
	// 	setSortingParam(sorting);
	// }, [pagination, setPaginationParam, setSortingParam, sorting]);

	return (
		<Box padding={pxToRem(32)} /* id={AI_TABLE_CONTAINER_ID} */>
			<Button
				disabled={!ENABLE_TABLE_INLINE_EDITING}
				variant="contained"
				onClick={() => {
					// setNum(_.isNumber(num) ? num + 1 : 0);
					toggleOpenCreationRow();
				}}
			>
				Add (inline)
			</Button>
			<Button
				// disabled={!ENABLE_TABLE_INLINE_EDITING}
				variant="contained"
				onClick={() => {
					setDialogEditedRow(undefined);
					toggleEditDialog();
				}}
			>
				Add
			</Button>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<WebHostsTable />
		</Box>
	);
};

// export default WebHosts;

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

// type WebHostsTableProps = { openCreationRow: boolean };

const columnHelper = createColumnHelper<WebHost>();

const WebHostsTable = (/* { openCreationRow }: WebHostsTableProps */) => {
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

	// const {
	// 	dialogEditedRow,
	// 	pagination,
	// 	sorting,
	// 	toggleEditDialog,
	// 	setPagination,
	// 	setSorting,
	// 	openCreationRow,
	// 	editedRows,
	// 	setEditedRows,
	// 	setDialogEditedRow,
	// 	editDialogOpen,
	// } = useWebHostStore();
	const {
		dialogEditedRow,
		pagination,
		sorting,
		toggleEditDialog,
		setPagination,
		setSorting,
		openCreationRow,
		editedRows,
		setEditedRows,
		setDialogEditedRow,
		editDialogOpen,
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
	} = useWebHostContext();

	useEffect(() => {
		console.log('rerender BBB');
	}, []);

	const {
		result: { data: webHostsData, isFetching: isWebHostListFetching, refetch: refetchWebHostList },
	} = useGetWebHosts({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting });

	const dialogRowData = dialogEditedRow?.original;

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
		if (editDialogOpen) {
			toggleEditDialog();
		}

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
		successMessage: 'TODO: Fucking Success message',
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
				openCreationRowForm={ENABLE_TABLE_INLINE_EDITING ? openCreationRow : false}
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
				<DialogTitle>{dialogRowData ? 'Update web host' : 'Create a web host'}</DialogTitle>
				<DialogContent>
					{dialogRowData && <DialogContentText>modify Web Host with id {dialogRowData?.objectId}</DialogContentText>}
					<Box>
						<TextField
							{...form.register('name')}
							error={!!form.formState.errors.name}
							helperText={form.formState.errors.name?.message}
						/>
					</Box>
					<Box>
						<TextField
							{...form.register('description')}
							error={!!form.formState.errors.description}
							helperText={form.formState.errors.description?.message}
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleEditDialogCancel}>Cancel</Button>
					<Button onClick={handleEditDialogSave} disabled={!form.formState.isDirty}>
						{isSaveWebHostPending ? <CircularProgress size={16} /> : 'save'}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

const QueryParamsSync = () => {
	const {
		// toggleOpenCreationRow,
		// setDialogEditedRow,
		// toggleEditDialog,
		// setPagination,
		// setSorting,
		pagination,
		sorting,
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
	} = useWebHostContext();

	const { /* paginationParam, */ setPaginationParam, /* sortingParam, */ setSortingParam } = useWebHostQueryParams();
	useEffect(() => {
		setPaginationParam(pagination);
		setSortingParam(sorting);
	}, [pagination, setPaginationParam, setSortingParam, sorting]);

	return null;
};

// --------------------------------------------------------------------------------------//
//                                   The Page wrapper                                   //
// --------------------------------------------------------------------------------------//

const WebHostContext = createContext<WebHostStore | null>(null);

function useWebHostContext(selector?: undefined): WebHostState;
function useWebHostContext<T>(selector?: ((state: WebHostState) => T) | undefined): T {
	const store = useContext(WebHostContext);
	if (!store) throw new Error('Missing WebHostContext.Provider in the tree');

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return useStore(store, selector!);
}

const Page = () => {
	const { paginationParam, sortingParam } = useWebHostQueryParams();

	// console.log('====================================');
	// console.log('AAAAA', _.omitBy(paginationParam, _.isNil));
	// console.log('====================================');

	const store = useRef(
		createWebHostStore({
			pagination: paginationParam,
			sorting: sortingParam,
		}),
	).current;

	// useEffect(() => {
	// 	setPaginationParam(pagination);
	// 	setSortingParam(sorting);
	// }, [pagination, setPaginationParam, setSortingParam, sorting]);

	return (
		<WebHostContext.Provider value={store}>
			<QueryParamsSync />
			<WebHosts />
		</WebHostContext.Provider>
	);
};

export default Page;
