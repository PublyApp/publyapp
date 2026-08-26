import { IconArrowLeft, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useOffsetPageClamp } from '~/components/table/offset-pagination';
import {
	type TableSelection,
	useRowSelection,
} from '~/components/table/use-row-selection';
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
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	validateTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { ProfileUsersListBulkActions } from './_users-bulk-actions';
import { buildColumns } from './_users-columns';
import {
	ProfileDetailsError,
	ProfileDetailsLoading,
} from './_users-page-states';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffProfileUsersPage = () => {
	const navigate = Route.useNavigate();
	const { profileId } = Route.useParams();
	const search = parseTableSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { t } = useTranslation('common');
	const [pageIndex, setPageIndex] = useState(0);
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
	const rows = toStaffProfileUserRows(usersQuery.data?.users);
	const columns = useMemo(() => buildColumns(t), [t]);
	const details = toStaffProfileDetails(detailQuery.data);
	const [shouldLogout, setShouldLogout] = useState(false);
	const selection = useRowSelection(rows.map((row) => row.id));

	// Entering selection mode discards an uncommitted table-search draft (the
	// search box is locked while rows are selected, so a live draft would sit
	// hidden until exit). Handled inside the selection-change path below rather
	// than a render-side effect — see the no-event-handler React Doctor rule.
	const { resetDraftToCommitted } = controller.search;
	const baseOnSelectionChange = selection.onSelectionChange;
	const onSelectionChange = useCallback(
		(next: TableSelection) => {
			if (!selection.isSelectionMode) {
				resetDraftToCommitted();
			}
			baseOnSelectionChange(next);
		},
		[selection.isSelectionMode, baseOnSelectionChange, resetDraftToCommitted],
	);
	const wrappedSelection = useMemo(
		() => ({ ...selection, onSelectionChange }),
		[selection, onSelectionChange],
	);

	// A deliberate reset (profile identity, search, sort, or size change)
	// must always win over a clamp derived from the destination query's
	// count — including an already-warm cached count, not just a missing
	// one (#999 review follow-up). Folded into one effect via resetKeys so
	// it cannot race a separate "reset to 0" effect.
	useOffsetPageClamp({
		pageIndex,
		setPageIndex,
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

	// Hoisted so the fatal-error gate reads plain locals, not query flags.
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

	// A bulk mutation hit an auth failure mid-session — log out through the
	// same central path as every other surface.
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

	const hasPreviousPage = pageIndex > 0;
	const hasNextPage =
		(pageIndex + 1) * controller.size < (usersQuery.data?.count ?? 0);
	const usersFailure = usersError !== null ? toApiFailure(usersError) : null;
	// Hoisted locals for the DataTable's table-body-state props.
	const usersIsPending = usersQuery.isPending;
	const usersIsError = usersQuery.isError;

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
						<div className="rounded-large border border-border bg-card p-4">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
								{t('assigned-users')}
							</p>
							<p className="mt-2 text-2xl font-semibold text-foreground">
								{details.userAccountCount}
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
					<TabsTrigger value="users">{t('users')}</TabsTrigger>
				</TabsList>

				<TabsContent value="users" className="publy-detail-tab-body min-h-0">
					{/* DataTable already renders its own `.publy-table-card` surface —
					no outer Card here, or it's a card inside a card (#978). */}
					<div className="shrink-0 space-y-1">
						<p className="text-lg font-semibold text-foreground">
							{t('assigned-users')}
						</p>
						<p className="text-sm text-muted-foreground">
							{t('staff-profile-users-description')}
						</p>
					</div>

					<DataTable
						testId="staff-profile-users-table"
						ariaLabel={t('assigned-staff-profile-users')}
						columns={columns}
						rows={rows}
						queryState={{
							isPending: usersIsPending,
							isError: usersIsError,
							onRetry: () => void usersQuery.refetch(),
							hasActiveSearch: Boolean(controller.search.committed),
						}}
						pagination={{
							pageIndex: pageIndex,
							hasPreviousPage: hasPreviousPage,
							hasNextPage: hasNextPage,
							isPaginationPending: usersQuery.isFetching && !usersIsPending,
							onNextPage: () => {
								if (hasNextPage) {
									setPageIndex((current) => current + 1);
								}
							},
							onPreviousPage: () => {
								if (hasPreviousPage) {
									setPageIndex((current) => Math.max(current - 1, 0));
								}
							},
						}}
						errorContent={
							usersFailure?.kind === 'problem' &&
							usersFailure.status === 403 ? (
								<p className="text-sm text-muted-foreground">
									{t('no-permission-to-view-assigned-users')}
								</p>
							) : undefined
						}
						emptyContent={t('no-users-assigned-to-profile')}
						noMatchContent={t('no-assigned-users-match-search')}
						sort={controller.sort}
						onSortChange={controller.onSortChange}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						searchDraft={controller.search.draft}
						onSearchDraftChange={controller.search.onDraftChange}
						selection={wrappedSelection}
					/>

					<FloatingSelectionBar
						selectedCount={selection.selectedCount}
						visibleCount={rows.length}
						allVisibleSelected={
							rows.length > 0 &&
							rows.every((row) => wrappedSelection.rowSelection[row.id])
						}
						onClear={wrappedSelection.clearSelection}
						onSelectAllVisible={() =>
							wrappedSelection.onSelectionChange(
								new Set(rows.map((row) => row.id)),
							)
						}
					>
						<ProfileUsersListBulkActions
							profileId={profileId}
							rows={rows}
							selection={selection}
							onSessionExpired={() => setShouldLogout(true)}
						/>
					</FloatingSelectionBar>
				</TabsContent>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId/users',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-staff-profiles', to: '/staff/profiles' },
			{
				kind: 'entity',
				to: `/staff/profiles/${params.profileId}`,
				query: staffProfileCrumbQuery,
				select: selectStaffProfileCrumbName,
			},
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: StaffProfileUsersPage,
});
