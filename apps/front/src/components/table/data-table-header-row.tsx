import {
	IconArrowDown,
	IconArrowUp,
	IconArrowsSort,
} from '@tabler/icons-react';
import { type Table as TanStackTable, flexRender } from '@tanstack/react-table';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '~/components/ui/checkbox';
import { TableHead, TableHeader, TableRow } from '~/components/ui/table';

import { columnDisplayMeta, resolveAriaSortState } from './column-display-meta';
import type { SortState } from './sort-descriptor';

const renderSortIcon = (
	tableSort: { id: string; desc: boolean } | undefined,
	columnId: string,
): ReactNode => {
	if (tableSort?.id !== columnId) {
		return <IconArrowsSort data-slot="table-sort-icon" />;
	}

	if (tableSort.desc) {
		return <IconArrowDown data-slot="table-sort-icon" />;
	}
	return <IconArrowUp data-slot="table-sort-icon" />;
};

/** Select-all checkbox state for the header's leading selection cell. Omitted
 * entirely when the table has no selection. */
type SelectionHeaderState = {
	allRowsSelected: boolean;
	hasPartialSelection: boolean;
	onToggleSelectAll: () => void;
};

export type DataTableHeaderRowProps<TData> = {
	table: TanStackTable<TData>;
	tableSort: { id: string; desc: boolean } | undefined;
	isSelectionMode: boolean;
	onSortChange: (nextSort: SortState | undefined) => void;
	selectionHeader?: SelectionHeaderState;
};

/** The sortable header row (plus the select-all cell). Extracted from
 * `DataTable` verbatim — same DOM, same handlers. */
export const DataTableHeaderRow = <TData,>({
	table,
	tableSort,
	isSelectionMode,
	onSortChange,
	selectionHeader,
}: DataTableHeaderRowProps<TData>) => {
	// "use no memo" — reads the mutable TanStack `table` instance during
	// render (header groups); compiler memoization skipped this component's
	// body when only the parent re-rendered. Full explanation in data-table.tsx.
	'use no memo';
	const { t } = useTranslation('common');

	const handleSort = (columnId: string): void => {
		if (isSelectionMode) {
			return;
		}

		if (tableSort?.id !== columnId) {
			onSortChange({ id: columnId, order: 'asc' });
			return;
		}

		onSortChange({
			id: columnId,
			order: tableSort.desc ? 'asc' : 'desc',
		});
	};

	const handleSortKeyDown = (
		event: KeyboardEvent<HTMLTableCellElement>,
		columnId: string,
	): void => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		handleSort(columnId);
	};

	return (
		<TableHeader>
			<TableRow>
				{selectionHeader ? (
					<TableHead
						data-slot="table-selection-cell"
						aria-label={t('row-selection-column')}
					>
						<Checkbox
							checked={selectionHeader.allRowsSelected}
							indeterminate={selectionHeader.hasPartialSelection}
							onCheckedChange={() => {
								selectionHeader.onToggleSelectAll();
							}}
							aria-label={t('select-all-rows')}
						/>
					</TableHead>
				) : null}
				{table.getHeaderGroups().flatMap((headerGroup) =>
					headerGroup.headers.map((header) => {
						const canSort = header.column.getCanSort();
						const displayMeta = columnDisplayMeta(header.column.columnDef);
						const sortIcon = canSort
							? renderSortIcon(tableSort, header.id)
							: null;
						const sortState = canSort
							? resolveAriaSortState(tableSort, header.id)
							: undefined;
						return (
							<TableHead
								key={header.id}
								data-slot={
									canSort ? 'table-sortable-column-header' : 'table-column'
								}
								data-align={displayMeta.align}
								onClick={() => {
									if (canSort) {
										handleSort(header.id);
									}
								}}
								onKeyDown={(event) => {
									if (canSort) {
										handleSortKeyDown(event, header.id);
									}
								}}
								tabIndex={canSort ? 0 : undefined}
								aria-sort={sortState}
								className={`${canSort ? 'cursor-pointer' : ''} ${
									displayMeta.cellClassName ?? ''
								}`}
							>
								<div className="inline-flex items-center gap-1.5">
									{displayMeta.headerIcon ? (
										<span
											aria-hidden="true"
											data-slot="table-header-icon"
											className="inline-flex items-center [&_svg]:size-3.5"
										>
											{displayMeta.headerIcon}
										</span>
									) : null}
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
									{sortIcon}
								</div>
							</TableHead>
						);
					}),
				)}
			</TableRow>
		</TableHeader>
	);
};
