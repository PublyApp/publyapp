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

import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	downloadCsvFile,
	downloadJsonFile,
	withTimestamp,
} from '#app/lib/export/download.ts';
import { fDate } from '#app/utils/format-time.ts';

import type { StaffInvitationRowData } from './staff-invitations-table';

export type StaffInvitationsExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type StaffInvitationsExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rows: StaffInvitationRowData[];
	selectedRows: StaffInvitationRowData[];
	ref?: Ref<StaffInvitationsExportDialogControllerRef>;
};

const StaffInvitationsExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rows,
	selectedRows,
	ref,
}: StaffInvitationsExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	const rowsToExport = isSelectionMode ? selectedRows : rows;

	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	const exportRows = (format: 'csv' | 'json') => {
		if (format === 'csv') {
			const headers = [
				t('email'),
				t('profile'),
				t('status'),
				t('staff-invited-by'),
				t('expiry-date'),
				t('accepted-at'),
				t('created-at'),
			];
			const csvRows = map(rowsToExport, (row) => [
				row.email,
				row.profileName,
				row.status,
				row.invitedByName,
				row.expiresAt ? fDate(row.expiresAt) : '',
				row.acceptedAt ? fDate(row.acceptedAt) : '',
				row.createdAt ? fDate(row.createdAt) : '',
			]);
			downloadCsvFile({
				fileName: withTimestamp(
					isSelectionMode ? 'selected-staff-invitations' : 'staff-invitations',
					'csv',
				),
				rows: [headers, ...csvRows],
			});
			return;
		}

		downloadJsonFile({
			fileName: withTimestamp(
				isSelectionMode ? 'selected-staff-invitations' : 'staff-invitations',
				'json',
			),
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
				{isSelectionMode
					? t('export-selected-invitations')
					: t('export-invitations')}
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
						onChange={(_event, value: string) => {
							setExportFormat(value as ExportFormat);
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
								textTransform: 'none',
								fontWeight: 600,
								fontSize: 13,
								color: theme.vars.palette.text.secondary,
								opacity: 1,
								'&.Mui-selected': {
									bgcolor: theme.vars.palette.background.neutral,
									color: theme.vars.palette.text.primary,
								},
							},
						})}
					>
						<Tab value="csv" label="CSV" />
						<Tab value="json" label="JSON" />
						<Tab value="xlsx" label="XLSX" />
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
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
				<Button
					variant="contained"
					onClick={handleExport}
					disabled={exportFormat === 'xlsx'}
				>
					{t('export')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default StaffInvitationsExportDialogController;
