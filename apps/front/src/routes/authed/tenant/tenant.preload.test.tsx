/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePickerOnlyPreloadSuite } from '~/__tests__/support/tenant-preload-suite';
import { PICKER_RESPONSE } from '~/__tests__/support/tenant-preload-support';
import { Route as PageRoute } from '~/routes/authed/tenant';

/**
 * #2340 — the real tenant portal layout preloads the workspace picker from the route's own query spec (see `tenant-preload-suite.tsx` for the harness rationale).
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
	title: 'tenant portal layout',
	route: PageRoute,
	linkTo: '/tenant',
	path: '/tenant',
	linkLabel: 'open portal',
	pageTestId: 'tenant-portal-picker',
	// Two active workspaces and no saved choice: the portal stays on the picker
	// (a single one would redirect into the account section).
	picker: {
		...PICKER_RESPONSE,
		tenants: [
			...PICKER_RESPONSE.tenants,
			{ id: 'tenant-preload-2', name: 'Other Org', status: 'active' },
		],
		activeCount: 2,
		totalCount: 2,
	},
});
