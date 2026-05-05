import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { getClientManager } from '@/front/lib/js-client/client-manager';

type AuditLogsExportButtonProps = {
	actionFilter?: string;
	startDate?: string;
	endDate?: string;
};

const triggerDownload = (buffer: ArrayBuffer, format: string) => {
	const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `audit-logs-${Date.now()}.${format}`;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
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

	const handleClick = (event: React.MouseEvent<HTMLElement>) => {
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
				onClick={handleClick}
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
