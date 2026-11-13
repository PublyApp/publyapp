/**
 * @vitest-environment jsdom
 */
import { IconBuilding, IconHash } from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
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

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

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
	totals,
}: {
	sorting: SortingState;
	onSortingChange: (next: SortingState) => void;
	selection?: ListSelection;
	data?: Row[];
	totals?: ReadonlyMap<string, string>;
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
				totals ??
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

	// #2280: the sticky first column used to share `--publy-z-raised` with the
	// pinned toolbar and header and, being later in the DOM, painted over them
	// while scrolling. The scale now puts it above the row's own cells only.
	test('the sticky first column stays below the pinned header and toolbar', () => {
		render(<Harness sorting={[]} onSortingChange={vi.fn()} />);

		const pinned = document.querySelectorAll('td.sticky');
		expect(pinned.length).toBeGreaterThan(0);
		for (const cell of pinned) {
			expect(cell.className).toContain('z-(--publy-z-sticky-cell)');
			expect(cell.className).not.toContain('z-(--publy-z-raised)');
		}

		// The pinned first header outranks the other (sliding) headers, which
		// would otherwise paint over it, later in the DOM at the same z-index.
		const headers = [...document.querySelectorAll('th')];
		expect(headers[0]?.className).toContain('z-(--publy-z-raised)');
		for (const header of headers.slice(1)) {
			expect(header.className).not.toContain('z-(--publy-z-');
		}
		expect(document.querySelector('[data-pinned-head]')?.className).toContain(
			'z-(--publy-z-raised)',
		);
	});

	// #2280 §2.11: the box fills the height left and scrolls its rows between
	// a fixed header and the totals, which are the last thing in the box —
	// nothing (no partial row) can show under them.
	test('the totals are pinned at the bottom of the scrolling box', () => {
		render(<Harness sorting={[]} onSortingChange={vi.fn()} />);

		const head = document.querySelector('[data-pinned-head]');
		const box = head?.parentElement;
		const scroller = head?.nextElementSibling;
		const foot = document.querySelector('[data-pinned-foot]');

		expect(box).not.toBeNull();
		expect(box?.className).toContain('flex-1');
		expect(box?.className).toContain('min-h-[320px]');
		expect(box?.lastElementChild).toBe(foot);

		expect(scroller?.className).toContain('overflow-auto');
		expect(scroller?.className).toContain('flex-1');
		expect(scroller?.className).toContain('min-h-0');
		expect(scroller?.contains(foot)).toBe(false);

		expect(foot?.className).toContain('sticky');
		expect(foot?.className).toContain('bottom-0');
		expect(foot?.className).toContain('z-(--publy-z-raised)');
	});

	// Lot 4a: the header/foot are siblings of the rows scroller, so they do not
	// share its scrollbar. They are narrowed by the gutter it actually takes —
	// a fixed gutter left every column 11px short of the box on a short list,
	// and a gutter that does not match the real scrollbar leaves the header and
	// the rows out of line.
	test('the header and totals follow the rows scroller gutter', () => {
		const observers: (() => void)[] = [];
		class FakeResizeObserver {
			constructor(callback: () => void) {
				observers.push(callback);
			}
			observe() {}
			disconnect() {}
		}
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);

		render(<Harness sorting={[]} onSortingChange={vi.fn()} />);
		const head = document.querySelector('[data-pinned-head]') as HTMLElement;
		const scroller = head.nextElementSibling as HTMLElement;
		const foot = document.querySelector('[data-pinned-foot]') as HTMLElement;

		// jsdom has no layout: pretend the scroller lost 11px to its scrollbar.
		Object.defineProperty(scroller, 'offsetWidth', {
			configurable: true,
			value: 1000,
		});
		Object.defineProperty(scroller, 'clientWidth', {
			configurable: true,
			value: 989,
		});
		act(() => {
			for (const callback of observers) {
				callback();
			}
		});

		expect(head.style.borderRight).toBe('11px solid transparent');
		expect(foot.style.borderRight).toBe('11px solid transparent');
		expect(scroller.className).not.toContain('scrollbar-gutter');
	});

	// Owner decision 04/11: a totals cell never wraps. It keeps one line with
	// an ellipsis, and the full text stays available in `title`.
	test('a long totals cell stays on one ellipsised line', () => {
		render(
			<Harness
				sorting={[]}
				onSortingChange={vi.fn()}
				totals={
					new Map([
						['name', '15 membres'],
						['members', '12 actifs · 3 suspendus'],
					])
				}
			/>,
		);

		const summary = screen.getByRole('table', { name: 'list-summary' });
		const cell = within(summary).getByTitle('12 actifs · 3 suspendus');
		expect(cell.className).toContain('whitespace-nowrap');
		expect(cell.className).toContain('overflow-hidden');
		expect(cell.className).toContain('text-ellipsis');
		expect(cell.className).not.toContain('break-words');
		expect(cell.closest('tr')?.className).not.toContain('whitespace-normal');
	});

	// Lot 4a: the role users inset passes an empty totals map. Rendering the
	// foot anyway left an empty 40px ruled bar under the last row.
	test('an empty totals map renders no pinned foot', () => {
		render(
			<Harness sorting={[]} onSortingChange={vi.fn()} totals={new Map()} />,
		);

		expect(document.querySelector('[data-pinned-foot]')).toBeNull();
		expect(screen.queryByRole('table', { name: 'list-summary' })).toBeNull();
		expect(screen.getByText('Acme')).toBeTruthy();

		// The rows still fill the box: the spacer row stays in the table.
		const head = document.querySelector('[data-pinned-head]');
		expect(head?.parentElement?.querySelector('tr[data-spacer]')).toBeTruthy();
	});
});
