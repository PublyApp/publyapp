/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	renderPreloadScenario,
} from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffRolesRoute } from '~/routes/authed/staff/roles';

/**
 * #2340 — the real staff roles route preloads its page list from the route's
 * own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the list once; the click paints it from cache.
 */

vi.mock('~/lib/api-client/client-manager', () =>
	import('~/__tests__/support/preload-mocks').then((m) =>
		m.clientManagerModule(),
	),
);

const ROLES_PATH = ['staff', 'roles', 'get'] as const;
const LINK_LABEL = 'open roles';

definePreloadSuite({
	title: 'staff roles',
	route: StaffRolesRoute,
	linkTo: '/staff/roles',
	path: '/staff/roles',
	linkLabel: LINK_LABEL,
	endpoints: [[ROLES_PATH, 1]],
	warmed: 1,
	pageTestId: 'staff-roles-table',
	variants: [
		{
			title: 'a filtered URL warms the key the page reads for that URL',
			search: { q: 'admin' },
			clickEndpoints: [[ROLES_PATH, 2]],
		},
	],
	extraTests: (destination) => {
		test('one chosen type filters on the server, both types do not', async () => {
			const typeSent = async (type: string) => {
				respond.mockClear();
				const { queryClient } = renderPreloadScenario({
					destination: destination({ type }),
					linkLabel: LINK_LABEL,
				});
				fireEvent.mouseEnter(
					await screen.findByRole('link', { name: LINK_LABEL }),
				);
				await waitFor(() => {
					expect(countCallsByPath(respond, ...ROLES_PATH)).toBe(1);
				});
				await waitFor(() => {
					expect(queryClient.isFetching()).toBe(0);
				});
				const call = respond.mock.calls
					.map(([fake]) => fake)
					.find((fake) => fake.path.join('.').endsWith(ROLES_PATH.join('.')));
				cleanup();
				return (
					call?.args[0] as { queryParameters?: { type?: string } } | undefined
				)?.queryParameters?.type;
			};

			expect(await typeSent('system')).toBe('system');
			expect(await typeSent('system,custom')).toBeUndefined();
		});
	},
});
