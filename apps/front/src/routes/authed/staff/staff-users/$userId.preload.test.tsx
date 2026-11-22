/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/staff-users/$userId';

/**
 * #2340 — the real staff user details route preloads its page queries from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale).
 *
 * Hover warms each page query exactly once and renders nothing. After the
 * click the page's own hooks observe the very queries the loader warmed — a
 * warmed key the page does not read would stay without observers — and the
 * fresh data is reused: no additional fetch.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

definePreloadSuite({
	title: 'staff user details',
	route: DestinationRoute,
	linkTo: '/staff/staff-users/user-1',
	path: '/staff/staff-users/$userId',
	linkLabel: 'open staff user',
	endpoints: [
		[['staff', 'users', 'byUserId', 'get'], 1],
		[['staff', 'users', 'byUserId', 'roles', 'get'], 1],
	],
	warmed: 2,
});
