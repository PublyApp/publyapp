/**
 * @vitest-environment jsdom
 */

import { vi } from 'vitest';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffSystemJobsRoute } from '~/routes/authed/staff/jobs/system-jobs';

/**
 * #2340 — the real staff system-jobs route preloads its four page queries (permissions included, a page query through `_permissions.ts`) from the route's own query spec (see `staff-users.preload.test.tsx` for the harness rationale).
 * Hover warms each page query exactly once and renders nothing; after the click
 * the page's own hooks observe the very queries the loader warmed, and the
 * fresh data is reused: no additional fetch.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
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

definePreloadSuite({
	title: 'staff system-jobs',
	route: StaffSystemJobsRoute,
	linkTo: '/staff/jobs/system-jobs',
	path: '/staff/jobs/system-jobs',
	linkLabel: 'open system jobs',
	endpoints: [
		[['staff', 'jobs', 'systemJobs', 'get'], 2],
		[['staff', 'jobs', 'queue', 'get'], 1],
		[['staff', 'jobs', 'deadLetter', 'get'], 1],
		[['auth', 'scopeAuthData', 'get'], 1],
	],
	warmed: 5,
	pageTestId: 'staff-jobs-system-table',
	variants: [
		{
			title: 'a filtered URL warms the key the page reads for that URL',
			search: { is_enabled: 'true' },
		},
	],
});
