import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

/** Optional per-column display hints read from TanStack's ColumnDef meta. */
export type ColumnDisplayMeta = {
	/** 14px leading icon rendered before the header label. */
	headerIcon?: ReactNode;
	/** Extra class applied to both the header and body cells (e.g. width). */
	cellClassName?: string;
	/**
	 * Fixed `<col>` width (e.g. '104px'). Omit for the one column per table
	 * that should absorb remaining space — table-layout:fixed gives an
	 * unspecified column the leftover width, the fluid-column equivalent of
	 * `1fr`.
	 */
	width?: string;
	/**
	 * Centres cell content against the full column box instead of the
	 * padded content box (e.g. a 40px actions column with a 32px trigger,
	 * where the default 14px inline padding leaves no room to centre).
	 */
	align?: 'center';
	/**
	 * Drops the column entirely (not just visually — via TanStack column
	 * visibility, so its `<col>` and cells never render) once the viewport
	 * narrows below this px width, e.g. `768`. table-layout:fixed sizes the
	 * table from the sum of its *visible* fixed-width columns, so removing a
	 * column from that sum is what keeps the table from forcing horizontal
	 * scroll on narrow screens — a CSS-only `display:none` on a `<col>`
	 * wouldn't shrink that sum, `<col>` display is largely inert.
	 */
	hideBelow?: number;
	/**
	 * Restricts `width` to viewports at or above this px breakpoint; below
	 * it, the column drops its explicit width and flexes like an unset
	 * (`1fr`-equivalent) column instead. For an identity column that must
	 * stay pinned at its ratified desktop grid width (e.g. `200px`) but
	 * can't afford that same fixed width once the other columns it shares a
	 * row with have already dropped to their `hideBelow` floor — pinning it
	 * unconditionally would blow the mobile `rows.scrollWidth <=
	 * card.clientWidth` budget table-layout:fixed enforces.
	 */
	pinWidthAbove?: number;
};

declare module '@tanstack/react-table' {
	interface ColumnMeta<TData, TValue> extends ColumnDisplayMeta {}
}

export const columnDisplayMeta = (
	column: ColumnDef<never> | { meta?: unknown },
): ColumnDisplayMeta => (column.meta ?? {}) as ColumnDisplayMeta;

/** Resolves a column's effective `<col>` width, honoring `pinWidthAbove`. */
export const resolveColumnWidth = (
	displayMeta: ColumnDisplayMeta,
	matchedBreakpoints: ReadonlySet<number>,
): string | undefined => {
	if (displayMeta.width == null) {
		return undefined;
	}
	if (
		displayMeta.pinWidthAbove != null &&
		!matchedBreakpoints.has(displayMeta.pinWidthAbove)
	) {
		return undefined;
	}
	return displayMeta.width;
};

export const resolveAriaSortState = (
	tableSort: { id: string; desc: boolean } | undefined,
	columnId: string,
): 'ascending' | 'descending' | 'none' => {
	if (tableSort?.id !== columnId) {
		return 'none';
	}

	if (tableSort.desc) return 'descending';
	return 'ascending';
};
