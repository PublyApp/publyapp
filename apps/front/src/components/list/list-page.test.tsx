/**
 * @vitest-environment jsdom
 */
import { IconBuilding } from '@tabler/icons-react';
import {
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

import { ListPage } from './list-page';
import type { ListColumn, ListFilter } from './list-types';

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

type Row = { id: string; name: string; members: number; status: string };

const rows: Row[] = [
	{ id: 'a', name: 'Acme', members: 12, status: 'active' },
	{ id: 'b', name: 'Globex', members: 3, status: 'pending' },
	{ id: 'c', name: 'Initech', members: 0, status: 'active' },
];

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
		icon: IconBuilding,
		width: 120,
		value: (row) => row.members,
		cell: (row) => <span>{row.members}</span>,
	},
];

const filters: ListFilter<Row>[] = [
	{
		key: 'status',
		label: 'Statuts',
		icon: IconBuilding,
		panel: true,
		choices: [
			{ value: 'active', label: 'Active' },
			{ value: 'pending', label: 'En attente' },
		],
		valueOf: (row) => row.status,
	},
];

const renderPage = (
	active: Record<string, string[]> = {},
	options: { countsKnown?: boolean; inset?: boolean } = {},
) =>
	render(
		<>
			<div id="app-shell-page-panel" />
			<ListPage<Row>
				ariaLabel="Organisations"
				title="Organisations"
				searchPlaceholder="Rechercher"
				rows={rows}
				columns={columns}
				defaultColumns={['name', 'members']}
				lockedColumn="name"
				sorting={[]}
				onSortingChange={vi.fn()}
				q=""
				onSearch={vi.fn()}
				filters={filters}
				filtersValue={active}
				onFiltersChange={vi.fn()}
				countsKnown={options.countsKnown ?? true}
				inset={options.inset ? {} : undefined}
				totals={(visible) =>
					new Map([
						['name', `${visible.length} organisations`],
						['members', '15 membres'],
					])
				}
				onOpen={vi.fn()}
				openLabel={(row) => `Ouvrir ${row.name}`}
				mobileCard={(row) => ({ code: row.status, title: row.name })}
				cards={<div data-testid="stats" />}
				queryState={{ isPending: false, isError: false, onRetry: vi.fn() }}
			/>
		</>,
	);

describe('ListPage', () => {
	test('filters the rows from the active filters and shows a chip', () => {
		renderPage({ status: ['active'] });

		expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Initech').length).toBeGreaterThan(0);
		expect(screen.queryByText('Globex')).toBeNull();
		expect(screen.getAllByText('list-filter-chip').length).toBe(1);
	});

	test('the side panel counts the rows per filter value', () => {
		renderPage();
		const panel = document.getElementById('app-shell-page-panel');
		if (!panel) {
			throw new Error('panel missing');
		}
		expect(within(panel).getByText('Statuts')).toBeTruthy();
		expect(within(panel).getByText('2')).toBeTruthy();
		expect(within(panel).getByText('1')).toBeTruthy();
	});

	test('the columns picker opens on the default set', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: /list-columns/ }));
		expect(screen.getByText('list-columns-shown')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Organisation' })).toBeTruthy();
	});

	test('totals are computed from the filtered rows', () => {
		renderPage({ status: ['active'] });
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).getByText('2 organisations')).toBeTruthy();
	});

	test('the totals footer shows « — » when the collection is not fully known', () => {
		renderPage({}, { countsKnown: false });
		const summary = screen.getByRole('table', { name: 'list-summary' });
		expect(within(summary).queryByText('3 organisations')).toBeNull();
		expect(within(summary).queryByText('15 membres')).toBeNull();
		expect(within(summary).getAllByText('—')).toHaveLength(2);
	});

	test('the inset count pill shows the row count when the collection is known', () => {
		renderPage({}, { inset: true });
		const heading = screen.getByRole('heading', { name: /Organisations/ });
		expect(within(heading).getByText('3')).toBeTruthy();
	});

	test('the inset count pill shows « — » when the collection is not fully known', () => {
		renderPage({}, { countsKnown: false, inset: true });
		const heading = screen.getByRole('heading', { name: /Organisations/ });
		expect(within(heading).queryByText('3')).toBeNull();
		expect(within(heading).getByText('—')).toBeTruthy();
	});

	test('the statistics fold toggles', () => {
		renderPage();
		const toggle = screen.getByRole('button', { name: 'list-stats-collapse' });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		fireEvent.click(toggle);
		expect(
			screen
				.getByRole('button', { name: 'list-stats-expand' })
				.getAttribute('aria-expanded'),
		).toBe('false');
	});
});
