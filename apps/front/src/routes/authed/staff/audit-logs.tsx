import { IconUser } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { historyCategory } from '~/components/history/history-actions';
import { HistoryPage } from '~/components/history/history-page';
import type {
	HistoryCategory,
	HistoryEvent,
} from '~/components/history/history-types';
import type { ListPanelGroup } from '~/components/list/filter-panel';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	toStaffAuditLogRows,
	useAuditLogActionsQuery,
	useStaffAuditLogsQuery,
} from '~/lib/query/staff-audit-logs';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import type { AuditLogListCounts } from '@org/client-ts/models/index';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	buildStaffTeamPanelGroups,
	useStaffTeamOverview,
	type StaffTeamPath,
} from './_staff-list-team';
import { AuditLogExportDrawer } from './audit-logs/_audit-log-export-drawer';
import {
	buildAuditActionCatalog,
	buildAuditLogFilters,
	resolveAuditLogSelection,
} from './audit-logs/_audit-log-history-filters';
import { AuditLogStatCards } from './audit-logs/_audit-log-stat-cards';
import {
	auditLogPeriodStart,
	buildAuditLogsCursorResetKey,
	parseAuditLogCategories,
	parseAuditLogsListSearchParams,
	serializeAuditLogCategories,
	serializeAuditLogsListSearchParams,
	type AuditLogsListSearchParamInput,
	type AuditLogsListSearchParams,
} from './audit-logs/_list-search-params';
import { LocalizedDateInput } from './audit-logs/_localized-date-input';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const TEST_ID = 'staff-audit-logs-history';

const toHistoryEvents = (
	rows: ReturnType<typeof toStaffAuditLogRows>,
): HistoryEvent[] =>
	rows.map((row) => ({
		id: row.id,
		at: row.createdAt,
		actorName: row.userName,
		action: row.action,
		ipAddress: row.ipAddress,
		targetId: row.targetId,
	}));

/** The period value shown as active: a preset, a deep-linked custom range, or
 * nothing when the whole history is shown. */
const activePeriod = (search: AuditLogsListSearchParams): string[] => {
	if (search.period) {
		return [search.period];
	}
	if (search.startDate || search.endDate) {
		return ['custom'];
	}
	return [];
};

/** The panel's per-category counters, summed from the API's per-action
 * whole-history counts. */
const countAuditCategories = (
	counts: AuditLogListCounts | null | undefined,
) => {
	const categories: Record<string, number> = {};
	for (const row of counts?.byAction ?? []) {
		const category = historyCategory(row.action ?? null);
		categories[category] = (categories[category] ?? 0) + (row.count ?? 0);
	}
	return categories;
};

/** The panel's per-actor counters, from the API's actor facets (already
 * ranked by volume, so the panel needs no client-side sort). */
const buildActorPanelGroup = (
	counts: AuditLogListCounts | null | undefined,
	t: (key: string) => string,
	onSelect: (actor: string) => void,
): ListPanelGroup[] => [
	{
		key: 'audit-actors',
		title: t('common:history-filter-actors'),
		entries: (counts?.byActor ?? []).flatMap((actor) => {
			const name = actor.name?.trim() ?? '';
			if (name.length === 0) {
				return [];
			}
			return [
				{
					key: `actor:${actor.userId ?? name}`,
					label: name,
					icon: <IconUser />,
					count: actor.count ?? 0,
					active: false,
					onClick: () => onSelect(name),
				},
			];
		}),
	},
];

