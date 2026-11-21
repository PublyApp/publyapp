/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { requestQueryParameters } from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { requestTenantIds } from '~/__tests__/support/tenant-preload-support';
import { Route as DraftsRoute } from '~/routes/authed/tenant/posts/drafts';

/**
 * #2340 — the real tenant drafts route preloads its page queries from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
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

const POSTS = ['posts', 'get'] as const;
const PROJECTS = ['projects', 'get'] as const;
const PUBLISH_TARGETS = ['publishing', 'publishTargets', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

defineTenantPreloadSuite({
	title: 'tenant drafts',
	route: DraftsRoute,
	linkTo: '/tenant/posts/drafts',
	path: '/tenant/posts/drafts',
	linkLabel: 'open drafts',
	pageTestId: 'tenant-posts-drafts-page',
	endpoints: [POSTS, PROJECTS, PUBLISH_TARGETS],
	assertRequests: () => {
		// The create drawer's permission gate mounts only once it opens.
		expect(requestTenantIds(respond, ...PERMISSIONS)).toEqual([]);
	},
	variants: [
		{
			title:
				'the search, sort and size in the URL reach the request on hover, and the click reuses the warmed key',
			search: {
				q: 'vanilla',
				sort_id: 'created_at',
				sort_order: 'asc',
				size: '50',
			},
			assertRequests: () => {
				expect(requestQueryParameters(respond, ...POSTS)).toEqual([
					expect.objectContaining({
						q: 'vanilla',
						sortId: 'created_at',
						sortOrder: 'asc',
						limit: '50',
					}),
				]);
			},
		},
	],
});
