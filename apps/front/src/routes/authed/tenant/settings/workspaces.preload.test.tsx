/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePickerOnlyPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as PageRoute } from '~/routes/authed/tenant/settings/workspaces';

/**
 * #2340 — the real tenant workspaces route preloads the workspace picker from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.tenantClientManagerModule(),
	),
);

definePickerOnlyPreloadSuite({
	title: 'tenant workspaces',
	route: PageRoute,
	linkTo: '/tenant/settings/workspaces',
	path: '/tenant/settings/workspaces',
	linkLabel: 'open workspaces',
	pageTestId: 'tenant-settings-workspaces-page',
});
