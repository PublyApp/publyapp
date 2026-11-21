import type { SortingState } from '@tanstack/react-table';

import type { FilterCounts } from './filter-menu';
import type { ListColumn, ListFilter, ListFiltersValue } from './list-types';
import { listValueHas } from './list-types';

type SortValue = string | number | null;

/** Nulls last, numbers numerically, anything else by locale collation. */
const compareValues = (
	left: SortValue,
	right: SortValue,
	locale: string | undefined,
	direction: number,
): number => {
	if (left === null || right === null) {
		return Number(left === null) - Number(right === null);
	}
	if (typeof left === 'number' && typeof right === 'number') {
		return (left - right) * direction;
	}
	return String(left).localeCompare(String(right), locale) * direction;
};

/** The rows sorted by the first sorting entry; unchanged without a sortable value. */
export const sortRows = <T>(
	rows: T[],
	columns: ListColumn<T>[],
	sorting: SortingState,
	locale: string | undefined,
): T[] => {
	const sort = sorting[0];
	const value = columns.find((entry) => entry.id === sort?.id)?.value;
	if (!sort || !value) {
		return [...rows];
	}
	const direction = sort.desc ? -1 : 1;
	return [...rows].sort((a, b) =>
		compareValues(value(a) ?? null, value(b) ?? null, locale, direction),
	);
};

/** Whether the row matches every filter (except `except`, and server-side ones). */
export const rowPasses = <T>(
	row: T,
	filters: ListFilter<T>[],
	filtersValue: ListFiltersValue,
	except?: string,
): boolean =>
	filters.every((filter) => {
		const wanted = filtersValue[filter.key] ?? [];
		return (
			filter.key === except ||
			filter.serverSide === true ||
			wanted.length === 0 ||
			wanted.some((value) => listValueHas(filter.valueOf(row), value))
		);
	});

type CountSource<T> = {
	filters: ListFilter<T>[];
	filtersValue: ListFiltersValue;
	counted: T[];
	countsKnown: boolean;
	inTab: (row: T) => boolean;
};

const countChoices = <T>(
	filter: ListFilter<T>,
	withinOtherFilters: boolean,
	source: CountSource<T>,
): Record<string, number | null> =>
	Object.fromEntries(
		filter.choices.map((choice) => [
			choice.value,
			source.countsKnown
				? source.counted.filter(
						(row) =>
							source.inTab(row) &&
							(!withinOtherFilters ||
								rowPasses(
									row,
									source.filters,
									source.filtersValue,
									filter.key,
								)) &&
							listValueHas(filter.valueOf(row), choice.value),
					).length
				: null,
		]),
	);

type FilterCountsPair = { counts: FilterCounts; panelCounts: FilterCounts };

/** The filter-menu counts (faceted within the other filters) and the side-panel
 * counts (whole collection); API counts win when present. */
export const buildFilterCounts = <T>(
	source: CountSource<T>,
	apiCounts: FilterCounts | undefined,
	apiPanelCounts: FilterCounts | undefined,
): FilterCountsPair => {
	const counts: FilterCounts = {};
	const panelCounts: FilterCounts = {};
	for (const filter of source.filters) {
		counts[filter.key] =
			apiCounts?.[filter.key] ?? countChoices(filter, true, source);
		panelCounts[filter.key] =
			apiPanelCounts?.[filter.key] ??
			apiCounts?.[filter.key] ??
			countChoices(filter, false, source);
	}
	return { counts, panelCounts };
};

const emptyFilters = <T>(filters: ListFilter<T>[]): ListFiltersValue => {
	const cleared: ListFiltersValue = {};
	for (const filter of filters) {
		cleared[filter.key] = [];
	}
	return cleared;
};

/** The filter mutations, each reporting the next value through `onChange`. */
export const filterActions = <T>(
	filters: ListFilter<T>[],
	filtersValue: ListFiltersValue,
	onChange: (next: ListFiltersValue) => void,
) => {
	const without = (key: string, value: string) =>
		(filtersValue[key] ?? []).filter((entry) => entry !== value);
	return {
		toggleFilter: (key: string, value: string) => {
			const current = filtersValue[key] ?? [];
			onChange({
				...filtersValue,
				[key]: current.includes(value)
					? without(key, value)
					: [...current, value],
			});
		},
		clearFilter: (key: string) => {
			onChange({ ...filtersValue, [key]: [] });
		},
		clearAllFilters: () => {
			onChange(emptyFilters(filters));
		},
		shortcut: (key: string, value: string) => {
			if (filtersValue[key]?.includes(value)) {
				onChange({ ...filtersValue, [key]: without(key, value) });
				return;
			}
			onChange({ ...emptyFilters(filters), [key]: [value] });
		},
	};
};

export const countActiveFilters = <T>(
	filters: ListFilter<T>[],
	filtersValue: ListFiltersValue,
): number => {
	let total = 0;
	for (const filter of filters) {
		total += filtersValue[filter.key]?.length ?? 0;
	}
	return total;
};
