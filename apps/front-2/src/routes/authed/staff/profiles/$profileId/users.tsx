import { Card, Spinner } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffProfileUserRows,
	useStaffProfileUsersQuery,
} from '~/lib/query/staff-profile-users';
import {
	toStaffProfileDetails,
	useStaffProfileDetailsQuery,
} from '~/lib/query/staff-profiles';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

const columns: ColumnDef<ReturnType<typeof toStaffProfileUserRows>[number]>[] =
	[
		{
			id: 'name',
			header: 'Name',
			enableSorting: false,
			cell: ({ row }) => (
				<div className="space-y-1">
					<p className="font-medium text-foreground">
						{getUserFullName({
							firstName: row.original.firstName,
							lastName: row.original.lastName,
						}) ||
							row.original.email ||
							'—'}
					</p>
					<p className="text-xs text-foreground-500">
						{row.original.email || 'No email address'}
					</p>
				</div>
			),
		},
		{
			id: 'status',
			header: 'Status',
			accessorKey: 'status',
			cell: ({ getValue }) => getValue<string | null>() ?? '—',
		},
	];

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (
	failure: ReturnType<typeof toApiFailure>,
	fallback: string,
): string => {
	if (failure.kind === 'problem') {
		return failure.detail || fallback;
	}

	return fallback;
};

const ProfileDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-profile-users-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading staff profile…</span>
		</div>
	</div>
);

const InvalidProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<AlertCircle aria-hidden="true" className="size-7" />}
			code="400 — Bad Request"
			title="Invalid profile link"
			description={getFailureDescription(
				failure,
				'This staff profile link is malformed or incomplete.',
			)}
			testId="staff-profile-users-invalid"
		/>
	);
};

const MissingProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon={<SearchX aria-hidden="true" className="size-7" />}
			code="404 — Not Found"
			title="Staff profile not found"
			description={getFailureDescription(
				failure,
				'The requested staff profile does not exist or is no longer available.',
			)}
			testId="staff-profile-users-not-found"
		/>
	);
};

const ProfileDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingProfileView error={error} />;
	}

	return (
		<AppErrorView
			icon={<AlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title="Unable to load this staff profile"
			description="There was a problem loading the profile details."
			testId="staff-profile-users-error"
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId/users',
)({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffProfileUsersPage,
});

function StaffProfileUsersPage() {
	const navigate = Route.useNavigate();
	const { profileId } = Route.useParams();
	const search = Route.useSearch();
	const [pageIndex, setPageIndex] = useState(0);
	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next) as unknown as TableSearchParams,
			replace: true,
		});
	};
	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});
	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const usersQuery = useStaffProfileUsersQuery(
		{
			profileId,
			q: controller.search.committed,
			sortId: controller.sort.id,
			sortOrder: controller.sort.order,
			pageIndex,
			size: controller.size,
		},
		{ enabled: profileId.length > 0 },
	);
	const rows = toStaffProfileUserRows(usersQuery.data?.users);
	const details = toStaffProfileDetails(detailQuery.data);

	useEffect(() => {
		setPageIndex(0);
	}, [
		profileId,
		controller.search.committed,
		controller.sort.id,
		controller.sort.order,
		controller.size,
	]);

	useEffect(() => {
		const totalCount = usersQuery.data?.count ?? 0;
		const lastPageIndex =
			totalCount > 0
				? Math.max(Math.ceil(totalCount / controller.size) - 1, 0)
				: 0;

		if (pageIndex > lastPageIndex) {
			setPageIndex(lastPageIndex);
		}
	}, [controller.size, pageIndex, usersQuery.data?.count]);

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(usersQuery.isError && shouldLogoutForFailure(usersQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailQuery.isError) {
		return <ProfileDetailsError error={detailQuery.error} />;
	}

	if (!details) {
		return (
			<AppErrorView
				icon={<SearchX aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Staff profile not found"
				description="The profile payload was empty."
				testId="staff-profile-users-empty"
			/>
		);
	}

	const hasPreviousPage = pageIndex > 0;
	const hasNextPage =
		(pageIndex + 1) * controller.size < (usersQuery.data?.count ?? 0);
	const usersFailure = usersQuery.isError
		? toApiFailure(usersQuery.error)
		: null;

	return (
		<div
			className="mx-auto w-full max-w-5xl space-y-6 p-4"
			data-testid="staff-profile-users-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link
						to="/staff/profiles"
						className="text-sm text-foreground-500 underline-offset-4 hover:text-foreground hover:underline"
					>
						Back to staff profiles
					</Link>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Staff profile
							</p>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground">
								{details.name}
							</h1>
							<p className="max-w-2xl text-sm text-foreground-500">
								Assigned users for this staff profile.
							</p>
						</div>
						<div className="rounded-large border border-divider bg-content1 p-4">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Assigned users
							</p>
							<p className="mt-2 text-2xl font-semibold text-foreground">
								{details.userAccountCount}
							</p>
						</div>
					</div>
				</div>

				<nav
					aria-label="Staff profile sections"
					className="flex flex-wrap gap-2 border-b border-divider pb-2"
				>
					<Link
						to="/staff/profiles/$profileId"
						params={{ profileId }}
						className="rounded-full border border-divider px-4 py-2 text-sm text-foreground-500 transition hover:border-default-400 hover:text-foreground"
					>
						Basics
					</Link>
					<span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
						Users
					</span>
				</nav>
			</div>

			<Card className="space-y-4 p-5">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">
						Assigned users
					</p>
					<p className="text-sm text-foreground-500">
						Read-only migration for the current profile users tab.
					</p>
				</div>

				<DataTable
					testId="staff-profile-users-table"
					ariaLabel="Assigned staff profile users"
					columns={columns}
					rows={rows}
					isPending={usersQuery.isPending}
					isError={usersQuery.isError}
					onRetry={() => void usersQuery.refetch()}
					errorContent={
						usersFailure?.kind === 'problem' && usersFailure.status === 403 ? (
							<p className="text-sm text-foreground-500">
								You do not have permission to view assigned users.
							</p>
						) : undefined
					}
					emptyContent="No users are assigned to this profile."
					noMatchContent="No assigned users match your search."
					hasActiveSearch={Boolean(controller.search.committed)}
					sort={controller.sort}
					onSortChange={controller.onSortChange}
					size={controller.size}
					onSizeChange={controller.onSizeChange}
					pageIndex={pageIndex}
					hasPreviousPage={hasPreviousPage}
					hasNextPage={hasNextPage}
					isPaginationPending={usersQuery.isFetching && !usersQuery.isPending}
					onNextPage={() => {
						if (hasNextPage) {
							setPageIndex((current) => current + 1);
						}
					}}
					onPreviousPage={() => {
						if (hasPreviousPage) {
							setPageIndex((current) => Math.max(current - 1, 0));
						}
					}}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
				/>
			</Card>
		</div>
	);
}
