import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { HistoryPage } from '~/components/history/history-page';
import type {
	HistoryCategory,
	HistoryEvent,
} from '~/components/history/history-types';
import type { ListFiltersValue } from '~/components/list/list-types';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	toStaffAuditLogRows,
	useAuditLogActionsQuery,
	useStaffAuditLogsQuery,
} from '~/lib/query/staff-audit-logs';
import { useStaffTenantsQuery } from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	buildAuditActionCatalog,
	buildAuditLogFilters,
	resolveAuditLogSelection,
} from '../audit-logs/_audit-log-history-filters';
import {
	auditLogPeriodStart,
	buildAuditLogsCursorResetKey,
	parseAuditLogCategories,
	parseAuditLogsListSearchParams,
	serializeAuditLogCategories,
	serializeAuditLogsListSearchParams,
	type AuditLogsListSearchParamInput,
} from '../audit-logs/_list-search-params';

/** The dashboard feed is a glance, not the full log: one page of the same
 * query the audit-logs page pages through. */
const ACTIVITY_FEED_SIZE = 50;
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const TEST_ID = 'staff-dashboard-activity';

/** The audit list carries only `targetId`; the dashboard resolves it against
 * the tenants it knows so the row can name its object (« a suspendu Vanilla
 * Coast »). Best effort: an id outside the loaded page keeps the phrase
 * without a name rather than inventing one. */
const toHistoryEvents = (
	rows: ReturnType<typeof toStaffAuditLogRows>,
	tenantNames: ReadonlyMap<string, string>,
): HistoryEvent[] =>
	rows.map((row) => {
		const targetName = row.targetId
			? (tenantNames.get(row.targetId) ?? null)
			: null;
		return {
			id: row.id,
			at: row.createdAt,
			actorName: row.userName,
			userId: row.userId,
			action: row.action,
			ipAddress: row.ipAddress,
			targetId: row.targetId,
			targetName,
			organisationName: targetName,
		};
	});

/**
 * The tenants a feed row can name, as a `targetId → name` map. Best effort by
 * design: a row whose id is outside the loaded page keeps its phrase without a
 * name. This query is pure enrichment — it has no loading / error surface of
 * its own — so it lives in a data hook rather than the rendering component
 * (`publy/prefer-query-display` only checks JSX-returning functions; same
 * shape as `_staff-list-team.tsx`'s counter hook).
 */
const useTenantNameMap = (): ReadonlyMap<string, string> => {
	const tenantNamesQuery = useStaffTenantsQuery({ size: 100 });
	return useMemo(() => {
		const map = new Map<string, string>();
		for (const tenant of tenantNamesQuery.data?.data ?? []) {
			if (tenant.id && tenant.name) {
				map.set(tenant.id, tenant.name);
			}
		}
		return map;
	}, [tenantNamesQuery.data]);
};

/**
 * The staff Dashboard › Activité tab: the shared activity history (§5.1), fed
 * by the same `GET /staff/audit-logs` query as `/staff/audit-logs` — per-day
 * groups, search, category/period/sensitivity filters, the retention
 * footnote and an honest total with its cursor pager. The dashboard owns the
 * page title, so the history renders without its own title row (the full log
 * is reached from the side panel).
 */
