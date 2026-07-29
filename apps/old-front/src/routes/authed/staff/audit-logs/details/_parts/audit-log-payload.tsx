import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId } from 'react';

import { useTranslate } from '#app/hooks/use-translate.ts';

type AuditLogPayloadProps = {
	details?: string | null;
};

// Audit-log details can be JSON or plain text; pretty-print
// JSON but preserve non-JSON payloads verbatim.
const formatPayload = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
};

export const AuditLogPayload = ({ details }: AuditLogPayloadProps) => {
	const { t } = useTranslate();
	const labelId = useId();

	if (!details) {
		return null;
	}

	return (
		<Box>
			<Typography
				id={labelId}
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
			{/* Payloads can overflow both axes; make the
			region focusable so keyboard users can scroll it. */}
			<Box
				component="pre"
				role="region"
				tabIndex={0}
				aria-labelledby={labelId}
				sx={{
					m: 0,
					p: 1.5,
					borderRadius: 1,
					bgcolor: 'background.neutral',
					fontFamily: 'monospace',
					fontSize: '0.8rem',
					overflow: 'auto',
					maxHeight: 360,
					maxWidth: 1,
					whiteSpace: 'pre',
					wordBreak: 'normal',
					'&:focus-visible': {
						outline: '2px solid',
						outlineColor: 'primary.main',
						outlineOffset: 2,
					},
				}}
			>
				{formatPayload(details)}
			</Box>
		</Box>
	);
};
