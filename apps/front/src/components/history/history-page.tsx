import { createElement, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from '~/components/ui/collapse';
import { cn } from '~/lib/utils';

import {
	FilterChips,
	FilterMenu,
	type FilterCounts,
} from '../list/filter-menu';
import { ListFilterPanel, type ListPanelGroup } from '../list/filter-panel';
import { ListPageHeader } from '../list/list-page-header';
import { ListToolbar } from '../list/list-toolbar';
import type { ListFilter, ListFiltersValue } from '../list/list-types';
import { SearchField } from '../list/search-field';
import { HistoryBody } from './history-body';
import type { HistoryEvent, HistoryFilter } from './history-types';

const PANEL_TARGET_ID = 'app-shell-page-panel';

/** Stable identity: a `{}` default parameter re-creates the value on every
 * render and defeats memoization (React Doctor `rerender-memo-with-default-value`). */
const EMPTY_FILTERS_VALUE: ListFiltersValue = {};

type HistoryPageProps = {
	testId: string;
	/** Extra root classes, e.g. the dashboard's tighter toolbar→feed gap. */
	className?: string;
	/** The page title row (28px) or, inside a detail tab, the section heading
	 * through `inset`. */
	title: string;
	inset?: { description?: string };
	/** Overrides the whole title row (a dashboard tab that owns its header). */
	header?: ReactNode;
	/** The exact whole-collection event count, or `null` when it is not known. */
	totalCount?: number | null;
	/** Toolbar search; omitted when the backend exposes no text filter. */
	searchPlaceholder?: string;
	q?: string;
	onSearch?: (q: string | undefined) => void;
	searchTestId?: string;
	/** The figures above the history; a toggle folds them. */
	cards?: ReactNode;
	onExport?: () => void;
	exportTestId?: string;
	/** A page-owned notice above the toolbar (a failed filter catalog). */
	banner?: ReactNode;
	events: readonly HistoryEvent[];
	locale: string;
	onOpen: (event: HistoryEvent) => void;
	openLabel: (event: HistoryEvent) => string;
	emptyTitle: string;
	emptyText: string;
	noMatchTitle?: string;
	noMatchText?: string;
	filters?: readonly HistoryFilter[];
	filtersValue?: ListFiltersValue;
	onFiltersChange?: (next: ListFiltersValue) => void;
	/** Page-owned navigation groups, before the filter-shortcut groups. */
	panelGroups?: ListPanelGroup[];
	/** Page-owned groups that belong after the filter shortcuts (Acteurs). */
	panelGroupsAfter?: ListPanelGroup[];
	queryState: { isPending: boolean; isError: boolean; onRetry: () => void };
	errorText?: string;
	/** The cursor pager, under the history. */
	pager?: ReactNode;
	/** Extra pinned-toolbar controls (e.g. a locale-formatted date range). */
	toolbarExtra?: ReactNode;
	showOrganisation?: boolean;
	retentionDays?: number;
};

const toListFilters = (
	filters: readonly HistoryFilter[],
): ListFilter<HistoryEvent>[] =>
	filters.map((filter) => ({ ...filter, valueOf: () => [] }));

const toFilterCounts = (filters: readonly HistoryFilter[]): FilterCounts => {
	const counts: FilterCounts = {};
	for (const filter of filters) {
		counts[filter.key] = Object.fromEntries(
			filter.choices.map((choice) => [choice.value, choice.count ?? null]),
		);
	}
	return counts;
};

/**
 * The one shared history (§5.1): the Shopkart title row and StatCards, the
 * pinned toolbar with its filter menu and chips, the events grouped by day
 * (« Par jour »), the retention footnote and the side panel's shortcut groups.
 * The audit log renders it full-page; the dashboard, an organisation and a
 * member render it inside their own tab. Every number it prints is either the
 * caller's exact whole-collection count or « — » — it never turns the loaded
 * page into a total (§2.8).
 */
export const HistoryPage = ({
	testId,
	className,
	title,
	inset,
	header,
	totalCount = null,
	searchPlaceholder,
	q = '',
	onSearch,
	searchTestId,
	cards,
	onExport,
	exportTestId,
	banner,
	events,
	locale,
	onOpen,
	openLabel,
	emptyTitle,
	emptyText,
	noMatchTitle,
	noMatchText,
	filters = [],
	filtersValue = EMPTY_FILTERS_VALUE,
	onFiltersChange,
	panelGroups = [],
	panelGroupsAfter = [],
	queryState,
	errorText,
	pager,
	toolbarExtra,
	showOrganisation = false,
	retentionDays = 365,
}: HistoryPageProps) => {
	const { t } = useTranslation('common');
	const [statsOpen, setStatsOpen] = useState(true);
	const toolbar = useRef<HTMLElement>(null);
	const listFilters = toListFilters(filters);
	const counts = toFilterCounts(filters);

	let activeFilterCount = 0;
	for (const filter of filters) {
		activeFilterCount += filtersValue[filter.key]?.length ?? 0;
	}
	const hasActiveFilters = activeFilterCount > 0;

	const setValue = (key: string, next: string[]) => {
		onFiltersChange?.({ ...filtersValue, [key]: next });
	};
	const toggle = (key: string, value: string) => {
		const current = filtersValue[key] ?? [];
		setValue(
			key,
			current.includes(value)
				? current.filter((entry) => entry !== value)
				: [...current, value],
		);
	};
	const clear = (key: string) => setValue(key, []);
	const clearAll = () => {
		if (!onFiltersChange) {
			return;
		}
		const next: ListFiltersValue = {};
		for (const filter of filters) {
			next[filter.key] = [];
		}
		onFiltersChange(next);
	};

	const filterGroups: ListPanelGroup[] = [];
	for (const filter of filters) {
		if (!filter.panel) {
			continue;
		}
		filterGroups.push({
			key: filter.key,
			title: filter.label,
			entries: filter.choices.map((choice) => ({
				key: `${filter.key}:${choice.value}`,
				label: choice.label,
				icon:
					choice.icon ??
					createElement(filter.icon, {
						'aria-hidden': true,
						className: 'size-4 shrink-0',
					}),
				count: choice.count ?? null,
				active: filtersValue[filter.key]?.includes(choice.value) ?? false,
				onClick: () => toggle(filter.key, choice.value),
			})),
		});
	}

	const footnote =
		totalCount === null
			? t('history-events-unknown', { days: retentionDays })
			: t('history-events', { count: totalCount, days: retentionDays });

	return (
		<div
			className={cn('flex min-h-full flex-col gap-4 md:gap-6', className)}
			data-testid={testId}
			data-history-page=""
		>
			{header ?? (
				<ListPageHeader
					title={title}
					inset={inset}
					count={totalCount}
					onExport={onExport}
					exportTestId={exportTestId}
					cards={cards}
					statsOpen={statsOpen}
					onToggleStats={() => setStatsOpen((open) => !open)}
				/>
			)}
			{cards && !inset ? (
				<Collapse open={statsOpen} axis="y">
					<div className="relative grid grid-cols-[repeat(auto-fit,minmax(min(230px,calc(50%_-_8px)),1fr))] gap-3 md:gap-4">
						{cards}
					</div>
				</Collapse>
			) : null}
			{banner}
			{filters.length > 0 ? (
				<>
					<ListToolbar
						top={toolbar}
						search={
							onSearch ? (
								<SearchField
									q={q}
									onSearch={onSearch}
									placeholder={searchPlaceholder ?? ''}
									testId={searchTestId}
								/>
							) : null
						}
					>
						{toolbarExtra}
						<FilterMenu
							filters={listFilters}
							active={filtersValue}
							counts={counts}
							onToggle={toggle}
							onClear={clear}
						/>
					</ListToolbar>
					<FilterChips
						filters={listFilters}
						active={filtersValue}
						onToggle={toggle}
						onClearAll={clearAll}
					/>
				</>
			) : null}
			<HistoryBody
				testId={testId}
				events={events}
				locale={locale}
				showOrganisation={showOrganisation}
				onOpen={onOpen}
				openLabel={openLabel}
				emptyTitle={emptyTitle}
				emptyText={emptyText}
				noMatchTitle={noMatchTitle}
				noMatchText={noMatchText}
				hasActiveFilters={hasActiveFilters}
				footnote={footnote}
				errorText={errorText}
				pager={pager}
				queryState={queryState}
			/>
			<ListFilterPanel
				groups={[...panelGroups, ...filterGroups, ...panelGroupsAfter]}
				targetId={PANEL_TARGET_ID}
			/>
		</div>
	);
};
