/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { requestQueryParameters } from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as QueueRoute } from '~/routes/authed/tenant/posts/queue';

/**
 * #2340 — the real tenant queue route preloads the first page of the queue from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
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

const SCHEDULED = ['posts', 'publications', 'get'] as const;
const NOON = new Date('2026-11-10T12:00:10.000Z');

defineTenantPreloadSuite({
	title: 'tenant queue',
	route: QueueRoute,
	linkTo: '/tenant/posts/queue',
	path: '/tenant/posts/queue',
	linkLabel: 'open queue',
	pageTestId: 'tenant-posts-queue-page',
	endpoints: [SCHEDULED],
	setup: () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOON);
	},
	// The statuses, the size and the window reach the request.
	assertRequests: () => {
		expect(requestQueryParameters(respond, ...SCHEDULED)).toEqual([
			{
				from: '2026-11-09T12:00:00.000Z',
				to: '2026-12-11T12:00:00.000Z',
				status: 'scheduled,in_progress,paused',
				cursor: undefined,
				limit: '20',
			},
		]);
		// The page mounts a moment after the hover: both build the same window.
		vi.setSystemTime(new Date(NOON.valueOf() + 250));
	},
});