const StaffAuditLogsPage = () => {
	const navigate = Route.useNavigate();
	const search = parseAuditLogsListSearchParams(
		Route.useSearch() as AuditLogsListSearchParamInput,
	);
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	// The panel labels, category names and period presets live in `common`; the
	// page's array-bound `t` resolves in `staff-audit-logs` first, so those keys
	// would render raw. Bind them to the common namespace explicitly.
	const { t: tCommon } = useTranslation('common');
	const locale = i18n.language;
	const [isExportOpen, setIsExportOpen] = useState(false);
	const [shouldLogout, setShouldLogout] = useState(false);

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
		defaultSize: DEFAULT_SIZE,
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
		startDate: search.period
			? auditLogPeriodStart(search.period)
			: search.startDate,
		endDate: search.period ? undefined : search.endDate,
	});

	const query = useStaffAuditLogsQuery(
		{
			q: search.q,
			actions: selection.actions?.split(','),
			startDate: selection.startDate,
			endDate: selection.endDate,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{ enabled: !selection.impossible },
	);
	const rows = toStaffAuditLogRows(query.data?.data);
	// An impossible filter combination must never fall back to a cached
	// unfiltered page: its query key is the unfiltered one, so reusing its
	// data would silently render events the filter excludes.
	const events: HistoryEvent[] = selection.impossible
		? []
		: toHistoryEvents(rows);
	const team = useStaffTeamOverview();

	const collectionComplete =
		query.data !== undefined &&
		query.data.nextCursor == null &&
		!controller.cursor.hasPreviousPage;
	const counts = query.data?.counts;
	// The counters are the API's whole-history facets, never the loaded page.
	const filters = buildAuditLogFilters({
		t: tCommon,
		catalog,
		search,
		// `null` while the API has not answered: only then is a category count
		// unknown. Once the facets are in, an absent category is a real 0.
		categoryCounts: counts ? countAuditCategories(counts) : null,
	});
	const actorGroup = buildActorPanelGroup(counts, tCommon, (actor) =>
		onSearchChange({ ...search, q: actor, cursor: undefined }),
	);

	const filtersValue: ListFiltersValue = {
		category: categories,
		period: activePeriod(search),
		sensitivity: search.sensitivity === 'sensitive' ? ['sensitive'] : [],
	};

	const applyFilters = (next: ListFiltersValue): void => {
		const nextPeriod = (next.period ?? []).at(-1);
		const preset =
			nextPeriod === 'today' || nextPeriod === 'week' || nextPeriod === 'month'
				? nextPeriod
				: undefined;
		const keepCustom = nextPeriod === 'custom';
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
				startDate: keepCustom ? search.startDate : undefined,
				endDate: keepCustom ? search.endDate : undefined,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	/** A typed custom range replaces the period preset: the two are the same
	 * filter, and `resolveAuditLogSelection` prefers `period` when both exist. */
	const setDateFilter = (
		key: 'startDate' | 'endDate',
		value: string | undefined,
	): void => {
		void navigate({
			search: serializeAuditLogsListSearchParams({
				...search,
				period: undefined,
				[key]: value,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const dateRangeFilter = (
		<div
			className="flex items-center gap-1.5"
			data-testid="staff-audit-logs-date-range-filter"
		>
			<LocalizedDateInput
				locale={locale}
				ariaLabel={tCommon('start-date')}
				errorMessage={tCommon('invalid-date')}
				testId="staff-audit-logs-start-date"
				value={search.startDate}
				max={search.endDate ?? undefined}
				onChange={(value) => setDateFilter('startDate', value)}
				className="h-9 w-37"
			/>
			<span aria-hidden="true" className="text-muted-foreground">
				–
			</span>
			<LocalizedDateInput
				locale={locale}
				ariaLabel={tCommon('end-date')}
				errorMessage={tCommon('invalid-date')}
				testId="staff-audit-logs-end-date"
				value={search.endDate}
				min={search.startDate ?? undefined}
				onChange={(value) => setDateFilter('endDate', value)}
				className="h-9 w-37"
			/>
		</div>
	);

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const navigateToTeam = useCallback(
		(to: StaffTeamPath) => {
			void navigate({ to });
		},
		[navigate],
	);

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const totalCount = collectionComplete ? events.length : null;
	// The filter pair can exclude each other (a category with no sensitive
	// action): the page then renders the no-match state and never queries the
	// whole history behind an impossible filter.
	let isPending = query.isPending;
	let isError = query.isError;
	// While the action catalog has not fetched yet, an empty category
	// selection does not prove the pair impossible: keep the skeleton instead
	// of flashing the no-match state.
	if (selection.impossible && catalogQuery.isFetched) {
		isPending = false;
		isError = false;
	}

	return (
		<>
			<HistoryPage
				testId={TEST_ID}
				title={t('audit-logs-page-title')}
				totalCount={totalCount}
				searchPlaceholder={tCommon('history-search-placeholder')}
				q={search.q ?? ''}
				onSearch={(next) =>
					onSearchChange({ ...search, q: next, cursor: undefined })
				}
				searchTestId="staff-audit-logs-search"
				cards={<AuditLogStatCards counts={counts} />}
				onExport={() => setIsExportOpen(true)}
				exportTestId="staff-audit-logs-export-trigger"
				banner={
					catalogQuery.isError ? (
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
								{t('common:retry')}
							</Button>
						</div>
					) : null
				}
				events={events}
				locale={locale}
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
				toolbarExtra={dateRangeFilter}
				panelGroups={buildStaffTeamPanelGroups(
					tCommon,
					'audit',
					team.counts,
					navigateToTeam,
				)}
				panelGroupsAfter={actorGroup}
				queryState={{
					isPending,
					isError,
					onRetry: () => void query.refetch(),
				}}
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
								controller.cursor.onNextPage(
									query.data?.nextCursor ?? undefined,
								)
							}
							onPreviousPage={controller.cursor.onPreviousPage}
							variant="flat"
						/>
					) : null
				}
			/>
			<AuditLogExportDrawer
				isOpen={isExportOpen}
				onOpenChange={setIsExportOpen}
				onAuthFailure={onSessionExpired}
				filters={{
					actions: selection.actions?.split(','),
					startDate: selection.startDate,
					endDate: selection.endDate,
				}}
			/>
		</>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/audit-logs')({
	staticData: {
		i18nNamespaces: ['staff-audit-logs'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-audit-logs' }],
	},
	validateSearch: (search) =>
		serializeAuditLogsListSearchParams(
			parseAuditLogsListSearchParams(search as AuditLogsListSearchParamInput),
		),
	component: StaffAuditLogsPage,
});
