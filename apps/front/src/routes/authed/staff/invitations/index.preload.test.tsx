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
		expect(warmed).toHaveLength(1);
		expect(warmed[0]?.state.data).toBeDefined();
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
});
