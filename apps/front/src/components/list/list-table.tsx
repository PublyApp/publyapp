import {
	IconArrowDown,
	IconArrowUp,
	IconArrowsSort,
	IconExternalLink,
	type TablerIcon,
} from '@tabler/icons-react';
import {
	flexRender,
	functionalUpdate,
	type SortingState,
} from '@tanstack/react-table';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
	getCoreRowModel,
	useLegacyTable,
	type ColumnDef,
} from '~/components/table/column-type';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { cn } from '~/lib/utils';

import type { ColumnSpecs, ListColumn, ListSelection } from './list-types';

const TABLE = 'w-full table-fixed border-separate border-spacing-0 text-sm';
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;
const SORTED_ICON = { asc: IconArrowUp, desc: IconArrowDown };

export type HeadCell = {
	id: string;
	label: ReactNode;
	icon: TablerIcon;
	canSort: boolean;
	sorted: false | 'asc' | 'desc';
	onSort: () => void;
};

/** The sort slot after a sortable label, always reserved so nothing moves. */
const SortSlot = ({ sorted }: { sorted: HeadCell['sorted'] }) => {
	if (sorted) {
		const Arrow = SORTED_ICON[sorted];
		return (
			<Arrow aria-hidden="true" className="size-3.5 shrink-0 text-foreground" />
		);
	}

	return (
		<IconArrowsSort
			aria-hidden="true"
			className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100"
		/>
	);
};

/** Sticky header; a click sorts; a header dragged onto another lands before it. */
const TableHead = ({
	cells,
	onMove,
	selection,
	allSelected,
	onToggleAll,
}: {
	cells: HeadCell[];
	onMove?: (from: string, before: string) => void;
	selection?: ListSelection;
	allSelected: boolean;
	onToggleAll: () => void;
}) => {
	const { t } = useTranslation('common');
	const [dragged, setDragged] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);

	const end = () => {
		setDragged(null);
		setOver(null);
	};

	return (
		<thead>
			<tr>
				{cells.map((cell, index) => {
					const Icon = cell.icon;
					const pinned = index === 0 || !onMove;
					return (
						<th
							key={cell.id}
							aria-sort={cell.sorted ? ARIA_SORT[cell.sorted] : undefined}
							draggable={!pinned}
							onDragStart={(event) => {
								event.dataTransfer.effectAllowed = 'move';
								event.dataTransfer.setData('text/plain', cell.id);
								setDragged(cell.id);
							}}
							onDragOver={(event) => {
								if (dragged && !pinned) {
									event.preventDefault();
									setOver(cell.id);
								}
							}}
							onDrop={() => {
								if (dragged && !pinned) {
									onMove?.(dragged, cell.id);
								}
								end();
							}}
							onDragEnd={end}
							className={cn(
								'sticky top-0 z-(--publy-z-raised) h-10 truncate border-r border-b bg-background px-2 text-left font-medium text-muted-foreground last:border-r-0',
								index === 0 && 'left-0',
								over === cell.id &&
									dragged !== cell.id &&
									'shadow-[inset_2px_0_0_var(--primary)]',
								dragged === cell.id && 'opacity-50',
							)}
						>
							<div className="flex min-w-0 items-center gap-1.5">
								{index === 0 && selection ? (
									<Checkbox
										checked={allSelected}
										aria-label={t('list-select-all')}
										onCheckedChange={onToggleAll}
									/>
								) : null}
								<button
									type="button"
									disabled={!cell.canSort}
									onClick={cell.onSort}
									className="group/sort flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--publy-radius-sm)] outline-none enabled:hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring/50"
								>
									<Icon aria-hidden="true" className="size-3.5 shrink-0" />
									<span className="truncate">{cell.label}</span>
									{cell.canSort ? <SortSlot sorted={cell.sorted} /> : null}
								</button>
							</div>
						</th>
					);
				})}
			</tr>
		</thead>
	);
};

