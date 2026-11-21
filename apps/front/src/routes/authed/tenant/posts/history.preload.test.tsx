/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { requestQueryParameters } from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { TENANT_ID } from '~/__tests__/support/tenant-preload-support';
import { Route as HistoryRoute } from '~/routes/authed/tenant/posts/history';

/**
 * #2340 — the real tenant history route preloads its page queries from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
	),
);

const PUBLICATIONS = ['publishing', 'publications', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

defineTenantPreloadSuite({
	title: 'tenant history',
	route: HistoryRoute,
	linkTo: '/tenant/posts/history',
	path: '/tenant/posts/history',
	linkLabel: 'open history',
	pageTestId: 'tenant-posts-history-page',
	endpoints: [PUBLICATIONS, PERMISSIONS],
	// The permissions request is session-scoped, not tenant-prefixed.
	scoped: [PUBLICATIONS],
	assertRequests: () => {
		expect(requestQueryParameters(respond, ...PERMISSIONS)).toEqual([
			{ scope: TENANT_ID },
		]);
	},
	variants: [
		{
			title:
				'the size in the URL reaches the request on hover, and a search and a sort keep the warmed key the page reads',
			search: {
				q: 'launch',
				sort_id: 'updated_at',
				sort_order: 'asc',
				size: '50',
			},
			assertRequests: () => {
				expect(requestQueryParameters(respond, ...PUBLICATIONS)).toEqual([
					expect.objectContaining({ limit: '50' }),
				]);
			},
		},
	],
});
