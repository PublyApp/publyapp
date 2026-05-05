import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
	MRT_GlobalFilterTextField,
	type MRT_RowData,
	type MRT_TableInstance,
} from 'material-react-table';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { SharedToolbarMeta } from '../types';

type SharedTopToolbarProps<TData extends MRT_RowData> = {
	table: MRT_TableInstance<TData>;
};

export const SharedTopToolbar = <TData extends MRT_RowData>({
	table,
}: SharedTopToolbarProps<TData>) => {
	const { t } = useTranslate();
	const meta = (table.options.meta ?? {}) as SharedToolbarMeta<TData>;
	const selectedRowsCount = table.getSelectedRowModel().rows.length;
	const isSelectionMode = selectedRowsCount > 0;
	const context = {
		table,
		isSelectionMode,
		selectedRowsCount,
	};

	const normalFilters = meta.renderToolbarFilters?.(context) ?? (
		<MRT_GlobalFilterTextField table={table} />
	);
	const normalActions = meta.renderToolbarActions?.(context);
	const selectionActions = meta.renderSelectionActions?.(context);
	const exportActions = meta.renderExportActions?.(context);

	return (
		<Box
			sx={(theme) => ({
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 2,
				p: 2,
				[theme.breakpoints.up('md')]: {
					flexWrap: 'nowrap',
				},
			})}
		>
			<Box
				sx={{
					display: 'flex',
					flexGrow: 1,
					flexWrap: 'wrap',
					gap: 2,
					alignItems: 'center',
				}}
			>
				{normalFilters}
			</Box>

			<Box
				sx={{
					display: 'flex',
					flexGrow: { xs: 1, md: 0 },
					flexWrap: 'wrap',
					gap: 1,
					alignItems: 'center',
					justifyContent: 'flex-end',
					ml: { md: 'auto' },
				}}
			>
				{isSelectionMode ? (
					<>
						<Typography variant="body2" color="text.secondary">
							{t('selected-count', {
								count: selectedRowsCount,
								defaultValue: '{{count}} selected',
							})}
						</Typography>
						<Tooltip
							title={t('clear-selection', {
								defaultValue: 'Clear selection',
							})}
							arrow
						>
							<IconButton
								size="small"
								onClick={() => {
									table.setRowSelection({});
								}}
								sx={{ width: 32, height: 32, ml: 0.75 }}
							>
								<Iconify icon="solar:close-circle-bold" width={18} />
							</IconButton>
						</Tooltip>
						{selectionActions}
					</>
				) : (
					<>
						{normalActions}
						{exportActions}
					</>
				)}
			</Box>
		</Box>
	);
};
