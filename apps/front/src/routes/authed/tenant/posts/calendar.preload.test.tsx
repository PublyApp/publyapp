/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { requestQueryParameters } from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as CalendarRoute } from '~/routes/authed/tenant/posts/calendar';

/**
 * #2340 — the real tenant calendar route preloads the first page of the month from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
	),
);

const SCHEDULED = ['posts', 'publications', 'get'] as const;

defineTenantPreloadSuite({
	title: 'tenant calendar',
	route: CalendarRoute,
	linkTo: '/tenant/posts/',
	path: '/tenant/posts/',
	linkLabel: 'open calendar',
	pageTestId: 'tenant-posts-calendar-page',
	endpoints: [SCHEDULED],
	// The month window and the page size reach the request.
	assertRequests: () => {
		const now = new Date();
		const [parameters] = requestQueryParameters(respond, ...SCHEDULED);
		expect(parameters).toEqual({
			from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
			to: new Date(
				now.getFullYear(),
				now.getMonth() + 1,
				1,
				0,
				0,
				0,
				-1,
			).toISOString(),
			status: undefined,
			cursor: undefined,
			limit: '100',
		});
	},
});
