/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	renderPreloadScenario,
	requestQueryParameters,
} from '~/__tests__/support/preload-harness';
import { respond } from '~/__tests__/support/preload-mocks';
import { definePreloadSuite } from '~/__tests__/support/preload-suite';
import { Route as StaffInvitationsRoute } from '~/routes/authed/staff/invitations/index';

/**
 * #2340 — the real staff invitations route preloads its page list from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the list and the roles lookup once; the click paints
 * them from cache.
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

const INVITATIONS_PATH = ['staff', 'invitations', 'get'] as const;
// The full staff roles list that resolves the role filter, warmed with the list.
const ROLES_LOOKUP_PATH = ['staff', 'roles', 'get'] as const;
const LINK_LABEL = 'open invitations';
const ROLE_A = '11111111-1111-4111-8111-111111111111';
const ROLE_B = '22222222-2222-4222-8222-222222222222';

definePreloadSuite({
	title: 'staff invitations',
	route: StaffInvitationsRoute,
	linkTo: '/staff/invitations',
	path: '/staff/invitations',
	linkLabel: LINK_LABEL,
	endpoints: [
		[INVITATIONS_PATH, 1],
		[ROLES_LOOKUP_PATH, 1],
	],
	// The page reads the roles lookup a second time after the click.
	clickEndpoints: [
		[INVITATIONS_PATH, 1],
		[ROLES_LOOKUP_PATH, 2],
	],
	warmed: 2,
	pageTestId: 'staff-invitations-table',
	variants: [
		{
			title: 'a filtered URL warms the key the page reads for that URL',
			search: { status: 'pending' },
			clickEndpoints: [
				[INVITATIONS_PATH, 2],
				[ROLES_LOOKUP_PATH, 2],
			],
		},
	],
	// The role filter is the API's (by id, CSV): it must reach the request so it
	// spans every page; a role name left in an old bookmark is never sent.
	extraTests: (destination) => {
		const roleIdSent = async (role: string) => {
			respond.mockClear();
			const { queryClient } = renderPreloadScenario({
				destination: destination({ role }),
				linkLabel: LINK_LABEL,
			});
			fireEvent.mouseEnter(
				await screen.findByRole('link', { name: LINK_LABEL }),
			);
			await waitFor(() => {
				expect(countCallsByPath(respond, ...INVITATIONS_PATH)).toBe(1);
			});
			await waitFor(() => {
				expect(queryClient.isFetching()).toBe(0);
			});
			const [parameters] = requestQueryParameters(respond, ...INVITATIONS_PATH);
			cleanup();
			return parameters?.roleId;
		};

		test('sends the picked role ids to the API, and drops anything that is not an id', async () => {
			expect(await roleIdSent(`${ROLE_A},${ROLE_B}`)).toBe(
				`${ROLE_A},${ROLE_B}`,
			);
			expect(await roleIdSent(`Writer,${ROLE_A}`)).toBe(ROLE_A);
			expect(await roleIdSent('Writer')).toBeUndefined();
		});
	},
});
