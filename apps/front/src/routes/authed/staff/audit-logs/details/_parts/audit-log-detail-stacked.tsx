import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailStackedProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailStacked = ({
	auditLog,
}: AuditLogDetailStackedProps) => {
	return (
		<Stack spacing={3}>
			<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
			<Card>
				<Stack spacing={3} sx={{ p: 3 }}>
					<AuditLogActor auditLog={auditLog} />
					<AuditLogContextGrid
						auditLog={auditLog}
						fields={['targetId', 'eventId']}
					/>
				</Stack>
			</Card>
			<Card>
				<Box sx={{ p: 3 }}>
					<AuditLogContextGrid
						auditLog={auditLog}
						fields={['ip', 'userAgent']}
					/>
				</Box>
			</Card>
			{auditLog.details && (
				<Card>
					<Box sx={{ p: 3 }}>
						<AuditLogPayload details={auditLog.details} />
					</Box>
				</Card>
			)}
		</Stack>
	);
};
