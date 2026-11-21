/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/tenant-users/$userId-organizations';

/**
 * #2340 — the real staff tenant user organizations route preloads its page queries from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
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
	title: 'staff tenant user organizations',
	route: DestinationRoute,
	linkTo: '/staff/tenant-users/details/user-1/organizations',
	path: '/staff/tenant-users/details/$userId/organizations',
	linkLabel: 'open tenant user organizations',
	responses: [
		[
			['staff', 'tenantUsers', 'byUserId', 'get'],
			{ id: 'user-1', email: 'user@example.test' },
		],
	],
	endpoints: [
		[['staff', 'tenantUsers', 'byUserId', 'get'], 1],
		[['staff', 'tenantUsers', 'byUserId', 'companies', 'get'], 2],
	],
	warmed: 3,
	variants: [
		{
			title:
				'a non-default URL search warms the keys the page reads for that URL',
			search: { q: 'acme' },
		},
	],
});
