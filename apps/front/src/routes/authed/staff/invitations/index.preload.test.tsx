/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	expectFilteredHoverClickReusesWarmedKeys,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	preloadedQueries,
	renderPreloadScenario,
	warmedSnapshot,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as StaffInvitationsRoute } from '~/routes/authed/staff/invitations/index';

/**
 * #2340 — the real staff invitations route preloads its page list from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the list once; the click paints it from cache.
 */
const mocks = vi.hoisted(() => ({
	respond: vi.fn((_call: FakeClientCall): FakeResponse => ({})),
}));

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const { buildFakeApiClient } =
		await import('~/routes/authed/staff/_preload-test-harness');
	const fakeClient = buildFakeApiClient(mocks.respond);

	return {
		...actual,
		getClientManager: () => ({
			getOrCreateClient: () => fakeClient,
			getOrCreateStaffClient: () => fakeClient,
			getOrCreateTenantScopeClient: () => fakeClient,
			getOrCreateAnonymousClient: () => fakeClient,
			getOrCreateSessionClient: () => fakeClient,
			clearClients: () => {},
		}),
	};
});

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({ logout: vi.fn() }),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
			i18n: { language: 'en' },
		}),
	};
});

const INVITATIONS_PATH = ['staff', 'invitations', 'get'] as const;
// The full staff roles list that resolves the role filter, warmed with the list.
const ROLES_LOOKUP_PATH = ['staff', 'roles', 'get'] as const;
const LINK_LABEL = 'open invitations';

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/invitations',
	path: '/staff/invitations',
	options: StaffInvitationsRoute.options,
});

describe('#2340 staff invitations route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering the link warms the page list exactly once', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});

		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(countCallsByPath(mocks.respond, ...INVITATIONS_PATH)).toBe(0);

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...INVITATIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(2);
		expect(countCallsByPath(mocks.respond, ...ROLES_LOOKUP_PATH)).toBe(1);
		expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
		expect(screen.queryByTestId('staff-invitations-table')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...INVITATIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-invitations-table')).toBeTruthy();
		});

		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
	});

	test('a filtered URL warms the key the page reads for that URL', async () => {
		await expectFilteredHoverClickReusesWarmedKeys({
			destination: widenOptions<PreloadDestination>({
				...destination,
				linkSearch: { status: 'pending' },
			}),
			linkLabel: LINK_LABEL,
			pageTestId: 'staff-invitations-table',
		});
	});

	// The role filter is the API's (by id, CSV): it must reach the request so it
	// spans every page; a role name left in an old bookmark is never sent.
	test('sends the picked role ids to the API, and drops anything that is not an id', async () => {
		const ROLE_A = '11111111-1111-4111-8111-111111111111';
		const ROLE_B = '22222222-2222-4222-8222-222222222222';
		const roleIdSent = async (role: string) => {
			mocks.respond.mockClear();
			const { queryClient } = renderPreloadScenario({
				destination: widenOptions<PreloadDestination>({
					...destination,
					linkSearch: { role },
				}),
				linkLabel: LINK_LABEL,
			});
			fireEvent.mouseEnter(
				await screen.findByRole('link', { name: LINK_LABEL }),
			);
			await waitFor(() => {
				expect(countCallsByPath(mocks.respond, ...INVITATIONS_PATH)).toBe(1);
			});
			await waitFor(() => {
				expect(queryClient.isFetching()).toBe(0);
			});
			const call = mocks.respond.mock.calls
				.map(([fake]) => fake)
				.find((fake) =>
					fake.path.join('.').endsWith(INVITATIONS_PATH.join('.')),
				);
			cleanup();
			return (
				call?.args[0] as { queryParameters?: { roleId?: string } } | undefined
			)?.queryParameters?.roleId;
		};

		expect(await roleIdSent(`${ROLE_A},${ROLE_B}`)).toBe(`${ROLE_A},${ROLE_B}`);
		expect(await roleIdSent(`Writer,${ROLE_A}`)).toBe(ROLE_A);
		expect(await roleIdSent('Writer')).toBeUndefined();
	});
});
