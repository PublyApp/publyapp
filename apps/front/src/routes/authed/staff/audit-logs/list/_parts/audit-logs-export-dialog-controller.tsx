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

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { downloadTextFile, withTimestamp } from '#app/lib/export/download.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';

export type AuditLogsExportDialogControllerRef = {
	open: () => void;
};

type ExportFormat = 'csv' | 'json' | 'xlsx';

type AuditLogsExportDialogControllerProps = {
	actions?: string[];
	startDate?: string;
	endDate?: string;
	ref?: Ref<AuditLogsExportDialogControllerRef>;
};

const AuditLogsExportDialogController = ({
	actions,
	startDate,
	endDate,
	ref,
}: AuditLogsExportDialogControllerProps) => {
	const { t } = useTranslate();
	const [open, setOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
	const [isExporting, setIsExporting] = useState(false);

	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	const handleExport = async () => {
		if (exportFormat === 'xlsx') {
			return;
		}

		setIsExporting(true);

		try {
			const client = getClientManager().getOrCreateStaffClient();
			const result = await client.staff.auditLogs.exportEscaped.get({
				queryParameters: {
					format: exportFormat,
					actions:
						actions && actions.length > 0 ? actions.join(',') : undefined,
					startDate: startDate || undefined,
					endDate: endDate || undefined,
				},
			});

			if (!result) {
				throw new Error('Export returned empty result');
			}

			downloadTextFile({
				fileName: withTimestamp('audit-logs', exportFormat),
				mimeType: exportFormat === 'csv' ? 'text/csv' : 'application/json',
				content: result,
			});
			toast.success(t('export-complete'));
			setOpen(false);
		} catch (error) {
			logger.error('Audit logs export failed', { error });
			toast.error(t('export-failed'));
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
			<DialogTitle sx={{ pb: 1 }}>{t('export')}</DialogTitle>
			<DialogContent sx={{ pt: '8px !important', pb: 2.5 }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
					<Typography variant="body2">
						{t('export-audit-logs-current-filters')}
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
				<Button onClick={() => setOpen(false)} disabled={isExporting}>
					{t('cancel')}
				</Button>
				<Button
					variant="contained"
					onClick={handleExport}
					startIcon={<Iconify icon="solar:download-bold" width={18} />}
					loading={isExporting}
					disabled={exportFormat === 'xlsx'}
				>
					{t('export')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default AuditLogsExportDialogController;
