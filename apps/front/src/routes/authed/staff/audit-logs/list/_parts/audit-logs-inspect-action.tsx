import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { useAuditLogInspect } from './use-audit-log-inspect';

type AuditLogsInspectActionProps = {
	logId: string;
};

export const AuditLogsInspectAction = ({
	logId,
}: AuditLogsInspectActionProps) => {
	const { t } = useTranslate();
	const { openInspect } = useAuditLogInspect();

	return (
		<Tooltip title={t('inspect')} placement="top" arrow>
			<IconButton
				color="default"
				size="small"
				onClick={() => openInspect(logId)}
				aria-label={t('inspect')}
				sx={{ color: 'text.primary' }}
			>
				<Iconify icon="solar:list-bold" width={18} />
			</IconButton>
		</Tooltip>
	);
};
