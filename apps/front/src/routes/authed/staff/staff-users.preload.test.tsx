/**
 * @vitest-environment jsdom
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
	renderPreloadScenario,
	requestQueryParameters,
} from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffUsersRoute } from '~/routes/authed/staff/staff-users';

/**
 * #2340 — the real staff-users route preloads its page list from the route's
 * own query spec.
 *
 * The loader never awaits: hovering the link runs it through the production
 * router's `defaultPreload: 'intent'`, and the factory warms the query cache
 * fire-and-forget. This spec mounts the REAL route options under a throwaway
 * router and counts the fake Kiota calls per endpoint:
 *
 * - hover fetches the page list exactly once;
 * - the click that follows paints the page from that cache with no additional
 *   fetch, and the page's own hook observes the warmed query.
 *
 * What is real: the production route's `loader`, `loaderDeps`,
 * `validateSearch` and page component, plus the real `lib/query` factories.
 * What is mocked: only the Kiota transport, react-i18next, and the logout
 * side effect.
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

const USERS_PATH = ['staff', 'users', 'get'] as const;
const LINK_LABEL = 'open staff users';

definePreloadSuite({
	title: 'staff-users',
	route: StaffUsersRoute,
	linkTo: '/staff/staff-users',
	path: '/staff/staff-users',
	linkLabel: LINK_LABEL,
	endpoints: [[USERS_PATH, 1]],
	warmed: 1,
	pageTestId: 'staff-users-table',
	variants: [
		{
			title: 'a filtered URL warms the key the page reads for that URL',
			search: { status: 'active' },
			clickEndpoints: [[USERS_PATH, 2]],
		},
	],
	extraTests: (destination) => {
		test('the access-level filter reaches the API (whole collection, every page)', async () => {
			respond.mockImplementation(() => ({
				data: [
					{
						id: 'u1',
						email: 'a@example.com',
						firstName: 'A',
						lastName: 'B',
						roles: [],
						isFullAccess: true,
						status: 'active',
					},
				],
				nextCursor: null,
				totalCount: 20,
				counts: {
					total: 20,
					active: 20,
					suspended: 0,
					fullAccess: 2,
					standardAccess: 18,
				},
			}));
			renderPreloadScenario({
				destination: destination({ role: 'full_access' }),
				linkLabel: LINK_LABEL,
			});
			fireEvent.click(await screen.findByRole('link', { name: LINK_LABEL }));
			await waitFor(() => {
				expect(screen.getByTestId('staff-users-table')).toBeTruthy();
			});

			const requests = requestQueryParameters(respond, ...USERS_PATH);
			// (The team overview also reads an unfiltered counter request.)
			expect(
				requests.some((parameters) => parameters.access === 'full_access'),
			).toBe(true);
		});
	},
});