const TableRow = ({
	cells,
	onOpen,
	openLabel,
	selection,
	selected,
	onToggle,
	rowLabel,
}: {
	cells: { id: string; node: ReactNode }[];
	onOpen: () => void;
	openLabel: string;
	selection?: ListSelection;
	selected: boolean;
	onToggle: () => void;
	rowLabel: string;
}) => {
	const { t } = useTranslation('common');
	return (
		<tr
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === 'Enter' && event.target === event.currentTarget) {
					onOpen();
				}
			}}
			className="group/row h-12 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring/50"
		>
			{cells.map((cell, index) => (
				<td
					key={cell.id}
					className={cn(
						'truncate border-r border-b bg-background px-2 last:border-r-0 group-hover/row:bg-card group-focus-visible/row:bg-card',
						index === 0 && 'sticky left-0 z-(--publy-z-sticky-cell)',
					)}
				>
					{index === 0 ? (
						<div className="flex min-w-0 items-center justify-between gap-1">
							<div className="flex min-w-0 items-center gap-2">
								{selection ? (
									<Checkbox
										checked={selected}
										aria-label={t('list-select-row', { name: rowLabel })}
										onCheckedChange={onToggle}
									/>
								) : null}
								<span className="min-w-0 truncate whitespace-nowrap">
									{cell.node}
								</span>
							</div>
							<Button
								variant="outline"
								className="h-7 shrink-0 gap-1 rounded-[var(--publy-radius-small-control)] px-2.5 text-xs text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground [&_svg]:size-3.5"
								onClick={onOpen}
								aria-label={openLabel}
							>
								<IconExternalLink aria-hidden="true" className="size-3.5" />
								{t('list-open')}
							</Button>
						</div>
					) : (
						cell.node
					)}
				</td>
			))}
		</tr>
	);
};

/**
 * A list table's columns, header cells and rows (TanStack Table, sorting
 * only): the rows come sorted by the caller (`manualSorting`), a header click
 * only asks for a sort (`onSortingChange`), cycling as TanStack does.
 */
export const useListTable = <T extends { id: string }>({
	data,
	columns,
	actions,
	sorting,
	onSortingChange,
	specs,
}: {
	data: T[];
	columns: ListColumn<T>[];
	actions?: (row: T) => ReactNode;
	sorting: SortingState;
	onSortingChange: (next: SortingState) => void;
	specs: ColumnSpecs;
}) => {
	const { t } = useTranslation('common');
	const defs: ColumnDef<T>[] = columns.map((column) => ({
		id: column.id,
		header: column.header,
		accessorFn: column.value ?? (() => null),
		enableSorting: column.sortable !== false,
		cell: ({ row }) => column.cell(row.original),
	}));
	if (actions) {
		defs.push({
			id: 'actions',
			header: () => <span className="sr-only">{t('actions')}</span>,
			enableSorting: false,
			cell: ({ row }) => actions(row.original),
		});
	}

	const table = useLegacyTable({
		data,
		columns: defs,
		manualSorting: true,
		state: { sorting },
		onSortingChange: (updater) =>
			onSortingChange(functionalUpdate(updater, sorting)),
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
	});

	const head: HeadCell[] = table
		.getHeaderGroups()[0]!
		.headers.map((header) => ({
			id: header.id,
			label: flexRender(header.column.columnDef.header, header.getContext()),
			icon: specs.get(header.id)?.icon ?? IconArrowsSort,
			canSort: header.column.getCanSort(),
			sorted: header.column.getIsSorted(),
			onSort: () => header.column.toggleSorting(),
		}));

	return {
		rows: table.getRowModel().rows.map((row) => ({
			id: row.id,
			original: row.original,
			cells: row.getAllCells().map((cell) => ({
				id: cell.id,
				node: flexRender(cell.column.columnDef.cell, cell.getContext()),
			})),
		})),
		ids: table.getAllLeafColumns().map((column) => column.id),
		head,
	};
};

/**
 * A generic list table (Shopkart OS `data-table.tsx`): the pinned header and
 * totals, a sticky first column, vertical rules carried down through the
 * spacer row to the totals, and the meta cards below `md`. The box fills the
 * height left by the page (#2280): the header and the totals are shrink-0
 * siblings of the only scroller, so the rows scroll between them — the totals
 * sit at the bottom of the scroll area with nothing under them, and the pager
 * below stays on screen instead of after a hundred rows.
 *
 * The header and totals tables are outside the sideways scroller (any overflow
 * would be the box a sticky header sticks in) and follow its `scrollLeft`. The
 * body's first column pins with `--publy-z-sticky-cell`, below the toolbar and
 * header's `--publy-z-raised`: a cell sliding under them must never paint over
 * them (#2280).
 */
