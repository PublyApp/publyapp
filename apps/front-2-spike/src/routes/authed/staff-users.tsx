import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { MembersTable } from '~/components/members-table';
import { staffUsersBrowserQuery, type StaffUsersVars } from '~/lib/query';

const normalizeStaffUsersSearch = (search: {
	q?: string;
	sortId?: string;
	sortOrder?: string;
	cursor?: string;
	probe?: string;
}): StaffUsersVars => {
	const sortOrder = search.sortOrder;
	const normalizedSortOrder =
		sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;
	const probe =
		search.probe === 'virtualization' ? ('virtualization' as const) : undefined;

	return {
		q: search.q,
		sortId: search.sortId,
		sortOrder: normalizedSortOrder,
		cursor: search.cursor,
		probe,
	};
};

type LoaderDeps = Omit<StaffUsersVars, 'probe'>;

const normalizeLoaderDeps = (search: {
	q?: string;
	sortId?: string;
	sortOrder?: 'asc' | 'desc';
	cursor?: string;
}): LoaderDeps => {
	return {
		q: search.q,
		sortId: search.sortId,
		sortOrder: search.sortOrder,
		cursor: search.cursor,
	};
};

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	validateSearch: (search) =>
		normalizeStaffUsersSearch({
			q: typeof search.q === 'string' ? search.q : undefined,
			sortId: typeof search.sortId === 'string' ? search.sortId : undefined,
			sortOrder:
				typeof search.sortOrder === 'string' ? search.sortOrder : undefined,
			cursor: typeof search.cursor === 'string' ? search.cursor : undefined,
			probe: typeof search.probe === 'string' ? search.probe : undefined,
		}),
	loaderDeps: ({ search }) => normalizeLoaderDeps(search),
	loader: () => {
		return undefined;
	},
	component: StaffUsersPage,
});

function StaffUsersPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const vars = normalizeStaffUsersSearch(search);
	const { data, isLoading } = useSuspenseQuery(staffUsersBrowserQuery(vars));

	const handleSearch = (query: string) => {
		navigate({
			search: {
				...search,
				q: query === '' ? undefined : query,
				cursor: undefined,
			},
			replace: true,
		});
	};

	const handleSortChange = (sortId?: string, sortOrder?: 'asc' | 'desc') => {
		navigate({
			search: {
				...search,
				sortId,
				sortOrder,
				cursor: undefined,
			},
			replace: true,
		});
	};

	const handleCursorChange = (cursor?: string) => {
		navigate({
			search: {
				...search,
				cursor,
			},
			replace: true,
		});
	};

	return (
		<div className="p-4">
			<MembersTable
				items={data?.data ?? []}
				vars={vars}
				nextCursor={data?.nextCursor}
				isLoading={isLoading}
				onSearch={handleSearch}
				onSortChange={handleSortChange}
				onCursorChange={handleCursorChange}
			/>
		</div>
	);
}
