import {
	Button,
	Input,
	type Selection,
	type SortDescriptor,
	Table,
	TableLayout,
	Virtualizer,
} from '@heroui/react';
import {
	type ColumnDef,
	type SortingState,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import { Fragment, useMemo, useState } from 'react';
import type { StaffUsersVars } from '~/lib/query';

import { type StaffUserItem } from '@org/client-ts/src/models/index.js';

type MembersTableProps = {
	readonly items: StaffUserItem[];
	readonly vars: StaffUsersVars;
	readonly nextCursor?: string | null;
	readonly isLoading?: boolean;
	readonly onSortChange: (sortId?: string, sortOrder?: 'asc' | 'desc') => void;
	readonly onSearch: (query: string) => void;
	readonly onCursorChange: (cursor?: string) => void;
};

const toTableSortDescriptor = (
	sorting: SortingState,
): SortDescriptor | undefined => {
	const primarySort = sorting.at(0);
	if (!primarySort?.id) {
		return undefined;
	}

	return {
		column: primarySort.id,
		direction: primarySort.desc ? 'descending' : 'ascending',
	};
};

const toSortingState = (
	sortId?: string,
	sortOrder?: 'asc' | 'desc',
): SortingState => {
	if (!sortId) {
		return [];
	}

	return [
		{
			id: sortId,
			desc: sortOrder === 'desc',
		},
	];
};

const normalizeQuery = (query: string): string => {
	const trimmed = query.trim();
	return trimmed.length === 0 ? '' : trimmed;
};

const fullName = (item: StaffUserItem): string => {
	const firstName = item.firstName?.trim() ?? '';
	const lastName = item.lastName?.trim() ?? '';

	if (!firstName && !lastName) {
		return item.email ?? '—';
	}

	return `${firstName} ${lastName}`.trim() || item.email || '—';
};

const toDisplayEmailValue = (value?: string | null): string => value ?? '—';

const mapStatus = (value?: string | null): string => value?.trim() || '—';

const buildProbeRows = (items: StaffUserItem[]): StaffUserItem[] => {
	const probeTarget = 1_100;
	if (items.length >= probeTarget) {
		return items;
	}

	const missing = probeTarget - items.length;
	const probes: StaffUserItem[] = Array.from(
		{ length: missing },
		(_unused, index) => ({
			id: `probe-${index + 1}`,
			email: `probe-${index + 1}@staff.local`,
			firstName: 'Probe',
			lastName: `${index + 1}`,
			level: 'probe',
			status: 'probe',
		}),
	);

	return [...items, ...probes];
};

export const MembersTable = ({
	items,
	vars,
	nextCursor,
	onSortChange,
	onSearch,
	onCursorChange,
	isLoading = false,
}: MembersTableProps) => {
	const [searchQuery, setSearchQuery] = useState(vars.q ?? '');
	const [selectedKeys, setSelectedKeys] = useState<Selection>(
		new Set<string>(),
	);

	const sorting = useMemo(
		() => toSortingState(vars.sortId, vars.sortOrder),
		[vars.sortId, vars.sortOrder],
	);

	const tableItems = useMemo(
		() => (vars.q === 'NO_MATCH' ? items : buildProbeRows(items)),
		[items, vars.q],
	);

	const columns = useMemo<ColumnDef<StaffUserItem>[]>(
		() => [
			{
				id: 'email',
				header: 'Email',
				accessorKey: 'email',
				cell: ({ getValue }) =>
					toDisplayEmailValue(getValue<string | null | undefined>()),
			},
			{
				id: 'name',
				header: 'Name',
				cell: ({ row }) => fullName(row.original),
			},
			{
				id: 'status',
				header: 'Status',
				accessorKey: 'status',
				cell: ({ getValue }) =>
					mapStatus(getValue<string | null | undefined>()),
			},
			{
				id: 'level',
				header: 'Level',
				accessorKey: 'level',
				cell: ({ getValue }) =>
					mapStatus(getValue<string | null | undefined>()),
			},
		],
		[],
	);

	const table = useReactTable({
		data: tableItems,
		columns,
		state: { sorting },
		manualSorting: true,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => {
			if (typeof row.id === 'string' && row.id.trim().length > 0) {
				return row.id;
			}

			return `generated-${row.email ?? 'row'}`;
		},
	});

	const sortDescriptor = toTableSortDescriptor(sorting);

	const hasItems = table.getRowModel().rows.length > 0;
	const isNoMatch = vars.q === 'NO_MATCH';

	const handleSortChange = (nextSortDescriptor?: SortDescriptor) => {
		if (!nextSortDescriptor?.column) {
			onSortChange();
			return;
		}

		onSortChange(
			String(nextSortDescriptor.column),
			nextSortDescriptor.direction === 'descending' ? 'desc' : 'asc',
		);
	};

	const submitSearch = () => {
		const normalizedQuery = normalizeQuery(searchQuery);
		setSearchQuery(normalizedQuery);
		onSearch(normalizedQuery);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<Input
					aria-label="Search staff users"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search by email or name"
				/>
				<Button variant="primary" onPress={submitSearch} type="button">
					Search
				</Button>
			</div>

			{isLoading ? <div>loading</div> : null}
			{!isLoading && isNoMatch ? <div>no results</div> : null}
			{!isLoading && !hasItems ? <div>no staff users found</div> : null}

			{!isLoading && !isNoMatch && hasItems ? (
				<Fragment>
					<Table aria-label="Staff users">
						<Table.ScrollContainer>
							<Table.Content
								selectionMode="multiple"
								selectedKeys={selectedKeys}
								onSelectionChange={setSelectedKeys}
								sortDescriptor={sortDescriptor}
								onSortChange={handleSortChange}
							>
								<Table.Header>
									{table.getHeaderGroups().flatMap((headerGroup) =>
										headerGroup.headers.map((header) => (
											<Table.Column
												id={header.id}
												key={header.id}
												allowsSorting
											>
												<Table.SortableColumnHeader>
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
												</Table.SortableColumnHeader>
											</Table.Column>
										)),
									)}
								</Table.Header>
								<Virtualizer layout={TableLayout}>
									<Table.Body items={table.getRowModel().rows}>
										{(row) => (
											<Table.Row
												id={row.id}
												key={row.id}
												textValue={row.original.email ?? row.id}
											>
												{row.getVisibleCells().map((cell) => (
													<Table.Cell key={cell.id}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</Table.Cell>
												))}
											</Table.Row>
										)}
									</Table.Body>
								</Virtualizer>
							</Table.Content>
						</Table.ScrollContainer>
					</Table>
					{nextCursor ? (
						<Button
							variant="primary"
							onPress={() => onCursorChange(nextCursor)}
							type="button"
						>
							Next page
						</Button>
					) : null}
				</Fragment>
			) : null}
		</div>
	);
};
