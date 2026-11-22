/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/roles/$roleId';

/**
 * #2340 — the real staff role details route preloads its page queries from the
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
	title: 'staff role details',
	route: DestinationRoute,
	linkTo: '/staff/roles/role-1',
	path: '/staff/roles/$roleId',
	linkLabel: 'open role',
	responses: [
		[
			['staff', 'roles', 'byRoleId', 'get'],
			{ role: { id: 'role-1', name: 'Support' } },
		],
	],
	endpoints: [
		[['staff', 'roles', 'byRoleId', 'get'], 1],
		[['staff', 'roles', 'byRoleId', 'permissions', 'get'], 1],
		[['staff', 'permissions', 'scopes', 'staff', 'get'], 1],
		[['staff', 'roles', 'byRoleId', 'users', 'get'], 1],
	],
	warmed: 4,
});
