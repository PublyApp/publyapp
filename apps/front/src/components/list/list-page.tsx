import type { Icon as TablerIcon } from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import type { CSSProperties, ReactNode } from 'react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableStates } from '~/components/table/data-table-states';
import { Collapse } from '~/components/ui/collapse';

import { ColumnsPicker } from './columns-picker';
import { FilterChips, FilterMenu } from './filter-menu';
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
	description?: string;
	/** Omit when the API has no search parameter: the toolbar then has no
	 * text field rather than one that silently filters nothing. */
	searchPlaceholder?: string;
	/** Page-owned navigation groups, before the filter-shortcut groups. */
	panelGroups?: ListPanelGroup[];
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
	/**
	 * Whether the counters (panel groups, filter-menu badges, tabs) and the
	 * pinned totals footer describe the whole collection. Pass `false` when the
	 * consumer keeps cursor pagination and the API exposes no count source: the
	 * counters and totals then show « — » instead of summing the loaded page.
	 */
	countsKnown?: boolean;
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
	/** The primary action element (a link to the create page, or a button). */
	newAction?: ReactNode;
	inset?: { description?: string };
	queryState: {
		isPending: boolean;
		isError: boolean;
		onRetry: () => void;
	};
	/** Extra content under the table (a cursor pager). */
	footer?: ReactNode;
	/** Extra content after the page (a drawer). */
	after?: ReactNode;
	/** Rendered between the chips and the table (a floating selection bar). */
	bulkBar?: ReactNode;
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
	const { filters, filtersValue, rows } = props;
	const countsKnown = props.countsKnown ?? true;

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
				count: page.counts[filter.key]?.[choice.value] ?? null,
				active: filtersValue[filter.key]?.includes(choice.value) ?? false,
				onClick: () => page.shortcut(filter.key, choice.value),
			})),
		});
	}

	const panelGroups = [...(props.panelGroups ?? []), ...filterPanelGroups];

	const emptyNode = (
		<p className="py-10 text-center text-sm text-muted-foreground">
			{page.bodyContent}
		</p>
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
				description={props.description}
				inset={props.inset}
				count={props.count ?? (countsKnown ? rows.length : null)}
				onExport={props.onExport}
				newAction={props.newAction}
				cards={props.cards}
				statsOpen={page.statsOpen}
				onToggleStats={page.toggleStats}
			/>
			{props.cards ? (
				<Collapse open={page.statsOpen} axis="y">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,50%-8px),1fr))] gap-3">
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
			{page.bodyState === 'loading' || page.bodyState === 'error' ? (
				<DataTableStates
					testId={props.testId ?? 'list'}
					bodyState={page.bodyState}
					resolvedRowHeight={48}
					onRetry={props.queryState.onRetry}
					errorContent={t('list-error-default-description')}
					emptyContent={page.emptyContent}
					noMatchContent={t('list-no-match-default-description')}
				/>
			) : (
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
					empty={emptyNode}
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
			)}
			{props.footer}
			<ListFilterPanel groups={panelGroups} targetId={PANEL_TARGET_ID} />
			{props.after}
		</div>
	);
};
