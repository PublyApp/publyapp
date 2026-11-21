/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffAuditLogsRoute } from '~/routes/authed/staff/audit-logs';

/**
 * #2340 — the real staff audit-logs route preloads the action registry and the history list from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
 * Hover warms each page query exactly once and renders nothing; after the click
 * the page's own hooks observe the very queries the loader warmed, and the
 * fresh data is reused: no additional fetch.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

const LOGS_PATH = ['staff', 'auditLogs', 'get'] as const;
const ACTIONS_PATH = ['staff', 'auditLogs', 'actions', 'get'] as const;

definePreloadSuite({
	title: 'staff audit-logs',
	route: StaffAuditLogsRoute,
	linkTo: '/staff/audit-logs',
	path: '/staff/audit-logs',
	linkLabel: 'open audit logs',
	// Only the category variant needs a registry payload (the loader chains the
	// filtered logs warm behind it); the other URLs ignore it.
	responses: [
		[
			ACTIONS_PATH,
			{ actions: ['auth.login', 'auth.logout', 'tenant.created'] },
		],
	],
	endpoints: [
		[LOGS_PATH, 1],
		[ACTIONS_PATH, 1],
	],
	warmed: 2,
	pageTestId: 'staff-audit-logs-history',
	variants: [
		{
			title: 'a period filter warms the key the page reads for that URL',
			search: { period: 'week' },
		},
		{
			title:
				'a category filter with a cold action registry warms the filtered logs once the registry lands',
			search: { category: 'auth' },
		},
	],
});