const Activity = () => {
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	const { t: tCommon } = useTranslation('common');
	const navigate = Route.useNavigate();
	const locale = i18n.language;
	const search = parseAuditLogsListSearchParams(
		Route.useSearch() as AuditLogsListSearchParamInput,
	);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeAuditLogsListSearchParams({ ...search, ...next }),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: ACTIVITY_FEED_SIZE,
		cursorResetKey: buildAuditLogsCursorResetKey(search),
	});

	const catalogQuery = useAuditLogActionsQuery();
	const catalog = useMemo(
		() => buildAuditActionCatalog(catalogQuery.data?.actions ?? []),
		[catalogQuery.data],
	);
	const categories = parseAuditLogCategories(search.category);
	const selection = resolveAuditLogSelection({
		catalog,
		categories,
		sensitivity: search.sensitivity === 'sensitive',
		startDate: search.period ? auditLogPeriodStart(search.period) : undefined,
	});
	const query = useStaffAuditLogsQuery(
		{
			q: search.q,
			actions: selection.actions?.split(','),
			startDate: selection.startDate,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{ enabled: !selection.impossible },
	);

	const tenantNames = useTenantNameMap();

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	const rows = selection.impossible
		? []
		: toStaffAuditLogRows(query.data?.data);
	const events = toHistoryEvents(rows, tenantNames);
	// The footnote may only print a whole-collection total: with a next cursor
	// (or a page behind us) the collection is not complete, so it stays « — »
	// instead of turning the loaded page into a total (B5).
	const collectionComplete =
		query.data !== undefined &&
		query.data.nextCursor == null &&
		!controller.cursor.hasPreviousPage;
	const totalCount = collectionComplete ? events.length : null;

	const filters = buildAuditLogFilters({
		t: tCommon,
		catalog,
		search,
		categoryCounts: null,
	});
	const filtersValue: ListFiltersValue = {
		category: categories,
		period: search.period ? [search.period] : [],
		sensitivity: search.sensitivity === 'sensitive' ? ['sensitive'] : [],
	};

	const applyFilters = (next: ListFiltersValue): void => {
		const nextPeriod = (next.period ?? []).at(-1);
		const preset =
			nextPeriod === 'today' || nextPeriod === 'week' || nextPeriod === 'month'
				? nextPeriod
				: undefined;
		void navigate({
			search: serializeAuditLogsListSearchParams({
				...search,
				category: serializeAuditLogCategories(
					(next.category ?? []) as HistoryCategory[],
				),
				period: preset,
				sensitivity: (next.sensitivity ?? []).includes('sensitive')
					? 'sensitive'
					: undefined,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const historyQuery: QueryDisplayQuery<unknown> = { ...query, error: null };
	// While the action catalog has not fetched yet, an empty category
	// selection does not prove the pair impossible: keep the skeleton instead
	// of flashing the no-match state.
	if (selection.impossible && catalogQuery.isFetched) {
		historyQuery.isPending = false;
		historyQuery.isError = false;
	}

	return (
		<HistoryPage
			testId={TEST_ID}
			// The prototype's toolbar→feed gap is 16px, not the list page's 24px
			// (#2339 fidelity).
			className="md:gap-4"
			title={t('common:activity')}
			// No header row: the prototype's activity tab starts directly with
			// its toolbar (§5.1); a « Tout voir » row above it pushed every
			// following block ~60px down.
			header={<></>}
			totalCount={totalCount}
			searchPlaceholder={tCommon('history-search-placeholder')}
			q={search.q ?? ''}
			onSearch={(next) =>
				onSearchChange({ ...search, q: next, cursor: undefined })
			}
			searchTestId="staff-dashboard-activity-search"
			events={events}
			locale={locale}
			showOrganisation
			onOpen={(event) => {
				void navigate({
					to: '/staff/audit-logs/$logId',
					params: { logId: event.id },
				});
			}}
			openLabel={(event) =>
				t('common:list-open-row', {
					name: event.action ?? event.actorName ?? event.id,
				})
			}
			emptyTitle={t('no-audit-logs-yet')}
			emptyText={t('no-audit-logs-description')}
			noMatchTitle={t('no-audit-logs-match-title')}
			noMatchText={t('no-audit-logs-match-description')}
			filters={filters}
			filtersValue={filtersValue}
			onFiltersChange={applyFilters}
			banner={
				<QueryDisplay
					query={catalogQuery}
					variant="discreet"
					ErrorSlot={
						<div
							role="alert"
							className="flex items-center justify-between gap-2 rounded-[var(--publy-radius-medium-control)] border border-(--publy-alert-danger-border) bg-(--publy-alert-danger-bg) px-3 py-2.5"
						>
							<p className="text-sm text-(--publy-alert-danger-text)">
								{t('actions-filter-error')}
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void catalogQuery.refetch()}
							>
								{tCommon('retry')}
							</Button>
						</div>
					}
				/>
			}
			query={historyQuery}
			pager={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId={TEST_ID}
						pageIndex={controller.cursor.pageIndex}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						pageRowCount={rows.length}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={query.data?.nextCursor != null}
						isPaginationPending={query.isFetching}
						onNextPage={() =>
							controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
						}
						onPreviousPage={controller.cursor.onPreviousPage}
						variant="flat"
					/>
				) : null
			}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/dashboard/activity',
)({
	validateSearch: (search) =>
		serializeAuditLogsListSearchParams(
			parseAuditLogsListSearchParams(search as AuditLogsListSearchParamInput),
		),
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
			{ kind: 'label', labelKey: 'nav-dashboard-activity' },
		],
		i18nNamespaces: ['staff-audit-logs'],
	},
	component: Activity,
});
