import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { RouterLink } from '#app/components/router-link.tsx';

type AuditLogsEventCellProps = {
	id: string;
	action: string;
};

export const AuditLogsEventCell = ({ id, action }: AuditLogsEventCellProps) => {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Link
				component={RouterLink}
				href={FRONT_PATH_NAMES.staff.auditLogs.details(id)}
				underline="hover"
				sx={{
					display: 'block',
					fontFamily: 'monospace',
					fontSize: '0.8rem',
					color: 'text.primary',
					fontWeight: 500,
				}}
			>
				{action || '-'}
			</Link>
			<Typography
				variant="caption"
				noWrap
				sx={{
					display: 'block',
					fontFamily: 'monospace',
					fontSize: '0.75rem',
					color: 'text.secondary',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{id}
			</Typography>
		</Box>
	);
};
