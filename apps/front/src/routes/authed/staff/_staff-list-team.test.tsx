/** @vitest-environment jsdom */
/**
 * Pins the staff team overview's counter cache contract (CI #2315 rounds 3/3b):
 *
 * - every section's counter is ONE filter-independent query entry
 *   (`{ size: 1 }` / `{ limit: 100 }`), so the side panel never refetches on a
 *   page/filter change and always reads the whole collection;
 * - a page rendering a list publishes its response under that entry ONLY when
 *   its variables carry no filter/search — the API facets the FILTERED
 *   collection, so a filtered response is a slice, not a counter;
 * - `staleTime: Infinity` belongs to the canonical counter entry alone; the
 *   page's own list keeps the app's normal freshness.
 */
import {
	QueryClient,
	QueryClientProvider,
	type QueryClientConfig,
} from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { QueryArgumentRecord } from '@org/shared-ts/lib/query/keys';

import {
	STAFF_TEAM_COUNT_VARIABLES,
	staffTeamCountQueryKey,
	useStaffTeamOverview,
} from './_staff-list-team';

const mocks = vi.hoisted(() => ({
	// The real builders are exercised by their own modules; here we only need
	// the key/fetcher pair the team overview calls.
	staffUsersQueryOptions: {
		queryKey: vi.fn((variables: QueryArgumentRecord) => [
			'staff',
			'staff-users',
			variables,
		]),
		fetcher: vi.fn(),
	},
	staffInvitationsQueryOptions: {
		queryKey: vi.fn((variables: QueryArgumentRecord) => [
			'staff',
			'staff-invitations',
			variables,
		]),
		fetcher: vi.fn(),
	},
	staffRolesQueryOptions: {
		queryKey: vi.fn((variables: QueryArgumentRecord) => [
			'staff',
			'staff-roles',
			variables,
		]),
		fetcher: vi.fn(),
	},
}));

vi.mock('~/lib/query/staff-users', () => ({
	STAFF_USERS_QUERY_KEY: ['staff-users'],
	staffUsersQueryOptions: mocks.staffUsersQueryOptions,
}));
vi.mock('~/lib/query/staff-invitations', () => ({
	STAFF_INVITATIONS_QUERY_KEY: ['staff-invitations'],
	staffInvitationsQueryOptions: mocks.staffInvitationsQueryOptions,
}));
vi.mock('~/lib/query/staff-roles', () => ({
	STAFF_ROLES_QUERY_KEY: ['staff-roles'],
	staffRolesQueryOptions: mocks.staffRolesQueryOptions,
}));

const OPTIONS = {
	defaultOptions: { queries: { retry: false } },
} satisfies QueryClientConfig;

const UNFILTERED_RESULT = {
	data: [],
	totalCount: 12,
	counts: { pending: 3, accepted: 4, expired: 2, revoked: 3 },
};

const FILTERED_RESULT = {
	data: [],
	totalCount: 2,
	counts: { pending: 0, accepted: 0, expired: 0, revoked: 2 },
};

const invitationsFetcher = () => mocks.staffInvitationsQueryOptions.fetcher;

// `scopedKey('staff', [...QUERY_KEY, variables])` — the exact key the real
// list hooks build (see packages/shared-ts/src/lib/query/create-hooks.ts).
const INVITATIONS_COUNT_KEY = ['staff', 'staff-invitations', { size: 1 }];
const invitationsPageKey = (variables: QueryArgumentRecord) => [
	'staff',
	'staff-invitations',
	variables,
];

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
	queryClient = new QueryClient(OPTIONS);
	mocks.staffUsersQueryOptions.fetcher
		.mockReset()
		.mockResolvedValue({ data: [], totalCount: 0 });
	mocks.staffInvitationsQueryOptions.fetcher
		.mockReset()
		.mockResolvedValue(UNFILTERED_RESULT);
	mocks.staffRolesQueryOptions.fetcher
		.mockReset()
		.mockResolvedValue({ data: [], totalCount: 0 });
});

afterEach(cleanup);

