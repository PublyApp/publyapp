import { IconArrowLeft, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useOffsetPageClamp } from '~/components/table/offset-pagination';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button.variants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	toStaffProfileUserRows,
	useStaffProfileUsersQuery,
} from '~/lib/query/staff-profile-users';
import {
	selectStaffProfileCrumbName,
	staffProfileCrumbQuery,
	toStaffProfileDetails,
	useStaffProfileDetailsQuery,
} from '~/lib/query/staff-profiles';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	validateTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	buildListSelection,
	selectedListIds,
} from '../../_staff-list-selection';
import { useStaffTeamOverview } from '../../_staff-list-team';
import { buildColumns } from './_users-columns';
import { StaffProfileUsersList } from './_users-list';
import {
	ProfileDetailsError,
	ProfileDetailsLoading,
} from './_users-page-states';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DASH = '—';
const DEFAULT_SIZE = 100;

const StaffProfileUsersPage = () => {
	const navigate = Route.useNavigate();
	const { profileId } = Route.useParams();
	const search = parseTableSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { t } = useTranslation('common');
	const [pageIndex, setPageIndex] = useState(0);
	const [shouldLogout, setShouldLogout] = useState(false);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next),
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
	const team = useStaffTeamOverview();
	const rows = toStaffProfileUserRows(usersQuery.data?.users);
	const columns = useMemo(() => buildColumns(t), [t]);
	const details = toStaffProfileDetails(detailQuery.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const listSelection = buildListSelection(
		rows,
		selection,
		controller.search.resetDraftToCommitted,
	);
	const selectedIds = selectedListIds(rows, selection);

	const clampedPageIndex = useOffsetPageClamp({
		pageIndex,
		size: controller.size,
		count: usersQuery.data?.count,
		resetKeys: [
			profileId,
			controller.search.committed,
			controller.sort.id,
			controller.sort.order,
			controller.size,
		],
	});
	if (clampedPageIndex !== pageIndex) {
		setPageIndex(clampedPageIndex);
	}

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const navigateToTeam = useCallback(
		(
			toBe:
				| '/staff/staff-users'
				| '/staff/invitations'
				| '/staff/profiles'
				| '/staff/audit-logs',
		) => {
			void navigate({ to: toBe });
		},
		[navigate],
	);

	const detailIsPending = detailQuery.isPending;
	const detailIsError = detailQuery.isError;
	const detailError = detailQuery.error;
	if (detailError !== null && shouldLogoutForFailure(detailError)) {
		return <LogoutRedirect />;
	}

	const usersError = usersQuery.error;
	if (usersError !== null && shouldLogoutForFailure(usersError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	if (detailIsPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailIsError) {
		return (
			<ProfileDetailsError
				error={detailError}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	if (!details) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('staff-profile-not-found')}
				description={t('staff-profile-payload-empty')}
				testId="staff-profile-users-empty"
				actions={
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-profiles')}
					</Link>
				}
			/>
		);
	}

	const totalCount = usersQuery.data?.count ?? null;
	const hasPreviousPage = pageIndex > 0;
	const hasNextPage =
		totalCount !== null && (pageIndex + 1) * controller.size < totalCount;

	return (
		<div
			className="mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col gap-6"
			data-testid="staff-profile-users-page"
		>
			<div className="shrink-0 space-y-4">
				<div className="space-y-2">
					<Link to="/staff/profiles" className="publy-back-link">
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('back-to-staff-profiles')}
					</Link>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
								{t('staff-profile')}
							</p>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground">
								{details.name}
							</h1>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{t('assigned-users-for-this-staff-profile')}
							</p>
						</div>
					</div>
				</div>
			</div>

			<Tabs value="users" className="min-h-0 flex-1">
				<TabsList
					variant="line"
					aria-label={t('staff-profile-sections')}
					className="shrink-0"
				>
					<TabsTrigger
						value="basics"
						render={
							<Link to="/staff/profiles/$profileId" params={{ profileId }} />
						}
					>
						{t('basics')}
					</TabsTrigger>
					<TabsTrigger value="users">
						{t('users')}
						<span className="ml-2 flex h-5 items-center rounded-[var(--publy-radius-chip)] bg-secondary px-2 text-xs font-medium text-secondary-foreground tabular-nums">
							{totalCount ?? DASH}
						</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="users" className="publy-detail-tab-body min-h-0">
					<StaffProfileUsersList
						profileId={profileId}
						rows={rows}
						columns={columns}
						totalCount={totalCount}
						pageIndex={pageIndex}
						size={controller.size}
						hasPreviousPage={hasPreviousPage}
						hasNextPage={hasNextPage}
						isPending={usersQuery.isPending}
						isError={usersQuery.isError}
						isFetching={usersQuery.isFetching}
						q={search.q ?? ''}
						sorting={[
							{
								id: controller.sort.id,
								desc: controller.sort.order === 'desc',
							},
						]}
						selection={listSelection}
						rowSelection={selection}
						selectedIds={selectedIds}
						counts={team.counts}
						onSearch={(next) => {
							if (selection.selectedCount > 0) {
								return;
							}
							onSearchChange({ ...search, q: next, cursor: undefined });
							setPageIndex(0);
						}}
						onSortingChange={(next) =>
							controller.onSortChange(
								next[0]
									? {
											id: next[0].id,
											order: next[0].desc ? 'desc' : 'asc',
										}
									: undefined,
							)
						}
						onClearSelection={selection.clearSelection}
						onSelectAllVisible={() =>
							selection.onSelectionChange(new Set(rows.map((row) => row.id)))
						}
						onSessionExpired={onSessionExpired}
						onRetry={() => void usersQuery.refetch()}
						onPageSizeChange={(nextSize) => {
							setPageIndex(0);
							controller.onSizeChange(nextSize);
						}}
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
						onOpen={(row) =>
							void navigate({
								to: '/staff/staff-users/$userId',
								params: { userId: row.id },
							})
						}
						onTeamSelect={navigateToTeam}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId/users',
)({
	staticData: {
		pageOwnsSecondaryPanel: true,
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-staff-profiles', to: '/staff/profiles' },
			{
				kind: 'entity',
				to: `/staff/profiles/${params.profileId}`,
				query: staffProfileCrumbQuery,
				select: selectStaffProfileCrumbName,
			},
			{ kind: 'label', labelKey: 'common:users' },
		],
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: StaffProfileUsersPage,
});
