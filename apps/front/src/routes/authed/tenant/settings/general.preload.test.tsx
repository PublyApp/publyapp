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
	title: 'tenant settings general',
	route: GeneralRoute,
	linkTo: '/tenant/settings',
	path: '/tenant/settings',
	linkLabel: 'open settings',
	pageTestId: 'tenant-settings-general-page',
	endpoints: [['settings', 'general', 'get']],
});