describe('useStaffTeamOverview counter cache', () => {
	test('falls back to filter-independent one-row variables', async () => {
		renderHook(() => useStaffTeamOverview(), { wrapper });

		await waitFor(() => {
			expect(invitationsFetcher()).toHaveBeenCalledWith(
				STAFF_TEAM_COUNT_VARIABLES.invitations,
			);
			expect(mocks.staffUsersQueryOptions.fetcher).toHaveBeenCalledWith(
				STAFF_TEAM_COUNT_VARIABLES.staff,
			);
			expect(mocks.staffRolesQueryOptions.fetcher).toHaveBeenCalledWith(
				STAFF_TEAM_COUNT_VARIABLES.roles,
			);
		});
		expect(STAFF_TEAM_COUNT_VARIABLES.invitations).toEqual({ size: 1 });
	});

	test('the canonical key is the scoped list key plus the count variables', () => {
		expect(staffTeamCountQueryKey('invitations')).toEqual(
			INVITATIONS_COUNT_KEY,
		);
		expect(staffTeamCountQueryKey('staff')).toEqual([
			'staff',
			'staff-users',
			{ size: 1 },
		]);
		expect(staffTeamCountQueryKey('roles')).toEqual([
			'staff',
			'staff-roles',
			{ limit: 100 },
		]);
	});

	test('publishes an unfiltered page response under the canonical counter key', async () => {
		// Paging/sort never move `counts`/`totalCount` (the API facets before
		// cursor/order/limit), so this page IS the whole collection.
		const pageVariables = {
			size: 100,
			sortId: 'created_at',
			sortOrder: 'desc' as const,
		};
		renderHook(() => useStaffTeamOverview({ invitations: pageVariables }), {
			wrapper,
		});

		await waitFor(() => {
			expect(queryClient.getQueryData(INVITATIONS_COUNT_KEY)).toEqual(
				UNFILTERED_RESULT,
			);
		});
		// The page's own entry was reused: no second `{ size: 1 }` GET.
		expect(invitationsFetcher()).toHaveBeenCalledTimes(1);
		expect(invitationsFetcher()).toHaveBeenCalledWith(pageVariables);
	});

	test('does not publish a status-filtered page response', async () => {
		const pageVariables = { size: 100, status: 'revoked' };
		const pageKey = invitationsPageKey(pageVariables);
		// The page's own hook already loaded the filtered slice.
		queryClient.setQueryData(pageKey, FILTERED_RESULT);

		const { result } = renderHook(
			() => useStaffTeamOverview({ invitations: pageVariables }),
			{ wrapper },
		);

		await waitFor(() => {
			expect(result.current.counts.invitations).toBe(
				UNFILTERED_RESULT.totalCount,
			);
		});
		expect(queryClient.getQueryData(INVITATIONS_COUNT_KEY)).toEqual(
			UNFILTERED_RESULT,
		);
		expect(queryClient.getQueryData(INVITATIONS_COUNT_KEY)).not.toEqual(
			FILTERED_RESULT,
		);
		// The filtered page response is never fetched *or* published by the
		// counter: the counter reads its own unfiltered entry.
		expect(invitationsFetcher()).not.toHaveBeenCalledWith(pageVariables);
		expect(invitationsFetcher()).toHaveBeenCalledWith(
			STAFF_TEAM_COUNT_VARIABLES.invitations,
		);
	});

	test('does not publish a searched page response', async () => {
		const pageVariables = { size: 100, q: 'ada' };
		queryClient.setQueryData(
			invitationsPageKey(pageVariables),
			FILTERED_RESULT,
		);

		const { result } = renderHook(
			() => useStaffTeamOverview({ invitations: pageVariables }),
			{ wrapper },
		);

		await waitFor(() => {
			expect(result.current.counts.invitations).toBe(
				UNFILTERED_RESULT.totalCount,
			);
		});
		expect(queryClient.getQueryData(INVITATIONS_COUNT_KEY)).toEqual(
			UNFILTERED_RESULT,
		);
		expect(invitationsFetcher()).not.toHaveBeenCalledWith(pageVariables);
	});

	test('the canonical counter entry is never stale', async () => {
		const { unmount } = renderHook(() => useStaffTeamOverview(), { wrapper });
		await waitFor(() => {
			expect(invitationsFetcher()).toHaveBeenCalledTimes(1);
		});
		unmount();

		// Age the counter past every plausible default `staleTime`.
		queryClient.setQueryData(INVITATIONS_COUNT_KEY, UNFILTERED_RESULT, {
			updatedAt: Date.now() - 60_000,
		});
		const counterObserverResult = () =>
			queryClient
				.getQueryCache()
				.find({ queryKey: INVITATIONS_COUNT_KEY })
				?.observers[0]?.getCurrentResult();

		// An aged-but-fresh counter is reused in place, never re-fetched, and
		// its observer still reports the minute-old data as fresh — the only
		// way that happens is `staleTime: Infinity`.
		renderHook(() => useStaffTeamOverview(), { wrapper });
		await waitFor(() => {
			expect(counterObserverResult()?.data).toEqual(UNFILTERED_RESULT);
		});
		expect(counterObserverResult()?.isStale).toBe(false);
		expect(invitationsFetcher()).toHaveBeenCalledTimes(1);
	});

	test("the page list keeps the app's normal freshness", async () => {
		const pageVariables = { size: 100 };
		const first = renderHook(
			() => useStaffTeamOverview({ invitations: pageVariables }),
			{ wrapper },
		);
		await waitFor(() => {
			expect(invitationsFetcher()).toHaveBeenCalledTimes(1);
		});
		first.unmount();

		// Age the page entry only: a normal list re-fetches when stale, unlike
		// the counter entry above.
		queryClient.setQueryData(
			invitationsPageKey(pageVariables),
			UNFILTERED_RESULT,
			{ updatedAt: Date.now() - 60_000 },
		);
		renderHook(() => useStaffTeamOverview({ invitations: pageVariables }), {
			wrapper,
		});
		await waitFor(() => {
			expect(invitationsFetcher()).toHaveBeenCalledTimes(2);
		});
	});
});
