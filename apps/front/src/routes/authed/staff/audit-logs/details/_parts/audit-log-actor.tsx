import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { useTranslate } from '#app/hooks/use-translate.ts';

type AuditLogActorProps = {
	auditLog: AuditLogDetail;
};

const getInitials = (name?: string | null): string => {
	if (!name) {
		return '?';
	}
	const parts = name.trim().split(/\s+/);
	const first = parts[0]?.[0] ?? '';
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
	const initials = (first + last).toUpperCase();
	return initials || '?';
};

export const AuditLogActor = ({ auditLog }: AuditLogActorProps) => {
	const { t } = useTranslate();

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
				{t('user')}
			</Typography>
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Avatar
					sx={{
						bgcolor: 'primary.lighter',
						color: 'primary.darker',
						width: 36,
						height: 36,
						fontSize: 13,
						fontWeight: 600,
					}}
				>
					{getInitials(auditLog.userName)}
				</Avatar>
				<Box sx={{ minWidth: 0 }}>
					<Typography variant="subtitle2" noWrap>
						{auditLog.userName || '-'}
					</Typography>
					<Typography
						variant="caption"
						noWrap
						sx={{ color: 'text.secondary', display: 'block' }}
					>
						{auditLog.userEmail || '-'}
					</Typography>
				</Box>
			</Stack>
		</Box>
	);
};
