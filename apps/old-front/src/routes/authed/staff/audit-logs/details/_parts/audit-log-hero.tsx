import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { fDateTime, fToNow } from '#app/utils/format-time.ts';

import { categorizeAuditAction } from './audit-log-action-category';

type AuditLogHeroProps = {
	auditLog: AuditLogDetail;
	sx?: SxProps<Theme>;
};

export const AuditLogHero = ({ auditLog, sx }: AuditLogHeroProps) => {
	const { kind, color } = categorizeAuditAction(auditLog.action ?? '');

	return (
		<Box sx={{ p: 3, ...sx }}>
			<Stack spacing={1.5}>
				<Chip
					label={kind}
					color={color === 'default' ? undefined : color}
					size="small"
					variant={color === 'default' ? 'outlined' : 'filled'}
					sx={{ alignSelf: 'flex-start', fontWeight: 500 }}
				/>
				<Typography
					variant="h5"
					sx={{
						fontFamily: 'monospace',
						wordBreak: 'break-all',
						lineHeight: 1.3,
					}}
				>
					{auditLog.action || '-'}
				</Typography>
				{auditLog.createdAt && (
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						sx={{ color: 'text.secondary' }}
					>
						<Typography variant="body2">
							{fDateTime(auditLog.createdAt)}
						</Typography>
						<Typography variant="body2" aria-hidden>
							·
						</Typography>
						<Typography variant="body2">
							{fToNow(auditLog.createdAt)}
						</Typography>
					</Stack>
				)}
			</Stack>
		</Box>
	);
};
