import type { Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import type { MRT_TableInstance } from 'material-react-table';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';

import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../constants';
import type { TablePreset } from '../table-presets';
import type { CursorPaginationMeta } from '../types';
import { defaultTablePreset } from './default-preset';

/**
 * Default cursor pagination preset for Material React Table
 *
 * This preset provides a complete cursor-based pagination UI with:
 * - Page size selector
 * - Previous/Next navigation buttons
 * - Current page indicator
 *
 * Usage:
 * ```tsx
 * const table = useMRTTable('default-cursor', {
 *   columns,
 *   data: dataTable,
 *   manualSorting: true,
 *   onSortingChange: handleSortingChange,
 *   state: { ...tableState, isLoading: isPending },
 *   meta: {
 *     handlePaginationChange,
 *     hasNextPage,
 *     hasPreviousPage,
 *     isPending,
 *   },
 * });
 * ```
 */
export const defaultCursorPreset = (theme: Theme): TablePreset => {
	const basePreset = defaultTablePreset(theme);

	return {
		...basePreset,
		// Disable MRT's built-in pagination
		enablePagination: false,
		// Configure bottom toolbar styling
		muiBottomToolbarProps: {
			sx: {
				bgcolor: theme.vars.palette.background.paper,
				alignItems: 'center',
				'& > .MuiBox-root': {
					px: 2,
				},
			},
		},
		// Render custom cursor pagination UI
		renderBottomToolbarCustomActions: ({ table }) => (
			<DefaultCursorBottomToolbarActions table={table} />
		),
	};
};

type DefaultCursorBottomToolbarActionsProps = {
	table: MRT_TableInstance<Record<string, unknown>>;
};

const DefaultCursorBottomToolbarActions = ({
	table,
}: DefaultCursorBottomToolbarActionsProps) => {
	const { t } = useTranslate();
	const meta = table.options.meta as CursorPaginationMeta | undefined;

	if (!meta) {
		logger.warn(
			'CursorPaginationMeta not found in table.options.meta. Please pass handlePaginationChange, hasNextPage, hasPreviousPage, and isPending via the meta prop.',
		);
	}

	const { handlePaginationChange, hasNextPage, hasPreviousPage, isPending } =
		meta || {};
	const { pagination } = table.getState();
	const disablePaginationControls = meta?.disablePaginationControls ?? false;
	const disabledControlsReason = t('selection-mode-disable-pagination', {
		defaultValue: 'Clear the current selection to change pagination.',
	});

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
				<Tooltip
					title={disablePaginationControls ? disabledControlsReason : ''}
					arrow
					disableHoverListener={!disablePaginationControls}
				>
					<Box component="span">
						<Select
							size="small"
							value={pagination.pageSize}
							onChange={(e) => {
								handlePaginationChange?.((prev) => ({
									...prev,
									pageSize: Number(e.target.value),
									pageIndex: 0,
								}));
							}}
							disabled={isPending || disablePaginationControls}
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
				</Tooltip>
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
					{t('page')} {pagination.pageIndex + 1}
				</Box>

				<Box sx={{ display: 'flex', gap: 1 }}>
					<Tooltip
						title={disablePaginationControls ? disabledControlsReason : ''}
						arrow
						disableHoverListener={!disablePaginationControls}
					>
						<Box component="span">
							<Button
								variant="outlined"
								size="small"
								onClick={() => {
									handlePaginationChange?.((prev) => ({
										...prev,
										pageIndex: prev.pageIndex - 1,
									}));
								}}
								disabled={
									disablePaginationControls || !hasPreviousPage || isPending
								}
								startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
							>
								{t('previous')}
							</Button>
						</Box>
					</Tooltip>
					<Tooltip
						title={disablePaginationControls ? disabledControlsReason : ''}
						arrow
						disableHoverListener={!disablePaginationControls}
					>
						<Box component="span">
							<Button
								variant="outlined"
								size="small"
								onClick={() => {
									handlePaginationChange?.((prev) => ({
										...prev,
										pageIndex: prev.pageIndex + 1,
									}));
								}}
								disabled={
									disablePaginationControls || !hasNextPage || isPending
								}
								endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
							>
								{t('next')}
							</Button>
						</Box>
					</Tooltip>
				</Box>
			</Box>
		</Box>
	);
};
