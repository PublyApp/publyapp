import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { useTranslate } from '#app/hooks/use-translate.ts';

export type AuditLogContextField = 'ip' | 'userAgent' | 'targetId' | 'eventId';

type AuditLogContextGridProps = {
	auditLog: AuditLogDetail;
	fields: AuditLogContextField[];
};

type Cell = {
	key: AuditLogContextField;
	labelKey: string;
	value: string;
	mono: boolean;
};

const dash = '-';

export const AuditLogContextGrid = ({
	auditLog,
	fields,
}: AuditLogContextGridProps) => {
	const { t } = useTranslate();

	const allCells: Record<AuditLogContextField, Cell> = {
		ip: {
			key: 'ip',
			labelKey: 'ip-address',
			value: auditLog.ipAddress || dash,
			mono: true,
		},
		userAgent: {
			key: 'userAgent',
			labelKey: 'user-agent',
			value: auditLog.userAgent || dash,
			mono: false,
		},
		targetId: {
			key: 'targetId',
			labelKey: 'target-id',
			value: auditLog.targetId ?? dash,
			mono: true,
		},
		eventId: {
			key: 'eventId',
			labelKey: 'event-id',
			value: auditLog.id ?? dash,
			mono: true,
		},
	};

	const visible = map(fields, (f) => allCells[f]);

	return (
		<Grid container spacing={2}>
			{map(visible, (cell) => (
				<Grid key={cell.key} size={{ xs: 12, sm: 6 }}>
					<Typography
						variant="caption"
						sx={{
							color: 'text.secondary',
							textTransform: 'uppercase',
							letterSpacing: 0.4,
							display: 'block',
							mb: 0.5,
						}}
					>
						{t(cell.labelKey as never)}
					</Typography>
					<Tooltip title={cell.value} placement="top" enterDelay={600}>
						<Box
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								fontFamily: cell.mono ? 'monospace' : undefined,
								fontSize: cell.mono ? '0.8rem' : undefined,
								color: cell.mono ? 'text.secondary' : 'text.primary',
							}}
						>
							{cell.value}
						</Box>
					</Tooltip>
				</Grid>
			))}
		</Grid>
	);
};
