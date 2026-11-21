/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as GeneralRoute } from '~/routes/authed/tenant/settings/general';

/**
 * #2340 — the real tenant settings general route preloads its page query from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
	),
);

defineTenantPreloadSuite({
	title: 'tenant settings general',
	route: GeneralRoute,
	linkTo: '/tenant/settings',
	path: '/tenant/settings',
	linkLabel: 'open settings',
	pageTestId: 'tenant-settings-general-page',
	endpoints: [['settings', 'general', 'get']],
});
