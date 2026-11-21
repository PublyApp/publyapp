/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { STAFF_TENANT_PRELOAD_RESPONSES } from '~/__tests__/support/builders';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/tenants/$tenantId/activity';

/**
 * #2340 — the real staff tenant activity route preloads its page queries from the
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
vi.mock('~/lib/hooks/use-logout', () =>
	import('~/__tests__/support/preload-mocks').then((m) => m.logoutHookModule()),
);
vi.mock('~/components/error-views/LogoutRedirect', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.logoutRedirectModule(),
	),
);
vi.mock('react-i18next', (importOriginal) =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.identityI18nModule(importOriginal),
	),
);

definePreloadSuite({
	title: 'staff tenant activity',
	route: DestinationRoute,
	linkTo: '/staff/tenants/t1/activity',
	path: '/staff/tenants/$tenantId/activity',
	linkLabel: 'open tenant activity',
	responses: STAFF_TENANT_PRELOAD_RESPONSES,
	endpoints: [
		[['tenants', 'byTenantId', 'get'], 1],
		[['byTenantId', 'activity', 'get'], 1],
	],
	warmed: 2,
	variants: [
		{
			title:
				'a non-default URL sort warms the keys the page reads for that URL',
			search: { sort_id: 'name', sort_order: 'asc' },
			request: {
				suffix: ['byTenantId', 'activity', 'get'],
				params: { sortId: 'name', sortOrder: 'asc' },
			},
		},
	],
});
