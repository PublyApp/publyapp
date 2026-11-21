/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { requestQueryParameters } from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { TENANT_ID } from '~/__tests__/support/tenant-preload-support';
import { Route as EditRoute } from '~/routes/authed/tenant/posts/$postId/edit';

/**
 * #2340 — the real tenant post edit route preloads its page queries from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
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

const DETAILS = ['posts', 'byPostId', 'get'] as const;
const PROJECTS = ['projects', 'get'] as const;
const PUBLISH_TARGETS = ['publishing', 'publishTargets', 'get'] as const;
const POST_PUBLICATIONS = ['posts', 'byPostId', 'publications', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

defineTenantPreloadSuite({
	title: 'tenant post edit',
	route: EditRoute,
	linkTo: '/tenant/posts/post-42/edit',
	path: '/tenant/posts/$postId/edit',
	linkLabel: 'open post',
	pageTestId: 'tenant-post-edit-page',
	respond: (call) =>
		call.path.includes('byPostId') && !call.path.includes('publications')
			? { id: 'post-42', body: 'Hello' }
			: {},
	endpoints: [
		DETAILS,
		PROJECTS,
		PUBLISH_TARGETS,
		POST_PUBLICATIONS,
		PERMISSIONS,
	],
	scoped: [DETAILS, PROJECTS, PUBLISH_TARGETS, POST_PUBLICATIONS],
	// The post id is not visible on the fake path: a loader that warmed another
	// id leaves the page's own details key cold, so the click fetches again and
	// the once-per-endpoint check fails.
	assertRequests: () => {
		expect(requestQueryParameters(respond, ...PERMISSIONS)).toEqual([
			{ scope: TENANT_ID },
		]);
	},
});
