import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';
import { varAlpha } from 'minimal-shared/utils';
import type { Ref } from 'react';
import { useImperativeHandle, useState } from 'react';

import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { downloadCsvFile, downloadJsonFile } from '#app/lib/export/download.ts';

import type { StaffUserRowData } from './use-staff-users-table-controller.ts';

export type StaffUsersExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type StaffUsersExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rows: StaffUserRowData[];
	selectedRows: StaffUserRowData[];
	ref?: Ref<StaffUsersExportDialogControllerRef>;
};

const StaffUsersExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rows,
	selectedRows,
	ref,
}: StaffUsersExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	const rowsToExport = isSelectionMode ? selectedRows : rows;

	const exportRows = (format: 'csv' | 'json') => {
		if (format === 'csv') {
			const headers = ['Name', 'Email', 'Status', 'Level'];
			const csvRows = map(rowsToExport, (row) => {
				return [
					getUserFullName({
						firstName: row.firstName,
						lastName: row.lastName,
					}),
					row.email,
					row.status,
					row.level,
				];
			});
			downloadCsvFile({
				fileName: isSelectionMode
					? 'selected-staff-users.csv'
					: 'staff-users.csv',
				rows: [headers, ...csvRows],
			});
			return;
		}

		downloadJsonFile({
			fileName: isSelectionMode
				? 'selected-staff-users.json'
				: 'staff-users.json',
			data: rowsToExport,
		});
	};

	return (
		<Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
			<DialogTitle sx={{ pb: 1 }}>
				{isSelectionMode
					? t('export-selected-staff-users')
					: t('export-staff-users')}
			</DialogTitle>
			<DialogContent sx={{ pt: '8px !important', pb: 2.5 }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
					<Typography variant="body2">
						{isSelectionMode
							? t('export-selected-items', { count: selectedCount })
							: t('export-current-results', { count: rows.length })}
					</Typography>
					<Tabs
						value={exportFormat}
						onChange={(_event, value: ExportFormat) => {
							if (value) {
								setExportFormat(value);
							}
						}}
						sx={(theme) => ({
							mt: 1.5,
							alignSelf: 'flex-start',
							minHeight: 32,
							p: '2px 2px 1px',
							border: `1px solid ${theme.vars.palette.divider}`,
							borderRadius: 1,
							bgcolor: 'background.paper',
							'& .MuiTabs-indicator': {
								display: 'none',
							},
							'& .MuiTabs-list': {
								gap: '2px',
							},
							'& .MuiTab-root': {
								minHeight: 26,
								minWidth: 64,
								px: 1,
								py: 0.375,
								borderRadius: 0.75,
								fontSize: theme.typography.caption.fontSize,
								fontWeight: theme.typography.fontWeightMedium,
								textTransform: 'none',
								color: 'text.secondary',
								m: 0,
								transition: theme.transitions.create(
									['background-color', 'color', 'box-shadow'],
									{
										duration: theme.transitions.duration.shorter,
									},
								),
							},
							'& .MuiTab-root.Mui-selected': {
								color: 'text.primary',
								bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
								boxShadow: 'none',
							},
							'& .MuiTab-root.Mui-disabled': {
								opacity: 0.48,
							},
						})}
					>
						<Tab label="CSV" value="csv" />
						<Tab label="JSON" value="json" />
						<Tab label="XLSX" value="xlsx" />
					</Tabs>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ minHeight: 20 }}
					>
						{exportFormat === 'xlsx' ? t('xlsx-export-coming-soon') : ' '}
					</Typography>
				</Box>
			</DialogContent>
			<DialogActions
				sx={{
					px: 3,
					pb: 3,
					pt: 0,
					gap: 0.75,
					justifyContent: 'flex-end',
				}}
			>
				<Button
					variant="contained"
					onClick={() => {
						if (exportFormat === 'xlsx') {
							return;
						}

						exportRows(exportFormat);
						setOpen(false);
					}}
					startIcon={<Iconify icon="solar:download-bold" width={18} />}
					disabled={exportFormat === 'xlsx'}
				>
					{t('export')}
				</Button>
				<Button
					variant="outlined"
					color="inherit"
					onClick={() => setOpen(false)}
				>
					{t('cancel')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default StaffUsersExportDialogController;
