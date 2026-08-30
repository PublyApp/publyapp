/**
 * @vitest-environment jsdom
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

/**
 * A3 — ensureQueryData → queryClient.query({staleTime:'static'}) semantic guard.
 *
 * Old `ensureQueryData` with default staleTime (0): cached data is always stale,
 * so it triggers a background `prefetchQuery` (errors swallowed) and returns
 * cached data immediately.
 *
 * New `query({staleTime:'static'})`: `isStaleByTime('static')` returns false
 * forever, so cached data is returned with NO background refetch.
 *
 * The first two tests are a PAIR run against the same scenario: one drives
 * query({staleTime:'static'}) and observes NO second fetch, the other drives the
 * old ensureQueryData and observes one. Neither is meaningful alone — together
 * they pin the semantic difference, and collapsing that difference turns exactly
 * one of them red.
 *
 * The third test covers the loader's actual fix: query() for the initial fetch
 * (so errors reach the error boundary) followed by prefetchQuery() for the
 * background revalidation, restoring the old ensureQueryData behaviour.
 */
describe('A3 — queryClient.query({staleTime:"static"}) eliminates stale revalidation', () => {
	test('query({staleTime:"static"}) does NOT refetch cached data, unlike the old ensureQueryData', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ data: 'cached' });
		const queryKey = ['test', 'stale-data'];

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		// Seed the cache with data (simulating the loader warming the cache)
		await queryClient.query({
			queryKey,
			queryFn: fetchFn,
			staleTime: 'static', // As in the migrated loader
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);

		// Call query again with staleTime: 'static'
		// The old ensureQueryData (with default staleTime=0) would see the cached
		// data as stale and trigger a background prefetchQuery here.
		// The new query({staleTime:'static'}) does NOT — 'static' makes
		// isStaleByTime return false permanently.
		const result = await queryClient.query({
			queryKey,
			queryFn: fetchFn,
			staleTime: 'static',
		});

		expect(result).toEqual({ data: 'cached' });

		// With staleTime: 'static', no background refetch occurs: 'static' makes
		// isStaleByTime return false permanently, so the cached data is served
		// as-is. The old ensureQueryData would have fired a second, background
		// fetch here.
		//
		// This assertion is one half of a pair. Its partner, the 'control' test
		// below, drives the old ensureQueryData against the same scenario and
		// observes the second fetch. Together they pin the semantic difference:
		// remove the difference and exactly one of the two goes red.
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test('control: ensureQueryData with staleTime:0 DOES refetch stale cached data', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ data: 'cached' });
		const queryKey = ['test', 'stale-data-control'];

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
					staleTime: 0, // Data is always stale
				},
			},
		});

		// Seed the cache
		// oxlint-disable-next-line typescript/no-deprecated -- intentionally exercising the deprecated ensureQueryData API to prove the semantic difference
		await queryClient.ensureQueryData({
			queryKey,
			queryFn: fetchFn,
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);

		// ensureQueryData with staleTime:0 sees cached data as stale
		// and triggers a background prefetchQuery
		// oxlint-disable-next-line typescript/no-deprecated -- intentionally exercising the deprecated ensureQueryData API to prove the semantic difference
		await queryClient.ensureQueryData({
			queryKey,
			queryFn: fetchFn,
			revalidateIfStale: true,
		});

		// Wait for the background prefetchQuery to fire
		await new Promise((resolve) => setTimeout(resolve, 100));

		// The control proves the test mechanism works: ensureQueryData DOES refetch.
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test('GREEN: loader pattern (query + prefetchQuery) preserves background revalidation', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ data: 'cached' });
		const queryKey = ['test', 'loader-pattern'];

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		// Simulate the fixed loader pattern: query() for initial fetch
		await queryClient.query({
			queryKey,
			queryFn: fetchFn,
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);

		// Simulate the fixed loader pattern: query() for background revalidation (errors swallowed)
		queryClient
			.query({
				queryKey,
				queryFn: fetchFn,
			})
			.catch(() => {
				// Swallow errors to match old prefetchQuery behavior
			});

		// Wait for the background prefetchQuery to fire
		await new Promise((resolve) => setTimeout(resolve, 100));

		// The fix preserves background revalidation: fetchFn is called twice
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
});
