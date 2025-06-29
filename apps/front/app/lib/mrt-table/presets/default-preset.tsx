import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { inputBaseClasses } from '@mui/material/InputBase';
import { textFieldClasses } from '@mui/material/TextField';
import {
	MRT_GlobalFilterTextField,
	type MRT_RowData,
	type MRT_TableInstance,
} from 'material-react-table';
import type { TablePreset } from '../table-presets';

export const defaultTablePreset = (theme: Theme): TablePreset => {
	return {
		// columns,
		// data,
		layoutMode: 'grid',
		enableStickyHeader: true,
		enableRowSelection: true,
		enableColumnActions: false,
		sortDescFirst: true,
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
			showLoadingOverlay: false,
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
				bgcolor: theme.vars.palette.background.paper,
			},
		},
		muiTableContainerProps: {
			sx: {
				scrollbarWidth: 'unset',
				flexGrow: 1,
			},
		},
		muiTableHeadProps: {
			sx: {
				'& > tr > th': {
					bgcolor: theme.vars.palette.background.paper,
				},
			},
		},
		muiTableBodyProps: {
			sx: {
				'& > tr > td': {
					bgcolor: theme.vars.palette.background.paper,
				},
			},
		},
		muiPaginationProps: {
			showFirstButton: false,
			showLastButton: false,
			sx: {
				bgcolor: theme.vars.palette.background.paper,
			},
		},
		muiBottomToolbarProps: {
			sx: {
				bgcolor: theme.vars.palette.background.paper,
			},
		},
	};
};

// ----------------------------------------------------------------------

type CustomToolbarProps<TData extends MRT_RowData> = {
	onOpenConfirmDeleteRows: () => void;
	table: MRT_TableInstance<TData>;
};

const CustomToolbar = <TData extends MRT_RowData>({
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
