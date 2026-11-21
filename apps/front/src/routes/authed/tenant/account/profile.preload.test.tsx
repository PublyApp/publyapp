/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as ProfileRoute } from '~/routes/authed/tenant/account/profile';

/**
 * #2340 — the real tenant account profile route preloads its page query from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
	),
);

defineTenantPreloadSuite({
	title: 'tenant account profile',
	route: ProfileRoute,
	linkTo: '/tenant/account',
	path: '/tenant/account',
	linkLabel: 'open profile',
	pageTestId: 'tenant-account-profile-page',
	endpoints: [['account', 'profile', 'get']],
});
