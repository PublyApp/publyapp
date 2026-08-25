export type TableDensity = 'compact' | 'comfortable';
export type TableRowHeight = 48 | 52 | 56;

export const DENSITY_TO_ROW_HEIGHT = {
	compact: 48,
	comfortable: 56,
} satisfies Record<TableDensity, TableRowHeight>;

export const TABLE_DEFAULT_ROW_HEIGHT: TableRowHeight = 48;
