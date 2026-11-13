/**
 * @vitest-environment jsdom
 *
 * #2268: a row-action cell whose gate resolves AFTER the first paint (the
 * staff permissions query) must show the resolved state and keep its menu
 * usable. The actions renderer is a fresh closure on every page render, so
 * the table must not treat it as a component type (a remount per render).
 */
import { IconBuilding } from '@tabler/icons-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import type { QueryDisplayQuery } from '~/components/query-display';
import { DataTableRowActions } from '~/components/table/row-actions';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';

import { ListPage } from './list-page';
import type { ListColumn } from './list-types';

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

type Row = { id: string; name: string };

const columns: ListColumn<Row>[] = [
	{
		id: 'name',
		header: 'Name',
		icon: IconBuilding,
		width: 240,
		value: (row) => row.name,
		cell: (row) => <span>{row.name}</span>,
	},
];

const query: QueryDisplayQuery = {
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	error: null,
	data: undefined,
	refetch: vi.fn(),
};

const Page = ({ pending }: { pending: boolean }) => (
	<>
		<div id="app-shell-page-panel" />
		<ListPage<Row>
			testId="list"
			ariaLabel="Rows"
			title="Rows"
			searchPlaceholder="Search"
			rows={[{ id: 'a', name: 'Acme' }]}
			columns={columns}
			defaultColumns={['name']}
			lockedColumn="name"
			sorting={[]}
			onSortingChange={vi.fn()}
			q=""
			onSearch={vi.fn()}
			filters={[]}
			filtersValue={{}}
			onFiltersChange={vi.fn()}
			totals={() => new Map()}
			onOpen={vi.fn()}
			openLabel={(row) => `Open ${row.name}`}
			mobileCard={(row) => ({ code: row.id, title: row.name })}
			query={query}
			renderActions={(row) => (
				<DataTableRowActions ariaLabel={`actions-${row.id}`}>
					<DropdownMenuItem
						data-testid="requeue"
						disabled={pending}
						title={pending ? 'Checking your permissions…' : undefined}
					>
						Requeue
					</DropdownMenuItem>
				</DataTableRowActions>
			)}
		/>
	</>
);

describe('ListPage row actions (#2268)', () => {
	test('a resolved gate enables the item and the menu opens', async () => {
		const view = render(<Page pending />);
		view.rerender(<Page pending={false} />);

		fireEvent.click(screen.getAllByRole('button', { name: 'actions-a' })[0]!);
		const item = await screen.findByTestId('requeue');
		expect(item.getAttribute('aria-disabled')).not.toBe('true');
		expect(item.getAttribute('title')).toBeNull();
	});

	test('a re-render with the menu open keeps it open', async () => {
		const view = render(<Page pending />);
		fireEvent.click(screen.getAllByRole('button', { name: 'actions-a' })[0]!);
		await screen.findByTestId('requeue');

		view.rerender(<Page pending={false} />);

		const item = await screen.findByTestId('requeue');
		expect(item.getAttribute('aria-disabled')).not.toBe('true');
	});
});
