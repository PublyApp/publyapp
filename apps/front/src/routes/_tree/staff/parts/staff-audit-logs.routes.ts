import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

export const staffAuditLogsRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.auditLogs.root), [
		index('routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx'),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.auditLogs.details(':logId'), 2),
			'routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx',
		),
	]),
];
