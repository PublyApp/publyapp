import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import _ from 'lodash';
import {
	MRT_GlobalFilterTextField,
	type MRT_RowData,
	type MRT_TableInstance,
} from 'material-react-table';
import { varAlpha } from 'minimal-shared/utils';

import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';

import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../constants';
import type { TablePreset } from '../table-presets';

export const uiFoundationsTablePreset = (theme: Theme): TablePreset => {
	return {
		layoutMode: 'grid',
		enableStickyHeader: true,
		enableRowSelection: true,
		enableColumnActions: false,
		sortDescFirst: true,
		// enableColumnFilters: false, // Default is fine
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
			density: 'comfortable', // Match the 'sm' breakpoint height (52px) better than 'compact'
		},

		// -----------------------------------------------------------------
		// STYLING PRESETS
		// -----------------------------------------------------------------

		muiTablePaperProps: {
			sx: {
				minHeight: 640,
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				height: '1px',
				bgcolor: theme.vars.palette.background.default,
				backgroundImage: 'none', // Remove elevation overlay in dark mode
				// No border for the paper itself
				border: 'none',
				boxShadow: 'none',
			},
		},
		muiTableContainerProps: {
			sx: {
				scrollbarWidth: 'unset',
				flexGrow: 1,
				bgcolor: theme.vars.palette.background.default,
				// Border top as seen in template Table.tsx
				borderTop: `1px solid ${theme.vars.palette.grey[200]}`,
			},
		},
		muiTableHeadProps: {
			sx: {
				// Transparent/Paper background for headers
				'& > tr > th': {
					bgcolor: theme.vars.palette.background.default, // Match main background for sticky header
					borderBottom: `1px solid ${theme.vars.palette.grey[200]}`,
					height: 48, // Template matchesSmBreakpoint ? 48 : 42
				},
			},
		},
		muiTableBodyProps: {
			sx: {
				bgcolor: theme.vars.palette.background.default,
				'& > tr > td': {
					bgcolor: theme.vars.palette.background.default, // Allow row background to show through
				},
				// Error Row Style (Red stripes)
				'& .ui-foundations-row-error': {
					backgroundColor:
						theme.vars.palette.error.lighter ||
						varAlpha(theme.vars.palette.error.mainChannel, 0.08),
					// Striped pattern
					backgroundImage: `repeating-linear-gradient(
						45deg,
						transparent,
						transparent 6px,
						${varAlpha(theme.vars.palette.error.mainChannel, 0.08)} 6px,
						${varAlpha(theme.vars.palette.error.mainChannel, 0.08)} 12px
					)`,
					'&:hover': {
						backgroundColor:
							theme.vars.palette.error.lighter ||
							varAlpha(theme.vars.palette.error.mainChannel, 0.12),
					},
					'& td': {
						backgroundColor: theme.vars.palette.background.default,
					},
				},
				// Disabled/Canceled Row Style (Gray stripes)
				'& .ui-foundations-row-disabled': {
					backgroundColor: theme.vars.palette.grey[100],
					opacity: 0.8,
					// Striped pattern
					backgroundImage: `repeating-linear-gradient(
						45deg,
						transparent,
						transparent 6px,
						${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)} 6px,
						${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)} 12px
					)`,
					'&:hover': {
						backgroundColor: theme.vars.palette.grey[200],
					},
					'& td': {
						backgroundColor: theme.vars.palette.background.default,
					},
				},
			},
		},
		muiTableBodyRowProps: ({ row }) => {
			// Helper logic to auto-apply classes if data matches common patterns
			// This makes it work "out of the box" for similar data structures
			const status = _.chain(row.original).get('status').toLower().value();
			let className = '';

			if (status === 'failed' || status === 'error') {
				className = 'ui-foundations-row-error';
			} else if (
				status === 'canceled' ||
				status === 'cancelled' ||
				status === 'disabled'
			) {
				className = 'ui-foundations-row-disabled';
			}

			return {
				className,
				sx: {
					bgcolor: theme.vars.palette.background.default,
					height: 52, // Template matchesSmBreakpoint ? 52 : 42
					// Remove focus outline
					'&:focus, &:focus-within': {
						outline: 'none',
					},
				},
			};
		},
		muiTableBodyCellProps: {
			sx: {
				// Remove focus outline
				'&:focus, &:focus-within': {
					outline: 'none',
				},
				borderBottom: `1px solid ${theme.vars.palette.grey[200]}`,
			},
		},

		// -----------------------------------------------------------------
		// PAGINATION & TOOLBAR
		// -----------------------------------------------------------------

		enablePagination: false,
		muiBottomToolbarProps: {
			sx: {
				bgcolor: theme.vars.palette.background.default,
				alignItems: 'center',
				borderTop: `1px solid ${theme.vars.palette.grey[200]}`,
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
				bgcolor: theme.vars.palette.background.default,
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
					// Keep search bar compact
					[`& .${'MuiTextField-root'}`]: {
						// Using string literal if class not imported
						minWidth: '200px',
					},
				};
			}}
		>
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
			</Box>
		</Box>
	);
};
