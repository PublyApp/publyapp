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
import type { Ref } from 'react';
import { useImperativeHandle, useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { downloadCsvFile, downloadJsonFile } from '#app/lib/export/download.ts';

import type { TenantUserCompanyData } from './tenant-user-companies-table.types.ts';

export type TenantUserCompaniesExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type TenantUserCompaniesExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rows: TenantUserCompanyData[];
	selectedRows: TenantUserCompanyData[];
	ref?: Ref<TenantUserCompaniesExportDialogControllerRef>;
};

const TenantUserCompaniesExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rows,
	selectedRows,
	ref,
}: TenantUserCompaniesExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	// Cursor pagination means export can only include loaded rows or the current
	// selection, not every server-side match.
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
			const headers = [t('tenant'), t('tenant-id'), t('level'), t('status')];
			const csvRows = map(rowsToExport, (row) => {
				return [
					row.tenantName,
					row.tenantId,
					row.level ?? '',
					row.status ?? '',
				];
			});

			downloadCsvFile({
				fileName: isSelectionMode
					? 'selected-tenant-user-companies.csv'
					: 'tenant-user-companies.csv',
				rows: [headers, ...csvRows],
			});
			return;
		}

		downloadJsonFile({
			fileName: isSelectionMode
				? 'selected-tenant-user-companies.json'
				: 'tenant-user-companies.json',
			data: rowsToExport,
		});
	};

	const handleExport = () => {
		if (exportFormat === 'xlsx') {
			return;
		}

		exportRows(exportFormat);
		setOpen(false);
	};

	return (
		<Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
			<DialogTitle sx={{ pb: 1 }}>
				{isSelectionMode ? t('export-selected') : t('export')}
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
						onChange={(_event, value: ExportFormat) => setExportFormat(value)}
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
								bgcolor: theme.vars.palette.background.neutral,
								boxShadow: 'none',
							},
							'& .MuiTab-root.Mui-disabled': {
								opacity: 0.48,
							},
						})}
					>
						<Tab label="CSV" value="csv" />
						<Tab label="JSON" value="json" />
						<Tab label="XLSX" value="xlsx" disabled />
					</Tabs>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
				<Button
					variant="contained"
					onClick={handleExport}
					startIcon={<Iconify icon="solar:download-bold" width={18} />}
					disabled={exportFormat === 'xlsx'}
				>
					{t('export')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default TenantUserCompaniesExportDialogController;
