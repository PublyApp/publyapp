/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/jobs/dead-letter';

/**
 * #2340 — the real staff dead-letter route preloads its page queries from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
 * Hover warms each page query exactly once and renders nothing; after the click
 * the page's own hooks observe the very queries the loader warmed, and the
 * fresh data is reused: no additional fetch.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

const DEAD_LETTER_PATH = ['staff', 'jobs', 'deadLetter', 'get'] as const;
const TENANT_ID = '0192f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f';

definePreloadSuite({
	title: 'staff dead-letter',
	route: DestinationRoute,
	linkTo: '/staff/jobs/dead-letter',
	path: '/staff/jobs/dead-letter',
	linkLabel: 'open dead letters',
	endpoints: [
		[['staff', 'jobs', 'queue', 'get'], 1],
		[DEAD_LETTER_PATH, 2],
		[['staff', 'jobs', 'systemJobs', 'get'], 1],
		[['auth', 'scopeAuthData', 'get'], 1],
	],
	warmed: 5,
	variants: [
		{
			title:
				'a non-default URL search warms the keys the page reads for that URL',
			search: { q: 'timeout' },
		},
		{
			// The filtered list is one of the two dead-letter calls; the other is
			// the unfiltered overview count.
			title:
				'tenant, job type and external state filters reach the dead-letter request',
			search: {
				tenant_id: TENANT_ID,
				job_type: 'post.publish',
				external_state_status: '6',
			},
			request: {
				suffix: DEAD_LETTER_PATH,
				params: {
					tenantId: TENANT_ID,
					jobType: 'post.publish',
					externalStateStatus: '6',
				},
			},
		},
	],
});
