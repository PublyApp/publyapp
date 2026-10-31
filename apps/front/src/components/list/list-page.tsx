import {
	IconChevronDown,
	IconChevronUp,
	IconDots,
	IconDownload,
	type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableStates } from '~/components/table/data-table-states';
import { resolveTableBodyState } from '~/components/table/table-body-state';
import { Button } from '~/components/ui/button';
import { Collapse } from '~/components/ui/collapse';
import { PageHeader } from '~/components/ui/product-page';

import { ColumnsPicker } from './columns-picker';
import { FilterChips, FilterMenu, type FilterCounts } from './filter-menu';
import { ListFilterPanel, type ListPanelGroup } from './filter-panel';
import { HomeTabs } from './home-tabs';
import { CardFoot, ListCard, ListCards } from './list-card';
import { moveColumn } from './list-columns';
import { ListTable, useListTable } from './list-table';
import { ListToolbar } from './list-toolbar';
import type {
	ListColumn,
	ListFiltersValue,
	ListFilter,
	ListMobileCard,
	ListSelection,
	ListTab,
} from './list-types';
import { listValueHas } from './list-types';
import { SearchField } from './search-field';
import { SortMenu } from './sort-menu';

const PANEL_TARGET_ID = 'app-shell-page-panel';

export type ListPageProps<T extends { id: string }> = {
	testId?: string;
	ariaLabel: string;
	title: string;
	description?: string;
	searchPlaceholder: string;
	/** After the API search, before the page's tabs and filters. */
	rows: T[];
	columns: ListColumn<T>[];
	defaultColumns: string[];
	lockedColumn: string;
	sorting: SortingState;
	onSortingChange: (next: SortingState) => void;
	q: string;
	onSearch: (q: string | undefined) => void;
	filters: ListFilter<T>[];
	filtersValue: ListFiltersValue;
	onFiltersChange: (next: ListFiltersValue) => void;
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

const FilterGlyph = ({ icon: Icon }: { icon: TablerIcon }) => (
	<Icon aria-hidden="true" className="size-4 shrink-0" />
);

/**
 * The one generic list page (Shopkart OS `sk-orgs/list-page.tsx` +
 * `ListConfig<T>`): title row, collapsible StatCards, optional tabs with
 * counts, the pinned toolbar (search, sort, filters, columns), filter chips,
 * the data table with pinned header/totals and meta cards below `md`, and the
 * side panel's filter-shortcut groups with counters. Every admin list —
 * including the ones inside a detail tab through `inset` — renders this.
 */
export const ListPage = <T extends { id: string }>({
	testId = 'list',
	ariaLabel,
	title,
	description,
	searchPlaceholder,
	rows,
	columns,
	defaultColumns,
	lockedColumn,
	sorting,
	onSortingChange,
	q,
	onSearch,
	filters,
	filtersValue,
	onFiltersChange,
	tabs = [],
	currentTab,
	onTabChange,
	cards,
	totals,
	onOpen,
	openLabel,
	mobileCard,
	selection,
	renderActions,
	onExport,
	newAction,
	inset,
	queryState,
	footer,
	after,
	bulkBar,
}: ListPageProps<T>) => {
	const { t } = useTranslation('common');
	const top = useRef<HTMLElement>(null);
	const [shown, setShown] = useState<string[]>(defaultColumns);
	const [statsOpen, setStatsOpen] = useState(true);
	const [searchHeight, setSearchHeight] = useState(0);
	const [tab, setTab] = useState(currentTab ?? tabs[0]?.key ?? 'all');

	const currentTabDef = tabs.find((entry) => entry.key === tab) ?? tabs[0];
	const inTab = (row: T) => (currentTabDef ? currentTabDef.match(row) : true);
	const passes = (row: T, except?: string) =>
		filters.every(
			(filter) =>
				filter.key === except ||
				(filtersValue[filter.key]?.length ?? 0) === 0 ||
				filtersValue[filter.key].some((value) =>
					listValueHas(filter.valueOf(row), value),
				),
		);

	const filtered = rows.filter((row) => inTab(row) && passes(row));
	const sort = sorting[0];
	const sorted = [...filtered];
	if (sort) {
		const column = columns.find((entry) => entry.id === sort.id);
		if (column?.value) {
			const direction = sort.desc ? -1 : 1;
			sorted.sort((a, b) => {
				const left = column.value?.(a) ?? null;
				const right = column.value?.(b) ?? null;
				if (left === null && right === null) {
					return 0;
				}
				if (left === null) {
					return 1;
				}
				if (right === null) {
					return -1;
				}
				if (typeof left === 'number' && typeof right === 'number') {
					return (left - right) * direction;
				}
				return String(left).localeCompare(String(right), 'fr') * direction;
			});
		}
	}

	const displayed = sorted;
	const shownColumns = shown.flatMap((id) => {
		const column = columns.find((entry) => entry.id === id);
		return column ? [column] : [];
	});
	const specs = new Map(
		shownColumns.map((column) => [
			column.id,
			{ label: column.header, icon: column.icon, width: column.width },
		]),
	);
	if (renderActions) {
		specs.set('actions', { label: t('actions'), icon: IconDots, width: 40 });
	}
	const {
		rows: tableRows,
		ids,
		head,
	} = useListTable({
		data: displayed,
		columns: shownColumns,
		actions: renderActions,
		sorting,
		onSortingChange,
		specs,
	});

	const countsFor = (filter: ListFilter<T>) =>
		Object.fromEntries(
			filter.choices.map((choice) => [
				choice.value,
				rows.filter(
					(row) =>
						inTab(row) &&
						passes(row, filter.key) &&
						listValueHas(filter.valueOf(row), choice.value),
				).length,
			]),
		);
	const counts: FilterCounts = {};
	for (const filter of filters) {
		counts[filter.key] = countsFor(filter);
	}

	const toggleFilter = (key: string, value: string) => {
		const current = filtersValue[key] ?? [];
		onFiltersChange({
			...filtersValue,
			[key]: current.includes(value)
				? current.filter((entry) => entry !== value)
				: [...current, value],
		});
	};
	const clearFilter = (key: string) => {
		onFiltersChange({ ...filtersValue, [key]: [] });
	};
	const clearAllFilters = () => {
		const cleared: ListFiltersValue = {};
		for (const filter of filters) {
			cleared[filter.key] = [];
		}
		onFiltersChange(cleared);
	};
	const shortcut = (key: string, value: string) => {
		if (filtersValue[key]?.includes(value)) {
			onFiltersChange({
				...filtersValue,
				[key]: (filtersValue[key] ?? []).filter((entry) => entry !== value),
			});
			return;
		}
		const next: ListFiltersValue = {};
		for (const filter of filters) {
			next[filter.key] = [];
		}
		next[key] = [value];
		onFiltersChange(next);
	};

	const panelGroups: ListPanelGroup[] = filters
		.filter((filter) => filter.panel)
		.map((filter) => ({
			key: filter.key,
			title: filter.label,
			entries: filter.choices.map((choice) => ({
				key: `${filter.key}:${choice.value}`,
				label: choice.label,
				icon: choice.icon ?? <FilterGlyph icon={filter.icon} />,
				count: rows.filter(
					(row) =>
						inTab(row) && listValueHas(filter.valueOf(row), choice.value),
				).length,
				active: filtersValue[filter.key]?.includes(choice.value) ?? false,
				onClick: () => shortcut(filter.key, choice.value),
			})),
		}));

	let activeFilterCount = 0;
	for (const filter of filters) {
		activeFilterCount += filtersValue[filter.key]?.length ?? 0;
	}
	const hasActiveSearch = q.length > 0 || activeFilterCount > 0;
	const bodyState = resolveTableBodyState({
		isPending: queryState.isPending,
		isError: queryState.isError,
		rowCount: displayed.length,
		hasActiveSearch,
	});
	const emptyNode = (
		<p className="py-10 text-center text-sm text-muted-foreground">
			{t('list-empty')}
		</p>
	);

	const tabDefs = tabs.map((entry) => ({
		key: entry.key,
		label: entry.label,
		count: rows.filter(entry.match).length,
	}));
	const titleRow = (
		<>
			{inset ? (
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						<h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
							{title}
							<span className="flex h-5 items-center rounded-[var(--publy-radius-chip)] bg-secondary px-2 text-xs font-medium text-secondary-foreground tabular-nums">
								{rows.length}
							</span>
						</h2>
						{inset.description ? (
							<p className="text-sm text-muted-foreground">
								{inset.description}
							</p>
						) : null}
					</div>
					{newAction}
				</div>
			) : (
				<PageHeader
					title={title}
					description={description}
					actions={
						<>
							{onExport ? (
								<Button
									variant="outline"
									aria-label={t('list-export')}
									onClick={onExport}
								>
									<IconDownload data-icon="inline-start" />
									<span className="hidden md:inline">{t('list-export')}</span>
								</Button>
							) : null}
							{newAction}
							{cards ? (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-expanded={statsOpen}
									aria-label={
										statsOpen
											? t('list-stats-collapse')
											: t('list-stats-expand')
									}
									onClick={() => setStatsOpen((open) => !open)}
								>
									{statsOpen ? (
										<IconChevronUp aria-hidden="true" />
									) : (
										<IconChevronDown aria-hidden="true" />
									)}
								</Button>
							) : null}
						</>
					}
				/>
			)}
		</>
	);

	return (
		<div
			className="flex min-h-full flex-col gap-4"
			data-list-page=""
			style={{ '--search-height': `${searchHeight}px` } as CSSProperties}
		>
			{titleRow}
			{cards ? (
				<Collapse open={statsOpen} axis="y">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,50%-8px),1fr))] gap-3">
						{cards}
					</div>
				</Collapse>
			) : null}
			{tabs.length > 1 ? (
				<HomeTabs
					tabs={tabDefs}
					current={tab}
					label={title}
					onPick={(key) => {
						setTab(key);
						onTabChange?.(key);
					}}
				/>
			) : null}
			<ListToolbar
				top={top}
				onHeightChange={setSearchHeight}
				tabs={tabs.length > 1}
				search={
					<SearchField
						q={q}
						onSearch={onSearch}
						placeholder={searchPlaceholder}
						disabled={selection !== undefined && selection.selectedIds.size > 0}
					/>
				}
			>
				<SortMenu
					sort={sort && specs.has(sort.id) ? sort : undefined}
					onSort={(next) => onSortingChange(next)}
					columns={specs}
					ids={shown}
					defaultLabel={t('list-sort-default')}
				/>
				<FilterMenu
					filters={filters}
					active={filtersValue}
					counts={counts}
					onToggle={toggleFilter}
					onClear={clearFilter}
				/>
				<ColumnsPicker
					shown={shown}
					onChange={setShown}
					onReset={() => setShown(defaultColumns)}
					columns={
						new Map(
							columns.map((column) => [
								column.id,
								{
									label: column.header,
									icon: column.icon,
									width: column.width,
								},
							]),
						)
					}
					locked={lockedColumn}
					isDefault={shown.join() === defaultColumns.join()}
				/>
			</ListToolbar>
			<FilterChips
				filters={filters}
				active={filtersValue}
				onToggle={toggleFilter}
				onClearAll={clearAllFilters}
			/>
			{bulkBar}
			{bodyState === 'loading' || bodyState === 'error' ? (
				<DataTableStates
					testId={testId}
					bodyState={bodyState}
					resolvedRowHeight={48}
					onRetry={queryState.onRetry}
					errorContent={t('list-error-default-description')}
					emptyContent={t('list-empty')}
					noMatchContent={t('list-no-match-default-description')}
				/>
			) : (
				<ListTable
					ariaLabel={ariaLabel}
					specs={specs}
					ids={ids}
					rows={tableRows}
					head={head}
					totals={totals(displayed)}
					onOpen={onOpen}
					openLabel={openLabel}
					selection={selection}
					empty={emptyNode}
					onMove={(from, before) =>
						setShown((current) =>
							moveColumn(current, from, before, lockedColumn),
						)
					}
					cards={
						<ListCards
							count={displayed.length}
							empty={emptyNode}
							summary={undefined}
						>
							{displayed.map((row) => {
								const card = mobileCard(row);
								return (
									<ListCard
										key={row.id}
										onOpen={() => onOpen(row)}
										openLabel={openLabel(row)}
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
			{footer}
			<ListFilterPanel groups={panelGroups} targetId={PANEL_TARGET_ID} />
			{after}
		</div>
	);
};
