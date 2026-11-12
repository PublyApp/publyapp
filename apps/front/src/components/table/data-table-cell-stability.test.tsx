/**
 * @vitest-environment jsdom
 *
 * #2418: column `cell` / `header` renderers are fresh closures on every
 * render. The table must call them, not mount them as component types, or a
 * stateful cell control (an open row menu) is torn down by every re-render.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { DropdownMenuItem } from '~/components/ui/dropdown-menu';

import type { ColumnDef } from './column-type';
import { DataTable } from './data-table';
import { DataTableRowActions } from './row-actions';

afterEach(cleanup);

const noop = () => undefined;

type Row = { id: string; name: string };
const rows: Row[] = [{ id: 'a', name: 'Acme' }];

const Table = ({ label }: { label: string }) => {
	// Fresh closures on every render, like a route's inline column defs.
	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'name',
			header: () => <span data-testid="head">{label}</span>,
			cell: ({ row }) => (
				<DataTableRowActions ariaLabel={`actions-${row.original.id}`}>
					<DropdownMenuItem data-testid="item">{label}</DropdownMenuItem>
				</DataTableRowActions>
			),
		},
	];
	return (
		<DataTable<Row>
			testId="t"
			ariaLabel="Rows"
			columns={columns}
			rows={rows}
			query={{
				isPending: false,
				isLoading: false,
				isFetching: false,
				isError: false,
				error: null,
				data: undefined,
				refetch: vi.fn(),
			}}
			hasActiveSearch={false}
			sort={{ id: 'name', order: 'asc' }}
			onSortChange={noop}
			size={20}
			onSizeChange={noop}
			pagination={{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: false,
				isPaginationPending: false,
				onNextPage: noop,
				onPreviousPage: noop,
			}}
			searchDraft=""
			onSearchDraftChange={noop}
		/>
	);
};

describe('DataTable cell stability (#2418)', () => {
	test('an open row menu stays open across a re-render', async () => {
		const view = render(<Table label="one" />);
		fireEvent.click(screen.getAllByRole('button', { name: 'actions-a' })[0]!);
		expect((await screen.findByTestId('item')).textContent).toBe('one');

		view.rerender(<Table label="two" />);

		expect((await screen.findByTestId('item')).textContent).toBe('two');
	});

	test('the header renderer output follows the re-render', () => {
		const view = render(<Table label="one" />);
		view.rerender(<Table label="two" />);
		expect(screen.getByTestId('head').textContent).toBe('two');
	});
});
