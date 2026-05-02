import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { downloadTextFile } from '#app/lib/export/download.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';

type AuditLogsExportButtonProps = {
	actionFilter?: string;
	startDate?: string;
	endDate?: string;
};

const triggerDownload = (buffer: ArrayBuffer, format: string) => {
	const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
	downloadTextFile({
		fileName: `audit-logs-${Date.now()}.${format}`,
		mimeType,
		content: buffer,
	});
};

export const AuditLogsExportButton = ({
	actionFilter,
	startDate,
	endDate,
}: AuditLogsExportButtonProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const open = Boolean(anchorEl);

	const openExportMenu = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleExport = async (format: 'csv' | 'json') => {
		handleClose();
		setIsExporting(true);

		try {
			const client = getClientManager().getOrCreateStaffClient();
			const result = await client.staff.auditLogs.exportEscaped.get({
				queryParameters: {
					format,
					action: actionFilter || undefined,
					startDate: startDate || undefined,
					endDate: endDate || undefined,
				},
			});

			if (!result) {
				throw new Error('Export returned empty result');
			}

			triggerDownload(result, format);
			toast.success(t('export-complete'));
		} catch (error) {
			logger.error('Audit logs export failed', { error });
			toast.error(t('export-failed'));
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<>
			<Button
				variant="outlined"
				startIcon={<Iconify icon="solar:download-bold" width={18} />}
				onClick={openExportMenu}
				loading={isExporting}
			>
				{t('export')}
			</Button>
			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				<MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
				<MenuItem onClick={() => handleExport('json')}>JSON</MenuItem>
			</Menu>
		</>
	);
};
