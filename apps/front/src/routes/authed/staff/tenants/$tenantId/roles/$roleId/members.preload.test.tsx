/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { STAFF_TENANT_PRELOAD_RESPONSES } from '~/__tests__/support/builders';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as ParentRoute } from '~/routes/authed/staff/tenants/$tenantId/roles/$roleId';
import { Route as DestinationRoute } from '~/routes/authed/staff/tenants/$tenantId/roles/$roleId/members';

/**
 * #2340 — the real staff tenant role members tab route preloads its page queries from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale).
 *
 * Hover warms each page query exactly once and renders nothing. After the
 * click the page's own hooks observe the very queries the loader warmed — a
 * warmed key the page does not read would stay without observers — and the
 * fresh data is reused: no additional fetch. Each URL variant checks that the
 * loader warms the keys the page reads for that very URL.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

definePreloadSuite({
	title: 'staff tenant role members tab',
	route: DestinationRoute,
	linkTo: '/staff/tenants/t1/roles/p1/members',
	path: '/staff/tenants/$tenantId/roles/$roleId/members',
	linkLabel: 'open role members',
	parent: {
		path: '/staff/tenants/$tenantId/roles/$roleId',
		childPath: '/members',
		options: ParentRoute.options,
	},
	responses: STAFF_TENANT_PRELOAD_RESPONSES,
	endpoints: [
		[['tenants', 'byTenantId', 'get'], 1],
		[['roles', 'byRoleId', 'get'], 1],
		[['byRoleId', 'users', 'get'], 2],
		[['permissions', 'scopes', 'tenant', 'get'], 1],
		[['roles', 'byRoleId', 'permissions', 'get'], 1],
	],
	warmed: 6,
});
