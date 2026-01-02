import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { inputBaseClasses } from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { textFieldClasses } from '@mui/material/TextField';
import {
	MRT_GlobalFilterTextField,
	type MRT_RowData,
	type MRT_TableInstance,
} from 'material-react-table';

import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';

import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../constants';
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
				className="empty-content"
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
				// Remove Paper border to avoid double border with table cells
				border: 'none',
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
		// Disable built-in pagination UI
		enablePagination: false,
		muiBottomToolbarProps: {
			sx: {
				bgcolor: theme.vars.palette.background.paper,
				alignItems: 'center',
				'& > .MuiBox-root': {
					px: 2,
				},
			},
		},
		// Custom pagination UI matching cursor preset design
		renderBottomToolbarCustomActions: ({ table }) => {
			const { t } = useTranslate();
			const { pagination } = table.getState();
			const totalPages = table.getPageCount();
			const currentPage = pagination.pageIndex + 1;

			return (
				<Box
					sx={{
						display: 'flex',
						gap: 2,
						alignItems: 'center',
						width: '100%',
					}}
				>
					{/* Page Size Selector */}
					<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
						<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
							{t('rows-per-page')}:
						</Box>
						<Select
							size="small"
							value={pagination.pageSize}
							onChange={(e) => {
								table.setPageSize(Number(e.target.value));
							}}
							sx={{ minWidth: 70 }}
							slotProps={{
								input: {
									sx: {
										padding: '4px 10px',
									},
								},
							}}
						>
							{DEFAULT_PAGE_SIZE_OPTIONS.map((size) => (
								<MenuItem key={size} value={size}>
									{size}
								</MenuItem>
							))}
						</Select>
					</Box>

					{/* Page Navigation */}
					<Box
						sx={{
							ml: 'auto',
							display: 'flex',
							gap: 1,
							justifyContent: 'center',
							alignItems: 'center',
						}}
					>
						<Box sx={{ typography: 'body2', color: 'text.secondary' }}>
							{t('page-x-of-y', { page: currentPage, total: totalPages })}
						</Box>

						<Box sx={{ display: 'flex', gap: 1 }}>
							<Button
								variant="outlined"
								size="small"
								onClick={() => table.previousPage()}
								disabled={!table.getCanPreviousPage()}
								startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
							>
								{t('previous')}
							</Button>
							<Button
								variant="outlined"
								size="small"
								onClick={() => table.nextPage()}
								disabled={!table.getCanNextPage()}
								endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
							>
								{t('next')}
							</Button>
						</Box>
					</Box>
				</Box>
			);
		},
		muiTableProps: {
			sx: {
				'& tr > th:last-of-type > .Mui-TableHeadCell-Content:has(.is-actions-column), & tr > td:last-of-type:not(:has(.empty-content)):has(.is-actions-column)':
					{
						justifyContent: 'flex-end',
					},
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
          options={{ stocks: PRODUCT_STOCK_OPTIONS, publish: PUBLISH_OPTIONS }}
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
