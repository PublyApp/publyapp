import { EmptyContent } from '@/front/components/empty-content/empty-content';
import type { TablePreset } from '../table-presets';
import Box from '@mui/material/Box';
import { textFieldClasses } from '@mui/material/TextField';
import { inputBaseClasses } from '@mui/material/InputBase';
import {
	MRT_GlobalFilterTextField,
	type MRT_RowData,
	type MRT_TableInstance,
} from 'material-react-table';
import Button from '@mui/material/Button';
import { Iconify } from '@/front/components/iconify/iconify';

export const defaultTablePreset: TablePreset = {
	// columns,
	// data,
	enableStickyHeader: true,
	enableRowSelection: true,
	enableColumnActions: false,
	// enableColumnFilters: false,
	// enableDensityToggle: false,
	// enableFullScreenToggle: false,
	// enableHiding: false,
	// enableGlobalFilter: true,
	// enableColumnResizing: true,
	// enableTopToolbar: true,
	renderEmptyRowsFallback: () => (
		<EmptyContent
			sx={{
				minHeight: 400,
			}}
		/>
	),
	renderTopToolbar: (props) => {
		return (
			<CustomToolbar
				table={props.table}
				onOpenConfirmDeleteRows={(): void => {
					throw new Error('Function not implemented.');
				}}
			/>
		);
	},
	state: {
		showGlobalFilter: true,
		density: 'spacious',
	},
	muiTablePaperProps: {
		sx: {
			minHeight: 640,
			flexGrow: 1,
			display: 'flex',
			flexDirection: 'column',
			height: '1px',
		},
	},
	muiTableContainerProps: {
		sx: {
			scrollbarWidth: 'unset',
			flexGrow: 1,
		},
	},
	muiPaginationProps: {
		showFirstButton: false,
		showLastButton: false,
	},
	// muiBottomToolbarProps: {
	// 	sx: {
	// 		position: 'fixed',
	// 		bottom: 0,
	// 	},
	// },
};

// ----------------------------------------------------------------------

// declare module '@mui/x-data-grid' {
//   interface ToolbarPropsOverrides {
//     setFilterButtonEl: React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>;
//   }
// }

type CustomToolbarProps<TData extends MRT_RowData> =
	/* GridSlotProps['toolbar'] & */ {
		// canReset: boolean;
		// filteredResults: number;
		// selectedRowIds: string[] /* GridRowSelectionModel */;
		// filters: UseSetStateReturn<IProductTableFilters>;

		onOpenConfirmDeleteRows: () => void;

		table: MRT_TableInstance<TData>;
	};

const CustomToolbar = <TData extends MRT_RowData>({
	// filters,
	// canReset,
	// selectedRowIds,
	// filteredResults,
	// setFilterButtonEl,
	onOpenConfirmDeleteRows,
	table,
}: CustomToolbarProps<TData>) => {
	const selectedRowsCount = table.getSelectedRowModel().rows.length;

	return (
		<Box
			sx={(theme) => {
				return {
					display: 'flex',
					gap: theme.spacing(2),
					padding: theme.spacing(2),
					[`& .${textFieldClasses.root}`]: {
						padding: 0,
						width: '100%',
						[`& .${inputBaseClasses.input}`]: {
							paddingTop: theme.spacing(2),
							paddingBottom: theme.spacing(2),
						},
						[theme.breakpoints.up('md')]: { width: 'unset' },
					},
				};
			}}
		>
			{/* <GridToolbarContainer> */}
			{/* <ProductTableToolbar
          filters={filters}
          options={{ stocks: PRODUCT_STOCK_OPTIONS, publishs: PUBLISH_OPTIONS }}
        /> */}

			{/* <GridToolbarQuickFilter /> */}
			<MRT_GlobalFilterTextField table={table} />

			<Box
				sx={{
					gap: 1,
					flexGrow: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-end',
				}}
			>
				{!!selectedRowsCount && (
					<Button
						size="small"
						color="error"
						startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
						onClick={onOpenConfirmDeleteRows}
					>
						Delete ({selectedRowsCount})
					</Button>
				)}

				{/* <GridToolbarColumnsButton /> */}
				{/* <GridToolbarFilterButton ref={setFilterButtonEl} /> */}
				{/* <GridToolbarExport /> */}
			</Box>
			{/* </GridToolbarContainer> */}
			{/* {canReset && (
				<ProductTableFiltersResult
					filters={filters}
					totalResults={filteredResults}
					sx={{ p: 2.5, pt: 0 }}
				/>
			)} */}
		</Box>
	);
};
