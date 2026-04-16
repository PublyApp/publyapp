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

import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { buildCsv } from '#app/lib/export/csv.ts';

import type { ProfileUserRowData } from './staff-profile-users-table.tsx';

export type StaffProfileUsersExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type StaffProfileUsersExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rows: ProfileUserRowData[];
	selectedRows: ProfileUserRowData[];
	ref?: Ref<StaffProfileUsersExportDialogControllerRef>;
};

const StaffProfileUsersExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rows,
	selectedRows,
	ref,
}: StaffProfileUsersExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	// React 19: `ref` is a normal prop (no `forwardRef` needed). We use an
	// imperative handle because the dialog can be opened from multiple triggers
	// without lifting `open` state into the heavy table component.
	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	// Export only the current page (or the explicit selection from that page).
	// This dialog is intentionally coupled to the table's loaded result set.
	const rowsToExport = isSelectionMode ? selectedRows : rows;

	const exportRows = (format: 'csv' | 'json') => {
		if (format === 'csv') {
			const headers = ['Name', 'Email', 'Status'];
			const csvRows = map(rowsToExport, (row) => {
				return [
					getUserFullName({ firstName: row.firstName, lastName: row.lastName }),
					row.email,
					row.status,
				];
			});
			const csv = buildCsv([headers, ...csvRows]);
			const blob = new Blob([csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = isSelectionMode
				? 'selected-profile-users.csv'
				: 'profile-users.csv';
			a.click();
			URL.revokeObjectURL(url);
			return;
		}

		const blob = new Blob([JSON.stringify(rowsToExport, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = isSelectionMode
			? 'selected-profile-users.json'
			: 'profile-users.json';
		a.click();
		URL.revokeObjectURL(url);
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
			</DialogActions>
		</Dialog>
	);
};

export default StaffProfileUsersExportDialogController;
