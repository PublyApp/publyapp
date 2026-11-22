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

definePickerOnlyPreloadSuite({
	title: 'tenant workspaces',
	route: PageRoute,
	linkTo: '/tenant/settings/workspaces',
	path: '/tenant/settings/workspaces',
	linkLabel: 'open workspaces',
	pageTestId: 'tenant-settings-workspaces-page',
});
