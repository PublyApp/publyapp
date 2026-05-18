import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useTranslate } from '#app/hooks/use-translate.ts';

type AuditLogPayloadProps = {
	details?: string | null;
};

const formatPayload = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
};

export const AuditLogPayload = ({ details }: AuditLogPayloadProps) => {
	const { t } = useTranslate();

	if (!details) {
		return null;
	}

	return (
		<Box>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					textTransform: 'uppercase',
					letterSpacing: 0.4,
					display: 'block',
					mb: 1,
				}}
			>
				{t('details')}
			</Typography>
			<Box
				component="pre"
				sx={{
					m: 0,
					p: 1.5,
					borderRadius: 1,
					bgcolor: 'background.neutral',
					fontFamily: 'monospace',
					fontSize: '0.8rem',
					overflow: 'auto',
					maxHeight: 360,
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-word',
				}}
			>
				{formatPayload(details)}
			</Box>
		</Box>
	);
};
