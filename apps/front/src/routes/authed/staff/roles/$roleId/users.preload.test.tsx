/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/roles/$roleId/users';

/**
 * #2340 — the real staff role users route preloads its page queries from the
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
	title: 'staff role users',
	route: DestinationRoute,
	linkTo: '/staff/roles/role-1/users',
	path: '/staff/roles/$roleId/users',
	linkLabel: 'open role users',
	responses: [
		[
			['staff', 'roles', 'byRoleId', 'get'],
			{ role: { id: 'role-1', name: 'Support' } },
		],
	],
	endpoints: [
		[['staff', 'roles', 'byRoleId', 'get'], 1],
		[['staff', 'roles', 'byRoleId', 'users', 'get'], 1],
		[['auth', 'scopeAuthData', 'get'], 1],
	],
	warmed: 3,
	variants: [
		{
			title:
				'a non-default URL search warms the keys the page reads for that URL',
			search: { q: 'ana' },
		},
	],
	// Side-panel team counters (`useStaffTeamOverview`, `preload-exempt`):
	// secondary data, deliberately not warmed. Pinned so the exclusion stays
	// visible.
	lazyEndpoints: [
		['staff', 'users', 'get'],
		['staff', 'invitations', 'get'],
		['staff', 'roles', 'get'],
	],
});
