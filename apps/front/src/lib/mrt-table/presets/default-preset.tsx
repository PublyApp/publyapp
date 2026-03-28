import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { MRT_TableInstance } from 'material-react-table';

import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../constants';
import { SharedTopToolbar } from '../components/shared-top-toolbar';
import type { TablePreset } from '../table-presets';
import type { CursorPaginationMeta } from '../types';

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
			return <SharedTopToolbar table={props.table} />;
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
				// border: 'none',
				boxShadow: theme.vars.customShadows.card,
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
		renderBottomToolbarCustomActions: ({ table }) => (
			<DefaultBottomToolbarActions table={table} />
		),
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

type DefaultBottomToolbarActionsProps = {
	table: MRT_TableInstance<Record<string, unknown>>;
};

const DefaultBottomToolbarActions = ({
	table,
}: DefaultBottomToolbarActionsProps) => {
	const { t } = useTranslate();
	const meta = (table.options.meta ?? {}) as CursorPaginationMeta | undefined;
	const { pagination } = table.getState();
	const totalPages = table.getPageCount();
	const currentPage = pagination.pageIndex + 1;
	const disablePaginationControls = meta?.disablePaginationControls ?? false;

	return (
		<Box
			sx={{
				display: 'flex',
				gap: 2,
				alignItems: 'center',
				width: '100%',
			}}
		>
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
					disabled={disablePaginationControls}
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
						disabled={disablePaginationControls || !table.getCanPreviousPage()}
						startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
					>
						{t('previous')}
					</Button>
					<Button
						variant="outlined"
						size="small"
						onClick={() => table.nextPage()}
						disabled={disablePaginationControls || !table.getCanNextPage()}
						endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
					>
						{t('next')}
					</Button>
				</Box>
			</Box>
		</Box>
	);
};
