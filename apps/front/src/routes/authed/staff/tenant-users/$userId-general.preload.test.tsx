/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/tenant-users/$userId-general';

/**
 * #2340 — the real staff tenant user general route preloads its page queries from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
 * Hover warms each page query exactly once and renders nothing; after the click
 * the page's own hooks observe the very queries the loader warmed, and the
 * fresh data is reused: no additional fetch.
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
	title: 'staff tenant user general',
	route: DestinationRoute,
	linkTo: '/staff/tenant-users/details/user-1/general',
	path: '/staff/tenant-users/details/$userId/general',
	linkLabel: 'open tenant user',
	responses: [
		[
			['staff', 'tenantUsers', 'byUserId', 'get'],
			{ id: 'user-1', email: 'user@example.test' },
		],
	],
	endpoints: [[['staff', 'tenantUsers', 'byUserId', 'get'], 1]],
	warmed: 1,
});
