/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	pathEndsWith,
	preloadedQueries,
	renderPreloadScenario,
	warmedSnapshot,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as DestinationRoute } from '~/routes/authed/staff/tenants/$tenantId/users/$userId-edit';

/**
 * #2340 — the real staff tenant user edit route preloads its page queries from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale).
 *
 * Hover warms each page query exactly once and renders nothing. After the
 * click the page's own hooks observe the very queries the loader warmed — a
 * warmed key the page does not read would stay without observers — and the
 * fresh data is reused: no additional fetch. Each URL variant checks that the
 * loader warms the keys the page reads for that very URL.
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
			i18n: {
				language: 'en',
				getFixedT: () => (key: string) => key,
				t: (key: string) => key,
			},
		}),
	};
});

type Endpoint = readonly [readonly string[], number];
type Variant = {
	title: string;
	search: Record<string, string> | undefined;
	/** Each endpoint the page reads, with how many distinct queries hit it. */
	endpoints: readonly Endpoint[];
	warmed: number;
};

const VARIANTS: readonly Variant[] = [
	{
		title: 'default URL',
		search: undefined,
		endpoints: [
			[['tenants', 'byTenantId', 'get'], 1],
			[['users', 'byUserId', 'get'], 1],
		],
		warmed: 2,
	},
];
/** Payloads the page needs to mount its queries; every other call gets `{}`. */
const RESPONSES: readonly (readonly [readonly string[], FakeResponse])[] = [
	[
		['tenants', 'byTenantId', 'get'],
		{
			tenantId: 't1',
			name: 'Acme Corporation',
			maxUsers: 10,
			status: 'Active',
		},
	],
	[['roles', 'byRoleId', 'get'], { role: { id: 'p1', name: 'Approvers' } }],
	[['roles', 'byRoleId', 'permissions', 'get'], { permissionKeys: [] }],
	[['byRoleId', 'users', 'get'], { users: [] }],
	[['permissions', 'scopes', 'tenant', 'get'], { additionalData: {} }],
];
const LINK_LABEL = 'open tenant user edit';

const buildDestination = (linkSearch?: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/staff/tenants/t1/users/u1/edit',
		linkSearch,
		path: '/staff/tenants/$tenantId/users/$userId/edit',
		options: DestinationRoute.options,
	});

const expectEndpointCalls = (variant: Variant) => {
	for (const [suffix, count] of variant.endpoints) {
		expect(countCallsByPath(mocks.respond, ...suffix)).toBe(count);
	}
};

const hoverThenClick = async (variant: Variant) => {
	const { queryClient } = renderPreloadScenario({
		destination: buildDestination(variant.search),
		linkLabel: LINK_LABEL,
	});
	const link = await screen.findByRole('link', { name: LINK_LABEL });
	expect(mocks.respond).not.toHaveBeenCalled();

	fireEvent.mouseEnter(link);
	await waitFor(() => expectEndpointCalls(variant));
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});

	const warmed = preloadedQueries(queryClient);
	const snapshot = warmedSnapshot(warmed);
	expect(warmed).toHaveLength(variant.warmed);
	expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
	// Preloading never navigates: nothing observes the warmed queries yet.
	expect(warmed.every((query) => query.getObserversCount() === 0)).toBe(true);
	expect(screen.queryByRole('link', { name: LINK_LABEL })).not.toBeNull();

	fireEvent.click(link);
	await waitFor(() => {
		// The page's own hooks observe the very queries the loader warmed.
		expect(warmed.every((query) => query.getObserversCount() > 0)).toBe(true);
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});

	return { warmed, snapshot };
};

describe('#2340 staff tenant user edit route preload', () => {
	beforeEach(() => {
		mocks.respond.mockImplementation((call: FakeClientCall): FakeResponse => {
			const match = RESPONSES.find(([suffix]) => pathEndsWith(call, ...suffix));
			return match === undefined ? {} : match[1];
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test.each(VARIANTS)(
		'$title: clicking after the hover reads the warmed queries with no refetch',
		async (variant) => {
			const { warmed, snapshot } = await hoverThenClick(variant);

			for (const query of warmed) {
				expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
			}
			expectEndpointCalls(variant);
		},
	);
});
