import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { Ref } from 'react';
import { useImperativeHandle, useState } from 'react';

import { useTranslate } from '#app/hooks/use-translate.ts';
import { downloadCsvFile, downloadJsonFile } from '#app/lib/export/download.ts';
import { fDate } from '#app/utils/format-time.ts';

import type { TenantInvitationRowData } from './tenant-invitations-table';

export type TenantInvitationsExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type TenantInvitationsExportDialogControllerProps = {
	isSelectionMode: boolean;
	selectedCount: number;
	rows: TenantInvitationRowData[];
	selectedRows: TenantInvitationRowData[];
	getInvitationStatus: (row: TenantInvitationRowData) => string;
	ref?: Ref<TenantInvitationsExportDialogControllerRef>;
};

const TenantInvitationsExportDialogController = ({
	isSelectionMode,
	selectedCount,
	rows,
	selectedRows,
	getInvitationStatus,
	ref,
}: TenantInvitationsExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

	// Trivial selection switch: no memo needed (react-doctor warns on trivial useMemo).
	const rowsToExport = isSelectionMode ? selectedRows : rows;

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

	const exportRows = (format: 'csv' | 'json') => {
		if (format === 'csv') {
			const headers = ['Email', 'Profiles', 'Status', 'Expires', 'Invited By'];
			const csvRows = rowsToExport.map((row) => [
				row.email,
				row.profileName || '',
				getInvitationStatus(row),
				row.expiresAt ? fDate(row.expiresAt) : '',
				row.invitedByName,
			]);
			downloadCsvFile({
				fileName: isSelectionMode
					? 'selected-tenant-invitations.csv'
					: 'tenant-invitations.csv',
				rows: [headers, ...csvRows],
			});
			return;
		}

		downloadJsonFile({
			fileName: isSelectionMode
				? 'selected-tenant-invitations.json'
				: 'tenant-invitations.json',
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
						<Tab value="xlsx" label="XLSX" disabled />
					</Tabs>
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

export default TenantInvitationsExportDialogController;
