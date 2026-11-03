import type { TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** A column's display data: label, header icon and fixed `<col>` width. */
type ListColumnSpec = {
	label: string;
	icon: TablerIcon;
	width: number;
};

export type ColumnSpecs = ReadonlyMap<string, ListColumnSpec>;

/** One column of a generic list page. */
export type ListColumn<T> = {
	id: string;
	header: string;
	icon: TablerIcon;
	width: number;
	/** The value used by sorting and totals; `null` means the API has none. */
	value?: (row: T) => string | number | null;
	cell: (row: T) => ReactNode;
	/** Defaults to true; false for a display-only column. */
	sortable?: boolean;
};

type ListFilterChoice = {
	value: string;
	label: string;
	/** A per-choice icon (a coloured status glyph); defaults to the filter's. */
	icon?: ReactNode;
};

/** One filter of a list page; values are matched against `valueOf(row)`. */
export type ListFilter<T> = {
	key: string;
	label: string;
	icon: TablerIcon;
	choices: readonly ListFilterChoice[];
	valueOf: (row: T) => string | string[];
	/** Also listed as a shortcut group in the side panel. */
	panel?: boolean;
};

export type ListFiltersValue = Record<string, string[]>;

export type ListTab<T> = {
	key: string;
	label: string;
	match: (row: T) => boolean;
};

export type ListSelection = {
	selectedIds: ReadonlySet<string>;
	onToggle: (id: string) => void;
	onToggleAll: (ids: string[]) => void;
};

export type ListMobileCard = {
	code: string;
	badges?: ReactNode;
	end?: ReactNode;
	title: ReactNode;
	sub?: ReactNode;
	foot?: [string, ReactNode];
};

export const listValueHas = (
	value: string | string[],
	candidate: string,
): boolean =>
	Array.isArray(value) ? value.includes(candidate) : value === candidate;

/** A value's label, or the raw value when the filter has no such choice. */
export const labelOfFilterValue = <T>(
	filter: ListFilter<T> | undefined,
	value: string,
): string =>
	filter?.choices.find((choice) => choice.value === value)?.label ?? value;
