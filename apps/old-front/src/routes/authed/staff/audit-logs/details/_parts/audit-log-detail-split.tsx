import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailSplitProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailSplit = ({ auditLog }: AuditLogDetailSplitProps) => {
	const hasPayload = !!auditLog.details;

	return (
		<Stack spacing={3}>
			<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
			<Grid container spacing={3}>
				<Grid size={{ xs: 12, md: hasPayload ? 7 : 12 }}>
					<Card>
						<Stack spacing={3} sx={{ p: 3 }}>
							<AuditLogActor auditLog={auditLog} />
							<AuditLogContextGrid
								auditLog={auditLog}
								fields={['ip', 'userAgent', 'targetId', 'eventId']}
							/>
						</Stack>
					</Card>
				</Grid>
				{hasPayload && (
					<Grid size={{ xs: 12, md: 5 }}>
						<Card>
							<Box sx={{ p: 3 }}>
								<AuditLogPayload details={auditLog.details} />
							</Box>
						</Card>
					</Grid>
				)}
			</Grid>
		</Stack>
	);
};
