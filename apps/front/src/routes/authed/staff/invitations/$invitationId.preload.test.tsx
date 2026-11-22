/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as DestinationRoute } from '~/routes/authed/staff/invitations/$invitationId';

/**
 * #2340 — the real staff invitation details route preloads its page queries from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
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
	title: 'staff invitation details',
	route: DestinationRoute,
	linkTo: '/staff/invitations/inv-1',
	path: '/staff/invitations/$invitationId',
	linkLabel: 'open invitation',
	endpoints: [[['staff', 'invitations', 'byInvitationId', 'get'], 1]],
	warmed: 1,
});
