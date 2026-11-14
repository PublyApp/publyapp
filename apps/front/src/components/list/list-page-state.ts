import { IconDots } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveTableBodyState } from '~/components/table/table-body-state';

import type { FilterCounts } from './filter-menu';
import { moveColumn } from './list-columns';
import type { ListPageProps } from './list-page';
import { useListTable } from './list-table';
import type { ListFilter, ListFiltersValue } from './list-types';
import { listValueHas } from './list-types';

/** The unknown-total convention (§4.1 item 11): « — », never a page sum. */
const DASH = '—';

/**
 * Every derived value and handler of the generic list page: the tab/sort/filter
 * state, the client-side sort, the column specs, the faceted counts and the
 * totals. Split out of `ListPage` for `react-doctor/no-giant-component`; the
 * behaviour is unchanged.
 */
export const useListPage = <T extends { id: string }>({
	rows,
	columns,
	defaultColumns,
	lockedColumn,
	sorting,
	onSortingChange,
	q,
	locale,
	filters,
	filtersValue,
	onFiltersChange,
	countsKnown = true,
	countRows,
	totalsKnown = countsKnown,
	counts: apiCounts,
	panelCounts: apiPanelCounts,
	emptyText,
	tabs = [],
	currentTab,
	onTabChange,
	renderActions,
	totals,
	query,
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
				filter.serverSide === true ||
				(filtersValue[filter.key]?.length ?? 0) === 0 ||
				filtersValue[filter.key].some((value) =>
					listValueHas(filter.valueOf(row), value),
				),
		);

	const filtered = rows.filter((row) => inTab(row) && passes(row));
	// The counter source is the whole collection when the API already narrowed
	// `rows` (a server-side filter or search); the table still shows only the
	// filtered rows.
	const counted = countRows ?? rows;
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
				return String(left).localeCompare(String(right), locale) * direction;
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

	// The footer labels these cells as totals, so it sums the displayed
	// (filtered) rows — the prototype's rule: a filter changes the totals. It
	// shows « — » only when the displayed page is not the whole filtered
	// collection (issue #2274 review round 2).
	const totalCells = totals(displayed);
	if (!totalsKnown) {
		for (const id of totalCells.keys()) {
			totalCells.set(id, DASH);
		}
	}

	// The filter menu facets each choice within the other filters; the side
	// panel keeps whole-collection counts, as the prototype's panel does (the
	// other filters do not change them). `null` means the collection is not
	// fully loaded and the API exposes no count source.
	const countChoices = (
		filter: ListFilter<T>,
		withinOtherFilters: boolean,
	): Record<string, number | null> =>
		Object.fromEntries(
			filter.choices.map((choice) => [
				choice.value,
				countsKnown
					? counted.filter(
							(row) =>
								inTab(row) &&
								(!withinOtherFilters || passes(row, filter.key)) &&
								listValueHas(filter.valueOf(row), choice.value),
						).length
					: null,
			]),
		);
	const counts: FilterCounts = {};
	const panelCounts: FilterCounts = {};
	for (const filter of filters) {
		counts[filter.key] = apiCounts?.[filter.key] ?? countChoices(filter, true);
		panelCounts[filter.key] =
			apiPanelCounts?.[filter.key] ??
			apiCounts?.[filter.key] ??
			countChoices(filter, false);
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

	let activeFilterCount = 0;
	for (const filter of filters) {
		activeFilterCount += filtersValue[filter.key]?.length ?? 0;
	}
	const hasActiveSearch = q.length > 0 || activeFilterCount > 0;
	const bodyState = resolveTableBodyState({
		isPending: query.isPending,
		isError: query.isError,
		rowCount: displayed.length,
		hasActiveSearch,
	});
	const emptyContent = emptyText ?? t('list-empty');

	const tabDefs = tabs.map((entry) => ({
		key: entry.key,
		label: entry.label,
		count: countsKnown ? counted.filter(entry.match).length : null,
	}));

	return {
		top,
		searchHeight,
		setSearchHeight,
		shown,
		setShown,
		resetColumns: () => setShown(defaultColumns),
		moveShown: (from: string, before: string) =>
			setShown((current) => moveColumn(current, from, before, lockedColumn)),
		isDefaultColumns: shown.join() === defaultColumns.join(),
		statsOpen,
		toggleStats: () => setStatsOpen((open) => !open),
		tab,
		pickTab: (key: string) => {
			setTab(key);
			onTabChange?.(key);
		},
		tabDefs,
		sort,
		specs,
		tableRows,
		ids,
		head,
		displayed,
		totalCells,
		counts,
		panelCounts,
		toggleFilter,
		clearFilter,
		clearAllFilters,
		shortcut,
		bodyState,
		emptyContent,
	};
};
