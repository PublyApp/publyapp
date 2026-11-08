import type { Icon as TablerIcon } from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import type { CSSProperties, ReactNode } from 'react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import QueryDisplay, {
	type QueryDisplayQuery,
} from '~/components/query-display';
import { DataTableStates } from '~/components/table/data-table-states';
import { Collapse } from '~/components/ui/collapse';
import type { PageAction } from '~/components/ui/product-page';
import {
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import { resolveQueryError } from '~/lib/server/query-error-resolver';

import { ColumnsPicker } from './columns-picker';
import { type FilterCounts, FilterChips, FilterMenu } from './filter-menu';
import { ListFilterPanel, type ListPanelGroup } from './filter-panel';
import { HomeTabs } from './home-tabs';
import { CardFoot, ListCard, ListCards } from './list-card';
import { ListPageHeader } from './list-page-header';
import { useListPage } from './list-page-state';
import { ListTable } from './list-table';
import { ListToolbar } from './list-toolbar';
import type {
	ListColumn,
	ListFiltersValue,
	ListFilter,
	ListMobileCard,
	ListSelection,
	ListTab,
} from './list-types';
import { SearchField } from './search-field';
import { SortMenu } from './sort-menu';

const PANEL_TARGET_ID = 'app-shell-page-panel';

export type ListPageProps<T extends { id: string }> = {
	testId?: string;
	ariaLabel: string;
	title: string;
	/** Omit when the API has no search parameter: the toolbar then has no
	 * text field rather than one that silently filters nothing. */
	searchPlaceholder?: string;
	/** Page-owned navigation groups, before the filter-shortcut groups. */
	panelGroups?: ListPanelGroup[];
	/** Explicit side-panel group order (keys), so a page's group can sit
	 * between two filter groups as the prototype's does. Unlisted groups keep
	 * their default order after the listed ones. */
	panelOrder?: readonly string[];
	/** The row's accessible name for its selection checkbox. */
	rowLabel?: (row: T) => string;
	/** An exact total for the inset count badge, when the API provides one. */
	count?: number | null;
	/** After the API search, before the page's tabs and filters. */
	rows: T[];
	columns: ListColumn<T>[];
	defaultColumns: string[];
	lockedColumn: string;
	sorting: SortingState;
	onSortingChange: (next: SortingState) => void;
	q: string;
	onSearch: (q: string | undefined) => void;
	/** Locale for the client-side sort collation (the runtime i18n locale). */
	locale?: string;
	filters: ListFilter<T>[];
	filtersValue: ListFiltersValue;
	onFiltersChange: (next: ListFiltersValue) => void;
	/** API facet counts for the filter menu and panel shortcuts. Keys are
	 * filter ids and choice values; a missing/null entry renders « — ». */
	counts?: FilterCounts;
	/**
	 * Whether the counters (panel groups, filter-menu badges, tabs) describe the
	 * whole collection. Pass `false` when the counter source is not fully loaded
	 * (cursor pagination with no count endpoint): the counters then show « — »
	 * instead of summing a partial page. The totals have their own flag
	 * (`totalsKnown`).
	 */
	countsKnown?: boolean;
	/**
	 * The whole collection the counters count, when `rows` is a page the API has
	 * already narrowed (a server-side filter or search). Defaults to `rows`.
	 * The side panel keeps these whole-collection counters under a filter, as
	 * the prototype does; the filter menu still facets them per choice.
	 */
	countRows?: T[];
	/**
	 * Whether `rows` is the complete filtered collection, so the pinned totals
	 * may sum it. Defaults to `countsKnown`. A filter does not make the totals
	 * unknown: a complete filtered page has exact filtered totals.
	 */
	totalsKnown?: boolean;
	/** The empty state's text (the generic page has no resource noun). */
	emptyText?: string;
	tabs?: ListTab<T>[];
	currentTab?: string;
	onTabChange?: (key: string) => void;
	/** The figures above the list; a toggle folds them. */
	cards?: ReactNode;
	totals: (rows: T[]) => Map<string, string>;
	onOpen: (row: T) => void;
	openLabel: (row: T) => string;
	mobileCard: (row: T) => ListMobileCard;
	selection?: ListSelection;
	renderActions?: (row: T) => ReactNode;
	onExport?: () => void;
	/** The primary action as data: the desktop button and the mobile
	 * speed-dial action. */
	newAction?: PageAction;
	inset?: { description?: string };
	/** The list query. Its loading/error state is rendered through
	 * `QueryDisplay`; the rows themselves stay the `rows` prop (a caller may
	 * narrow or merge them before rendering). */
	query: QueryDisplayQuery<unknown>;
	/** Extra content in the error state (e.g. a 403 explanation); falls back to
	 * the resolved description when omitted. */
	errorContent?: ReactNode;
	/** Extra content under the table (a cursor pager). */
	footer?: ReactNode;
	/** Extra content after the page (a drawer). */
	after?: ReactNode;
	/** Rendered between the chips and the table (a floating selection bar). */
	bulkBar?: ReactNode;
	/** Extra pinned-toolbar controls (e.g. a locale-formatted date range). */
	toolbarExtra?: ReactNode;
};

// createElement, not <Icon />: the drawer-description guard cannot attribute a JSX tag bound to a parameter.
const FilterGlyph = ({ icon }: { icon: TablerIcon }) =>
	createElement(icon, { 'aria-hidden': true, className: 'size-4 shrink-0' });

/**
 * The one generic list page (Shopkart OS `sk-orgs/list-page.tsx` +
 * `ListConfig<T>`): title row, collapsible StatCards, optional tabs with
 * counts, the pinned toolbar (search, sort, filters, columns), filter chips,
 * the data table with pinned header/totals and meta cards below `md`, and the
 * side panel's filter-shortcut groups with counters. Every admin list —
 * including the ones inside a detail tab through `inset` — renders this.
 *
 * Its derived state lives in `useListPage` and its title row in
 * `ListPageHeader`, so this component stays under the
 * `react-doctor/no-giant-component` size bound.
 */
export const ListPage = <T extends { id: string }>(props: ListPageProps<T>) => {
	const { t } = useTranslation('common');
	const page = useListPage(props);
	const { filters, filtersValue } = props;
	const countsKnown = props.countsKnown ?? true;
	// #2291: one error state. The shared resolver owns the 5xx/4xx copy and
	// whether a Retry action belongs on the surface (403 and 404 do not).
	const queryError = props.query.error ?? undefined;
	const resolvedError =
		queryError === undefined ? undefined : resolveQueryError(queryError, t);
	// A forbidden body has no create/export chrome: acting on a page the user
	// cannot read is a lie (the 403 screenshot showed both on /staff/roles).
	// The shared list header owns that rule for every ListPage.
	const forbidden = resolvedError?.kind === 'forbidden';

	const filterPanelGroups: ListPanelGroup[] = [];
	for (const filter of filters) {
		if (!filter.panel) {
			continue;
		}
		filterPanelGroups.push({
			key: filter.key,
			title: filter.label,
			entries: filter.choices.map((choice) => ({
				key: `${filter.key}:${choice.value}`,
				label: choice.label,
				icon: choice.icon ?? <FilterGlyph icon={filter.icon} />,
				count: page.panelCounts[filter.key]?.[choice.value] ?? null,
				active: filtersValue[filter.key]?.includes(choice.value) ?? false,
				onClick: () => page.shortcut(filter.key, choice.value),
			})),
		});
	}

	const panelGroups = [...(props.panelGroups ?? []), ...filterPanelGroups];
	if (props.panelOrder) {
		const rank = new Map(
			props.panelOrder.map((key, index) => [key, index] as const),
		);
		panelGroups.sort(
			(a, b) =>
				(rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(b.key) ?? Number.MAX_SAFE_INTEGER),
		);
	}

	// The table keeps its shell and shows the same flat state family the old
	// DataTable rendered (owner decision R3-4b): a search miss gets the
	// primary glyph, an empty collection (or a filter miss, which keeps the
	// consumer's wording) the neutral one. Only the desktop copy carries the
	// test id — the mobile card list renders the same node, and a duplicated
	// id would make every locator ambiguous.
	const isSearchMiss = page.bodyState === 'no-match' && props.q.length > 0;
	const emptyState = (testId?: string) =>
		isSearchMiss ? (
			<NoMatchStateSurface
				title={t('list-no-match-title')}
				description={t('list-no-match-default-description')}
				testId={testId}
			/>
		) : (
			<StateSurface
				title={t('list-empty-title')}
				description={page.emptyContent}
				testId={testId}
			/>
		);
	const emptyNode = emptyState();
	const tableEmptyNode = emptyState(
		props.testId
			? `${props.testId}-${isSearchMiss ? 'no-match' : 'empty'}`
			: undefined,
	);

	// The body's loading and error states, and the table itself: `QueryDisplay`
	// picks one. The empty state lives inside the table shell (desktop and
	// mobile), so the empty slot and the data slot are the same node.
	const table = (
		<ListTable
			ariaLabel={props.ariaLabel}
			testId={props.testId}
			specs={page.specs}
			ids={page.ids}
			rows={page.tableRows}
			head={page.head}
			totals={page.totalCells}
			onOpen={props.onOpen}
			openLabel={props.openLabel}
			rowLabel={
				props.rowLabel ??
				((row: T) => (row as { name?: string }).name ?? row.id)
			}
			selection={props.selection}
			empty={tableEmptyNode}
			onMove={page.moveShown}
			cards={
				<ListCards
					count={page.displayed.length}
					empty={emptyNode}
					summary={undefined}
				>
					{page.displayed.map((row) => {
						const card = props.mobileCard(row);
						return (
							<ListCard
								key={row.id}
								onOpen={() => props.onOpen(row)}
								openLabel={props.openLabel(row)}
								code={card.code}
								badges={card.badges}
								end={card.end}
								title={card.title}
								sub={card.sub}
							>
								{card.foot ? (
									<CardFoot label={card.foot[0]} value={card.foot[1]} />
								) : null}
							</ListCard>
						);
					})}
				</ListCards>
			}
		/>
	);
	const tableState = (bodyState: 'loading' | 'error') => (
		<DataTableStates
			testId={props.testId ?? 'list'}
			bodyState={bodyState}
			resolvedRowHeight={48}
			onRetry={() => void props.query.refetch()}
			errorKind={resolvedError?.kind}
			error={queryError}
			errorTitle={resolvedError?.title}
			errorRetryable={resolvedError?.supportsRetry}
			errorContent={
				props.errorContent ??
				resolvedError?.description ??
				t('list-error-default-description')
			}
			emptyContent={page.emptyContent}
			noMatchContent={t('list-no-match-default-description')}
		/>
	);

	return (
		<div
			// The established bounded-height chain (conventions.md: table views
			// scroll inside the table, never the page): the table's flex-1 box
			// then owns the rows' scroll and the pager stays on screen (#2280).
			className="publy-page-fill"
			data-testid={props.testId}
			data-list-page=""
			style={{ '--search-height': `${page.searchHeight}px` } as CSSProperties}
		>
			<ListPageHeader
				title={props.title}
				inset={props.inset}
				count={
					props.count ??
					(countsKnown ? (props.countRows ?? props.rows).length : null)
				}
				onExport={forbidden ? undefined : props.onExport}
				newAction={forbidden ? undefined : props.newAction}
				cards={props.cards}
				statsOpen={page.statsOpen}
				onToggleStats={page.toggleStats}
			/>
			{props.cards ? (
				<Collapse open={page.statsOpen} axis="y">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,50%-8px),1fr))] gap-4">
						{props.cards}
					</div>
				</Collapse>
			) : null}
			{(props.tabs?.length ?? 0) > 1 ? (
				<HomeTabs
					tabs={page.tabDefs}
					current={page.tab}
					label={props.title}
					onPick={page.pickTab}
				/>
			) : null}
			<ListToolbar
				testId={props.testId}
				top={page.top}
				onHeightChange={page.setSearchHeight}
				tabs={(props.tabs?.length ?? 0) > 1}
				search={
					props.searchPlaceholder ? (
						<SearchField
							key={
								props.selection !== undefined &&
								props.selection.selectedIds.size > 0
									? 'selection'
									: 'browse'
							}
							q={props.q}
							onSearch={props.onSearch}
							placeholder={props.searchPlaceholder}
							testId={props.testId ? `${props.testId}-search` : undefined}
							disabled={
								props.selection !== undefined &&
								props.selection.selectedIds.size > 0
							}
						/>
					) : null
				}
			>
				{props.toolbarExtra}
				<SortMenu
					sort={
						page.sort && page.specs.has(page.sort.id) ? page.sort : undefined
					}
					onSort={props.onSortingChange}
					columns={page.specs}
					ids={page.shown}
					defaultLabel={t('list-sort-default')}
				/>
				{filters.length > 0 ? (
					<FilterMenu
						filters={filters}
						active={filtersValue}
						counts={page.counts}
						onToggle={page.toggleFilter}
						onClear={page.clearFilter}
					/>
				) : null}
				<ColumnsPicker
					shown={page.shown}
					onChange={page.setShown}
					onReset={page.resetColumns}
					columns={
						new Map(
							props.columns.map((column) => [
								column.id,
								{
									label: column.header,
									icon: column.icon,
									width: column.width,
								},
							]),
						)
					}
					locked={props.lockedColumn}
					isDefault={page.isDefaultColumns}
				/>
			</ListToolbar>
			<FilterChips
				filters={filters}
				active={filtersValue}
				onToggle={page.toggleFilter}
				onClearAll={page.clearAllFilters}
			/>
			{props.bulkBar}
			<QueryDisplay
				query={props.query}
				LoadingSlot={tableState('loading')}
				ErrorSlot={tableState('error')}
				EmptySlot={table}
			>
				{table}
			</QueryDisplay>
			{props.footer}
			<ListFilterPanel groups={panelGroups} targetId={PANEL_TARGET_ID} />
			{props.after}
		</div>
	);
};
