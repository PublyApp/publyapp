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

definePreloadSuite({
	title: 'staff invitation details',
	route: DestinationRoute,
	linkTo: '/staff/invitations/inv-1',
	path: '/staff/invitations/$invitationId',
	linkLabel: 'open invitation',
	endpoints: [[['staff', 'invitations', 'byInvitationId', 'get'], 1]],
	warmed: 1,
});
