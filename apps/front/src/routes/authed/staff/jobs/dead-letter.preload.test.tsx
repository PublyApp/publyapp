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
import { Route as DestinationRoute } from '~/routes/authed/staff/jobs/dead-letter';

/**
 * #2340 — the real staff dead-letter route preloads its page queries from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale).
 *
 * Hover warms each page query exactly once and renders nothing. After the
 * click the page's own hooks observe the very queries the loader warmed — a
 * warmed key the page does not read would stay without observers — and the
 * fresh data is reused: no additional fetch.
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

/** Each endpoint the page reads, with how many distinct queries hit it. */
const ENDPOINTS: readonly (readonly [readonly string[], number])[] = [
	[['staff', 'jobs', 'queue', 'get'], 1],
	[['staff', 'jobs', 'deadLetter', 'get'], 2],
	[['staff', 'jobs', 'systemJobs', 'get'], 1],
	[['auth', 'scopeAuthData', 'get'], 1],
];
/** Payloads the page needs to mount its queries; every other call gets `{}`. */
const RESPONSES: readonly (readonly [readonly string[], FakeResponse])[] = [];
const WARMED_COUNT = 5;
const LINK_LABEL = 'open dead letters';

const buildDestination = (linkSearch?: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/staff/jobs/dead-letter',
		linkSearch,
		path: '/staff/jobs/dead-letter',
		options: DestinationRoute.options,
	});

const expectEndpointCalls = () => {
	for (const [suffix, count] of ENDPOINTS) {
		expect(countCallsByPath(mocks.respond, ...suffix)).toBe(count);
	}
};

const hoverThenClick = async (linkSearch?: Record<string, string>) => {
	const { queryClient } = renderPreloadScenario({
		destination: buildDestination(linkSearch),
		linkLabel: LINK_LABEL,
	});
	const link = await screen.findByRole('link', { name: LINK_LABEL });
	expect(mocks.respond).not.toHaveBeenCalled();

	fireEvent.mouseEnter(link);
	await waitFor(expectEndpointCalls);
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});

	const warmed = preloadedQueries(queryClient);
	const snapshot = warmedSnapshot(warmed);
	expect(warmed).toHaveLength(WARMED_COUNT);
	// Preloading never navigates: nothing observes the warmed queries yet.
	expect(warmed.every((query) => query.getObserversCount() === 0)).toBe(true);

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

describe('#2340 staff dead-letter route preload', () => {
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

	test('hovering the link warms every page query exactly once', async () => {
		const { queryClient } = renderPreloadScenario({
			destination: buildDestination(),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(mocks.respond).not.toHaveBeenCalled();

		fireEvent.mouseEnter(link);

		await waitFor(expectEndpointCalls);
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(WARMED_COUNT);
		expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
		expect(screen.queryByRole('link', { name: LINK_LABEL })).not.toBeNull();
	});

	test('clicking after the preload reads the warmed queries with no refetch', async () => {
		const { warmed, snapshot } = await hoverThenClick();

		for (const query of warmed) {
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expectEndpointCalls();
	});

	test('a non-default URL search warms the keys the page reads for that URL', async () => {
		const { warmed, snapshot } = await hoverThenClick({ q: 'timeout' });

		// Same keys as the page, so the click fetched nothing new.
		for (const query of warmed) {
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expectEndpointCalls();
	});

	test('tenant, job type and external state filters reach the dead-letter request', async () => {
		const { warmed, snapshot } = await hoverThenClick({
			tenant_id: '0192f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f',
			job_type: 'post.publish',
			external_state_status: '6',
		});

		// The filtered list is one of the two dead-letter calls; the other is the
		// unfiltered overview count. Dropping any filter leaves no such call.
		const filtered = mocks.respond.mock.calls
			.map(([call]) => call)
			.filter((call) =>
				pathEndsWith(call, 'staff', 'jobs', 'deadLetter', 'get'),
			)
			.map(
				(call) =>
					(call.args[0] as { queryParameters?: Record<string, unknown> })
						?.queryParameters,
			)
			.filter(
				(params) =>
					params?.tenantId === '0192f4c2-7a1b-7c3d-8e4f-5a6b7c8d9e0f' &&
					params.jobType === 'post.publish' &&
					params.externalStateStatus === '6',
			);
		expect(filtered).toHaveLength(1);
		for (const query of warmed) {
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expectEndpointCalls();
	});
});
