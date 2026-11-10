import { useQuery } from '@tanstack/react-query';

// Second fake factory: the child-route fixture reads it, so a walk that leaked
// across the route boundary would attribute it to the parent.
export const fakeStaffRolesQueryOptions = {
	queryKey: (variables: { size: number }) =>
		['fake-staff-roles', variables] as const,
	fetcher: (_variables: { size: number }) => Promise.resolve([]),
};

export const useFakeStaffRolesQuery = (variables: { size: number }) =>
	useQuery({
		queryKey: fakeStaffRolesQueryOptions.queryKey(variables),
		queryFn: () => fakeStaffRolesQueryOptions.fetcher(variables),
	});
