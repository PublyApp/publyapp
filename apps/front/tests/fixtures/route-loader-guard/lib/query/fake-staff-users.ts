import { useQuery } from '@tanstack/react-query';

// Fixture for route-loader-query-key-guard.test.ts (#2340): a fake factory and
// the fake hook delegating to it. Lives under `lib/query/` so the guard's
// module filter (`lib/`) resolves it exactly like a production module.
export const fakeStaffUsersQueryOptions = {
	queryKey: (variables: { size: number }) =>
		['fake-staff-users', variables] as const,
	fetcher: (_variables: { size: number }) => Promise.resolve([]),
};

export const useFakeStaffUsersQuery = (variables: { size: number }) =>
	useQuery({
		queryKey: fakeStaffUsersQueryOptions.queryKey(variables),
		queryFn: () => fakeStaffUsersQueryOptions.fetcher(variables),
	});
