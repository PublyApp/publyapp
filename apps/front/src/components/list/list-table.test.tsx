/**
 * @vitest-environment jsdom
 */
import { IconBuilding, IconHash } from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
	}),
}));

import { ListTable, useListTable } from './list-table';
import type { ListColumn, ListSelection } from './list-types';

afterEach(cleanup);

type Row = { id: string; name: string; members: number };

const columns: ListColumn<Row>[] = [
	{
		id: 'name',
		header: 'Organisation',
		icon: IconBuilding,
		width: 240,
		value: (row) => row.name,
		cell: (row) => <span>{row.name}</span>,
	},
	{
		id: 'members',
		header: 'Membres',
		icon: IconHash,
		width: 120,
		value: (row) => row.members,
		cell: (row) => <span>{row.members}</span>,
	},
];

const specs = new Map([
	['name', { label: 'Organisation', icon: IconBuilding, width: 240 }],
	['members', { label: 'Membres', icon: IconHash, width: 120 }],
]);

const rows: Row[] = [
	{ id: 'a', name: 'Acme', members: 12 },
	{ id: 'b', name: 'Globex', members: 3 },
];

const Harness = ({
	sorting,
	onSortingChange,
	selection,
	data = rows,
}: {
	sorting: SortingState;
	onSortingChange: (next: SortingState) => void;
	selection?: ListSelection;
	data?: Row[];
}) => {
	const table = useListTable({
		data,
		columns,
		sorting,
		onSortingChange,
		specs,
	});
	return (
		<ListTable
			ariaLabel="Organisations"
			specs={specs}
			ids={table.ids}
			rows={table.rows}
			head={table.head}
			totals={
				new Map([
					['name', `${data.length} organisations`],
					['members', '15 membres'],
				])
			}
			onOpen={() => undefined}
			openLabel={(row) => `Ouvrir ${row.name}`}
			selection={selection}
			empty={<p>Vide</p>}
			cards={<div data-testid="cards" />}
			onMove={() => undefined}
		/>
	);
};

describe('ListTable', () => {
	test('renders the rows, the pinned totals and the sticky header offset', () => {
		render(<Harness sorting={[]} onSortingChange={vi.fn()} />);

		expect(screen.getByText('Acme')).toBeTruthy();
		expect(screen.getByText('Globex')).toBeTruthy();
		expect(screen.getByText('15 membres')).toBeTruthy();

		const pinned = document.querySelector('[data-pinned-head]');
		expect(pinned?.className).toContain(
			'top-[calc(var(--search-height,0px)-var(--page-pad-top))]',
		);
	});

	test('a header click asks for a sort', () => {
		const onSortingChange = vi.fn();
		render(<Harness sorting={[]} onSortingChange={onSortingChange} />);
		fireEvent.click(screen.getByRole('button', { name: /Organisation/ }));
		expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
	});

	test('selection renders per-row checkboxes and reports a toggle', () => {
		const onToggle = vi.fn();
		render(
			<Harness
				sorting={[]}
				onSortingChange={vi.fn()}
				selection={{
					selectedIds: new Set(),
					onToggle,
					onToggleAll: vi.fn(),
				}}
			/>,
		);

		fireEvent.click(
			screen.getAllByRole('checkbox', { name: 'list-select-row' })[0],
		);
		expect(onToggle).toHaveBeenCalledWith('a');
	});

	test('an empty list shows the empty content and no rows', () => {
		render(<Harness sorting={[]} onSortingChange={vi.fn()} data={[]} />);
		expect(screen.getByText('Vide')).toBeTruthy();
	});
});
