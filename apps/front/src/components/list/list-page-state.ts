import { IconDots } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveTableBodyState } from '~/components/table/table-body-state';

import { moveColumn } from './list-columns';
import type { ListPageProps } from './list-page';
import {
	buildFilterCounts,
	countActiveFilters,
	filterActions,
	rowPasses,
	sortRows,
} from './list-page-derive';
import { useListTable } from './list-table';

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
	const filtered = rows.filter(
		(row) => inTab(row) && rowPasses(row, filters, filtersValue),
	);
	// The counter source is the whole collection when the API already narrowed
	// `rows` (a server-side filter or search); the table still shows only the
	// filtered rows.
	const counted = countRows ?? rows;
	const sort = sorting[0];
	const displayed = sortRows(filtered, columns, sorting, locale);
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
	const { counts, panelCounts } = buildFilterCounts(
		{ filters, filtersValue, counted, countsKnown, inTab },
		apiCounts,
		apiPanelCounts,
	);
	const { toggleFilter, clearFilter, clearAllFilters, shortcut } =
		filterActions(filters, filtersValue, onFiltersChange);
	const activeFilterCount = countActiveFilters(filters, filtersValue);
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
