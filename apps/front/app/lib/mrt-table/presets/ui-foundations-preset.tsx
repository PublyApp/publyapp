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

// UI Foundations border style - subtle, matches topbar/sidebar
// Light: 12% opacity, Dark: 8% opacity (matches appbar.tsx pattern)
const getBorderColor = (theme: Theme) =>
	varAlpha(theme.vars.palette.grey['500Channel'], 0.12);
const getBorderColorDark = (theme: Theme) =>
	varAlpha(theme.vars.palette.grey['500Channel'], 0.08);

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
			elevation: 0, // Remove Paper elevation/shadow
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
				boxShadow: 'none !important', // Force remove any shadow
			},
		},
		muiTableContainerProps: {
			sx: {
				scrollbarWidth: 'unset',
				flexGrow: 1,
				bgcolor: theme.vars.palette.background.default,
				boxShadow: 'none', // Remove any shadows
				// Thin border matching row separators (0.5px)
				borderTopWidth: 0.5,
				borderTopStyle: 'solid',
				borderTopColor: getBorderColor(theme),
				// Explicitly remove bottom border to prevent double border with bottom toolbar
				borderBottom: 'none',
				// Remove any internal table borders
				'& > table': {
					borderBottom: 'none',
					boxShadow: 'none',
				},
				...theme.applyStyles('dark', {
					borderTopColor: getBorderColorDark(theme),
				}),
			},
		},
		muiTableHeadProps: {
			sx: {
				boxShadow: 'none', // Remove any header shadows
				opacity: 1, // Force full opacity (MRT sets 0.97 by default for sticky header)
				// Header row
				'& > tr': {
					boxShadow: 'none',
				},
				// Header cells - same border as body cells for visual consistency
				'& > tr > th': {
					bgcolor: theme.vars.palette.background.default, // Match main background for sticky header
					// Same subtle border as body cells (0.5px)
					borderBottom: `0.5px solid ${getBorderColor(theme)} !important`,
					boxShadow: 'none',
					// Use flexbox to vertically center the content wrapper
					display: 'flex',
					// alignItems: 'center',
					justifyContent: 'center', // Vertical centering!! I checked!!!!
					// Consistent padding for all header cells
					py: 0.5,
					...theme.applyStyles('dark', {
						borderBottom: `0.5px solid ${getBorderColorDark(theme)} !important`,
					}),
				},
			},
		},
		muiTableBodyProps: {
			sx: {
				bgcolor: theme.vars.palette.background.default,
				opacity: 1, // Ensure full opacity for correct color rendering
				'& > tr > td': {
					bgcolor: 'transparent', // Allow row background to show through
				},
				// Error Row Style (Red stripes)
				'& .ui-foundations-row-error': {
					backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.06),
					// Striped pattern
					backgroundImage: `repeating-linear-gradient(
					45deg,
					transparent,
					transparent 6px,
					${varAlpha(theme.vars.palette.error.mainChannel, 0.06)} 6px,
					${varAlpha(theme.vars.palette.error.mainChannel, 0.06)} 12px
				)`,
					'&:hover': {
						backgroundColor: varAlpha(
							theme.vars.palette.error.mainChannel,
							0.1,
						),
					},
					'& td': {
						backgroundColor: 'transparent',
					},
				},
				// Disabled/Canceled Row Style (Gray stripes)
				'& .ui-foundations-row-disabled': {
					backgroundColor: varAlpha(
						theme.vars.palette.grey['500Channel'],
						0.04,
					),
					opacity: 0.8,
					// Striped pattern
					backgroundImage: `repeating-linear-gradient(
					45deg,
					transparent,
					transparent 6px,
					${varAlpha(theme.vars.palette.grey['500Channel'], 0.06)} 6px,
					${varAlpha(theme.vars.palette.grey['500Channel'], 0.06)} 12px
				)`,
					'&:hover': {
						backgroundColor: varAlpha(
							theme.vars.palette.grey['500Channel'],
							0.08,
						),
					},
					'& td': {
						backgroundColor: 'transparent',
					},
				},
			},
		},
		muiTableBodyCellProps: {
			sx: {
				// Ensure cells are transparent so row hover background shows through
				bgcolor: 'transparent !important',
				'&:hover': {
					bgcolor: 'transparent !important',
				},
				// Disable MRT's ::after pseudo-element overlay that causes color shift
				'&::after': {
					display: 'none !important',
				},
				// Remove focus outline
				'&:focus, &:focus-within': {
					outline: 'none',
				},
				// Thin border matching row separators (0.5px)
				borderBottom: `0.5px solid ${getBorderColor(theme)} !important`,
				...theme.applyStyles('dark', {
					borderBottom: `0.5px solid ${getBorderColorDark(theme)} !important`,
				}),
			},
		},
		muiTableBodyRowProps: ({ row, table }) => {
			// Helper logic to auto-apply classes if data matches common patterns
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
					opacity: 1, // Ensure full opacity for correct color rendering
					// Smooth transition for hover
					transition: theme.transitions.create('background-color', {
						duration: theme.transitions.duration.shorter,
					}),
					'&:focus, &:focus-within': {
						outline: 'none',
					},
					// Subtle hover effect - use grey[100] for visible contrast against default bg
					'&:hover': {
						bgcolor: `${theme.vars.palette.background.neutral} !important`,
					},
				},
			};
		},

		// -----------------------------------------------------------------
		// PAGINATION & TOOLBAR
		// -----------------------------------------------------------------

		enablePagination: false,
		muiBottomToolbarProps: {
			sx: {
				bgcolor: theme.vars.palette.background.default,
				alignItems: 'center',
				// Remove any border/shadow from outer toolbar
				border: 'none',
				boxShadow: 'none',
				// Target the inner MRT Box wrapper and apply thin border there
				'& > .MuiBox-root': {
					px: 2,
					// Thin border matching row separators (0.5px like table cells)
					borderTopWidth: 0.5,
					borderTopStyle: 'solid',
					borderTopColor: getBorderColor(theme),
					// Remove any box-shadow from inner element
					boxShadow: 'none',
					...theme.applyStyles('dark', {
						borderTopColor: getBorderColorDark(theme),
					}),
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
					<Box
						sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 'auto' }}
					>
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
								sx={{ height: 32, minWidth: 32, width: 32, px: 1 }}
							>
								<Iconify icon="eva:arrow-ios-back-fill" />
							</Button>
							<Button
								variant="outlined"
								size="small"
								onClick={() => table.nextPage()}
								disabled={!table.getCanNextPage()}
								sx={{ height: 32, minWidth: 32, width: 32, px: 1 }}
							>
								<Iconify icon="eva:arrow-ios-forward-fill" />
							</Button>
						</Box>
					</Box>
				</Box>
			);
		},
		muiTableProps: {
			sx: {
				bgcolor: theme.vars.palette.background.default,
				// Remove any default table border
				border: 'none',
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
