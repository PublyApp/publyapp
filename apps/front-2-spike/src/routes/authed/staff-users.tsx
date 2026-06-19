import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { MembersTable } from '~/components/members-table';
import { createServerClientFromCookie } from '~/lib/api-client';
import {
	staffUsersBrowserQuery,
	type StaffUsersVars,
	staffUsersServerQueryOptions,
} from '~/lib/query';
import { getCookieHeader } from '~/server/request-context';

const normalizeStaffUsersSearch = (search: {
	q?: string;
	sortId?: string;
	sortOrder?: string;
	cursor?: string;
}): StaffUsersVars => {
	const sortOrder = search.sortOrder;
	const normalizedSortOrder =
		sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;

	return {
		q: search.q,
		sortId: search.sortId,
		sortOrder: normalizedSortOrder,
		cursor: search.cursor,
	};
};

const parseRequestSearch = (request: Request): StaffUsersVars => {
	const url = new URL(request.url);
	return normalizeStaffUsersSearch({
		q: url.searchParams.get('q') ?? undefined,
		sortId: url.searchParams.get('sortId') ?? undefined,
		sortOrder: url.searchParams.get('sortOrder') ?? undefined,
		cursor: url.searchParams.get('cursor') ?? undefined,
	});
};

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	validateSearch: (search) =>
		normalizeStaffUsersSearch({
			q: typeof search.q === 'string' ? search.q : undefined,
			sortId: typeof search.sortId === 'string' ? search.sortId : undefined,
			sortOrder:
				typeof search.sortOrder === 'string' ? search.sortOrder : undefined,
			cursor: typeof search.cursor === 'string' ? search.cursor : undefined,
		}),
	loader: async (loaderContext) => {
		const { context, request } = loaderContext as {
			context: {
				queryClient: {
					ensureQueryData: (options: unknown) => Promise<unknown>;
				};
			};
			request?: Request;
		};
		const vars = request ? parseRequestSearch(request) : {};
		const cookieHeader = await getCookieHeader();
		const serverClient = createServerClientFromCookie(
			cookieHeader,
			undefined,
			'staff',
		);
		return context.queryClient.ensureQueryData(
			staffUsersServerQueryOptions(vars, serverClient),
		);
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
