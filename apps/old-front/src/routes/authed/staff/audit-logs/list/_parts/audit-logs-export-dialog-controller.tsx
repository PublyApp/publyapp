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
import {
	getFailureMessage,
	toApiFailure,
} from '#app/lib/api-failure/to-api-failure.ts';
import { downloadTextFile, withTimestamp } from '#app/lib/export/download.ts';
import { useExportStaffAuditLogs } from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';

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
	const exportMutation = useExportStaffAuditLogs();
	const isExporting = exportMutation.isPending;

	useImperativeHandle(ref, () => {
		return {
			open: () => {
				setExportFormat('csv');
				setOpen(true);
			},
		};
	}, []);

	const handleExport = async () => {
		// XLSX is present as a disabled coming-soon option; do
		// not call the export endpoint until it supports that
		// format.
		if (exportFormat === 'xlsx') {
			return;
		}

		try {
			const result = await exportMutation.mutateAsync({
				format: exportFormat,
				actions,
				startDate: startDate || undefined,
				endDate: endDate || undefined,
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
			const failure = toApiFailure(error);
			logger.error('Audit logs export failed', { error, kind: failure.kind });

			if (
				failure.kind === 'abort' ||
				(failure.kind === 'problem' && failure.status === 401)
			) {
				return;
			}

			toast.error(
				getFailureMessage(failure, {
					fallback: t('export-failed'),
				}),
			);
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
						aria-label={t('choose-export-format')}
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
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button onClick={() => setOpen(false)} disabled={isExporting}>
					{t('cancel')}
				</Button>
				<Button
					variant="contained"
					onClick={() => {
						void handleExport();
					}}
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
