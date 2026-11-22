/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { defineTenantPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { Route as IntegrationsRoute } from '~/routes/authed/tenant/settings/integrations';

/**
 * #2340 — the real tenant integrations route preloads its five page queries from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
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

defineTenantPreloadSuite({
	title: 'tenant integrations',
	route: IntegrationsRoute,
	linkTo: '/tenant/settings/integrations',
	path: '/tenant/settings/integrations',
	linkLabel: 'open integrations',
	pageTestId: 'tenant-settings-integrations-page',
	endpoints: [
		['socialAccounts', 'needsReconnectAccounts', 'get'],
		['socialAccounts', 'get'],
		['projects', 'get'],
		['publishing', 'capabilities', 'get'],
		['aggregators', 'get'],
	],
});
