import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailSectionedProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailSectioned = ({
	auditLog,
}: AuditLogDetailSectionedProps) => {
	return (
		<Card>
			<AuditLogHero
				auditLog={auditLog}
				sx={{ bgcolor: 'background.neutral' }}
			/>
			<Divider />
			<Box sx={{ p: 3 }}>
				<AuditLogActor auditLog={auditLog} />
			</Box>
			<Divider />
			<Box sx={{ p: 3 }}>
				<AuditLogContextGrid
					auditLog={auditLog}
					fields={['ip', 'userAgent', 'targetId', 'eventId']}
				/>
			</Box>
			{auditLog.details && (
				<>
					<Divider />
					<Box sx={{ p: 3 }}>
						<AuditLogPayload details={auditLog.details} />
					</Box>
				</>
			)}
		</Card>
	);
};