export const ListTable = <T extends { id: string }>({
	ariaLabel,
	specs,
	ids,
	rows,
	head,
	totals,
	onOpen,
	openLabel,
	selection,
	empty,
	cards,
	onMove,
}: {
	ariaLabel: string;
	specs: ColumnSpecs;
	ids: string[];
	rows: { id: string; original: T; cells: { id: string; node: ReactNode }[] }[];
	head: HeadCell[];
	totals: ReadonlyMap<string, string>;
	onOpen: (row: T) => void;
	openLabel: (row: T) => string;
	selection?: ListSelection;
	empty: ReactNode;
	cards: ReactNode;
	onMove: (from: string, before: string) => void;
}) => {
	const { t } = useTranslation('common');
	const headBox = useRef<HTMLDivElement>(null);
	const footBox = useRef<HTMLDivElement>(null);
	let minWidth = 0;
	for (const id of ids) {
		minWidth += specs.get(id)?.width ?? 120;
	}
	const allSelected =
		rows.length > 0 &&
		selection !== undefined &&
		rows.every((row) => selection.selectedIds.has(row.id));

	const cols = (
		<colgroup>
			{ids.map((id) => (
				<col key={id} style={{ width: specs.get(id)?.width ?? 120 }} />
			))}
		</colgroup>
	);

	return (
		<>
			<div className="hidden min-h-[320px] flex-1 flex-col overflow-clip rounded-[var(--publy-radius-control)] border bg-background md:flex">
				<div
					ref={headBox}
					data-pinned-head=""
					className="sticky top-[calc(var(--search-height,0px)-var(--page-pad-top))] z-(--publy-z-raised) shrink-0 overflow-hidden [scrollbar-gutter:stable]"
				>
					<table aria-label={ariaLabel} className={TABLE} style={{ minWidth }}>
						{cols}
						<TableHead
							cells={head}
							onMove={onMove}
							selection={selection}
							allSelected={allSelected}
							onToggleAll={() =>
								selection?.onToggleAll(rows.map((row) => row.id))
							}
						/>
					</table>
				</div>
				<div
					className="min-h-0 flex-1 overflow-auto [container-type:inline-size] [scrollbar-gutter:stable]"
					onScroll={(event) => {
						for (const pinned of [headBox.current, footBox.current]) {
							if (pinned) {
								pinned.scrollLeft = event.currentTarget.scrollLeft;
							}
						}
					}}
				>
					<table
						className={cn(TABLE, '[&:has(tr[data-spacer])]:h-full')}
						style={{ minWidth }}
					>
						{cols}
						<tbody>
							{rows.length === 0 ? (
								<tr>
									<td colSpan={ids.length} className="p-0 whitespace-normal">
										<div className="sticky left-0 w-[100cqw]">{empty}</div>
									</td>
								</tr>
							) : (
								rows.map((row) => (
									<TableRow
										key={row.id}
										cells={row.cells}
										onOpen={() => onOpen(row.original)}
										openLabel={openLabel(row.original)}
										selection={selection}
										selected={selection?.selectedIds.has(row.id) ?? false}
										onToggle={() => selection?.onToggle(row.id)}
										rowLabel={
											(row.original as { name?: string }).name ?? row.id
										}
									/>
								))
							)}
							<tr aria-hidden="true" data-spacer="">
								{ids.map((id, index) => (
									<td
										key={id}
										className={cn(
											'border-r bg-background p-0 last:border-r-0',
											index === 0 && 'sticky left-0 z-(--publy-z-sticky-cell)',
										)}
									/>
								))}
							</tr>
						</tbody>
					</table>
				</div>
				{/* Pinned to the bottom of the scroll area, after the scroller: no
				    partial row can show under it (#2280). */}
				<div
					ref={footBox}
					data-pinned-foot=""
					className="sticky bottom-0 z-(--publy-z-raised) shrink-0 overflow-hidden bg-background [scrollbar-gutter:stable]"
				>
					<table
						aria-label={t('list-summary')}
						className={TABLE}
						style={{ minWidth }}
					>
						{cols}
						<tbody>
							<tr className="h-10 text-xs whitespace-nowrap text-muted-foreground">
								{ids.map((id, index) => (
									<td
										key={id}
										title={totals.get(id)}
										className={cn(
											'truncate border-t border-r bg-background px-2 last:border-r-0',
											index === 0 && 'sticky left-0 z-(--publy-z-sticky-cell)',
										)}
									>
										{totals.get(id)}
									</td>
								))}
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			{cards}
		</>
	);
};
