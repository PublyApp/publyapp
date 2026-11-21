/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffTenantsRoute } from '~/routes/authed/staff/tenants';

/**
 * #2340 — the real staff tenants route preloads its page list from the route's
 * own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the list once; the click paints it from cache.
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
	title: 'staff tenants',
	route: StaffTenantsRoute,
	linkTo: '/staff/tenants',
	path: '/staff/tenants',
	linkLabel: 'open tenants',
	endpoints: [[['staff', 'tenants', 'get'], 1]],
	warmed: 1,
	pageTestId: 'staff-tenants-table',
	variants: [
		{
			title: 'a status filter warms the key the page reads for that URL',
			search: { status: 'active' },
		},
	],
});
