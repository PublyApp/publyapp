/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffJobsQueueRoute } from '~/routes/authed/staff/jobs/queue';

/**
 * #2340 — the real staff jobs queue (the `/staff/jobs` index) preloads the queue list and the three counter lists from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
 * Hover warms each page query exactly once and renders nothing; after the click
 * the page's own hooks observe the very queries the loader warmed, and the
 * fresh data is reused: no additional fetch.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

definePreloadSuite({
	title: 'staff jobs queue',
	route: StaffJobsQueueRoute,
	linkTo: '/staff/jobs',
	path: '/',
	parentPath: '/staff/jobs',
	linkLabel: 'open jobs queue',
	endpoints: [
		[['staff', 'jobs', 'queue', 'get'], 2],
		[['staff', 'jobs', 'deadLetter', 'get'], 1],
		[['staff', 'jobs', 'systemJobs', 'get'], 1],
	],
	warmed: 4,
	pageTestId: 'staff-jobs-queue-table',
	variants: [
		{
			title: 'a filtered URL warms the key the page reads for that URL',
			search: { status: 'pending' },
		},
	],
});
