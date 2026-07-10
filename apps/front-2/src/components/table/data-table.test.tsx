import type { ColumnDef } from '@tanstack/react-table';
/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DataTable } from './data-table';
import type { UseRowSelectionResult } from './use-row-selection';

afterEach(cleanup);

const noop = () => undefined;

type TestRow = { id: string; name: string };
const columns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ getValue }) => String(getValue()),
	},
];

const rows: TestRow[] = [
	{ id: 'row-1', name: 'Alice' },
	{ id: 'row-2', name: 'Bob' },
];

const createSelection = (
	rowSelection: Record<string, boolean>,
): UseRowSelectionResult => ({
	rowSelection,
	selectedKeys: new Set(
		Object.entries(rowSelection)
			.filter(([, checked]) => checked)
			.map(([id]) => id),
	),
	selectedCount: Object.values(rowSelection).filter(Boolean).length,
	isSelectionMode: Object.values(rowSelection).some(Boolean),
	onSelectionChange: vi.fn(),
	clearSelection: noop,
});

const baseProps = {
	testId: 'test-table',
	ariaLabel: 'Test table',
	columns,
	rows: [],
	isPending: false,
	isError: true,
	onRetry: noop,
	hasActiveSearch: false,
	sort: { id: 'name', order: 'asc' } as const,
	onSortChange: noop,
	size: 20,
	onSizeChange: noop,
	pageIndex: 0,
	hasPreviousPage: false,
	hasNextPage: false,
	isPaginationPending: false,
	onNextPage: noop,
	onPreviousPage: noop,
	searchDraft: '',
	onSearchDraftChange: noop,
};

describe('DataTable errorContent', () => {
	test('renders default fallback message when no errorContent is provided', () => {
		render(<DataTable {...baseProps} />);
		expect(
			screen.getByText('There was a problem loading this list.'),
		).toBeTruthy();
	});

	test('uses string errorContent as the error description', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent="Unable to load tenants right now."
			/>,
		);
		expect(screen.getByText('Unable to load tenants right now.')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
	});

	test('renders ReactNode errorContent alongside the Retry button', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent={
					<p data-testid="custom-error">
						You do not have permission to view this list.
					</p>
				}
			/>,
		);
		expect(
			screen.getByText('You do not have permission to view this list.'),
		).toBeTruthy();
		expect(screen.getByTestId('custom-error')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
	});

	test('default description is hidden when ReactNode errorContent is provided', () => {
		render(
			<DataTable
				{...baseProps}
				errorContent={<span>Custom error node</span>}
			/>,
		);
		expect(screen.getByText('Custom error node')).toBeTruthy();
		expect(
			screen.queryByText('There was a problem loading this list.'),
		).toBeNull();
		expect(screen.getByText('Retry')).toBeTruthy();
	});
});

describe('DataTable state rendering', () => {
	test('renders loading placeholders in pending state', () => {
		render(
			<DataTable {...baseProps} rows={rows} isPending={true} isError={false} />,
		);
		expect(screen.getByTestId('test-table-loading')).toBeTruthy();
		expect(screen.getByTestId('test-table-search').className).toContain(
			'publy-data-table-search-input',
		);
		expect(screen.getAllByTestId('test-table-loading').length).toBe(1);
	});

	test('renders empty and no-match states with dedicated test ids', () => {
		const { unmount } = render(
			<DataTable
				{...baseProps}
				isPending={false}
				isError={false}
				rows={[]}
				hasActiveSearch={false}
			/>,
		);
		expect(screen.getByTestId('test-table-empty')).toBeTruthy();
		unmount();

		render(
			<DataTable
				{...baseProps}
				isPending={false}
				isError={false}
				rows={[]}
				hasActiveSearch={true}
			/>,
		);
		expect(screen.getByTestId('test-table-no-match')).toBeTruthy();
	});

	test('supports explicit row height variants', () => {
		render(
			<DataTable {...baseProps} rows={rows} isError={false} rowHeight={56} />,
		);
		expect(
			screen.getByTestId('test-table-rows').getAttribute('data-row-height'),
		).toBe('56');
	});

	test('supports h52 row height variant', () => {
		render(
			<DataTable {...baseProps} rows={rows} isError={false} rowHeight={52} />,
		);
		expect(
			screen.getByTestId('test-table-rows').getAttribute('data-row-height'),
		).toBe('52');
	});

	test('maps compact density to the compact row height', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				isError={false}
				density="compact"
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').getAttribute('data-row-height'),
		).toBe('48');
	});

	test('renders rows in the table body state', () => {
		render(
			<DataTable
				{...baseProps}
				isError={false}
				rows={rows}
				hasActiveSearch={false}
			/>,
		);

		expect(screen.getByTestId('test-table-rows')).toBeTruthy();
		expect(
			screen
				.getByTestId('test-table-rows')
				.getAttribute('class')
				?.includes('publy-data-table'),
		).toBe(true);
		expect(screen.getByText('Alice')).toBeTruthy();
		expect(screen.getByText('Bob')).toBeTruthy();
	});

	test('requests sort changes when clicking a sortable header', () => {
		const onSortChange = vi.fn();
		render(
			<DataTable
				{...baseProps}
				isError={false}
				rows={rows}
				onSortChange={onSortChange}
				sort={{ id: 'name', order: 'asc' }}
			/>,
		);

		fireEvent.click(screen.getByRole('columnheader', { name: 'Name' }));
		expect(onSortChange).toHaveBeenCalledWith({
			id: 'name',
			order: 'desc',
		});
	});

	test('renders a colgroup with a fixed width per column and a fluid column for width-less meta', () => {
		const widthColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				meta: { width: '200px' },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'bio',
				accessorKey: 'name',
				header: 'Bio',
				cell: ({ getValue }) => String(getValue()),
			},
		];

		render(
			<DataTable
				{...baseProps}
				columns={widthColumns}
				rows={rows}
				isError={false}
				selection={createSelection({})}
			/>,
		);

		const cols = screen
			.getByTestId('test-table-rows')
			.querySelectorAll('colgroup col');

		expect(cols).toHaveLength(3);
		expect((cols[0] as HTMLElement).style.width).toBe('40px');
		expect((cols[1] as HTMLElement).style.width).toBe('200px');
		expect((cols[2] as HTMLElement).style.width).toBe('');
	});

	test('locks controls when row selection mode is active', () => {
		render(
			<DataTable
				{...baseProps}
				isError={false}
				rows={rows}
				onSortChange={vi.fn()}
				selection={createSelection({ 'row-1': true })}
			/>,
		);

		expect(
			(screen.getByTestId('test-table-search') as HTMLInputElement).disabled,
		).toBe(true);
		expect(
			(screen.getByTestId('test-table-prev-page') as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByTestId('test-table-next-page') as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
	});
});
