import { IconUsers } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DataTable, SELECTION_LOCKED_TITLE_KEY } from './data-table';
import type { UseRowSelectionResult } from './use-row-selection';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'list-unavailable-title': 'List unavailable',
				'list-error-default-description':
					'There was a problem loading this list.',
				retry: 'Retry',
				'list-empty-title': 'Nothing here — yet',
				'list-empty-default-description':
					'No records yet. Create one to get started.',
				'list-no-match-title': 'No matches for that search',
				'list-no-match-default-description': 'No results match your search.',
			};

			return labels[key] ?? key;
		},
		i18n: { language: 'en' },
	}),
}));

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

	test('supports a custom empty icon, title, and extra actions alongside the description', () => {
		render(
			<DataTable
				{...baseProps}
				isPending={false}
				isError={false}
				rows={[]}
				hasActiveSearch={false}
				emptyIcon={IconUsers}
				emptyTitle="No members yet"
				emptyContent="Invite people to give them access."
				emptyActions={<button type="button">Invite people</button>}
			/>,
		);

		expect(screen.getByText('No members yet')).toBeTruthy();
		expect(screen.getByText('Invite people to give them access.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invite people' })).toBeTruthy();
		expect(
			screen
				.getByTestId('test-table-empty')
				.querySelector('svg.tabler-icon-users'),
		).toBeTruthy();
	});

	test('supports a custom no-match icon and title', () => {
		render(
			<DataTable
				{...baseProps}
				isPending={false}
				isError={false}
				rows={[]}
				hasActiveSearch={true}
				noMatchIcon={IconUsers}
				noMatchTitle="No members match your search"
				noMatchContent="Try a different filter."
			/>,
		);

		expect(screen.getByText('No members match your search')).toBeTruthy();
		expect(screen.getByText('Try a different filter.')).toBeTruthy();
		expect(
			screen
				.getByTestId('test-table-no-match')
				.querySelector('svg.tabler-icon-users'),
		).toBeTruthy();
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

	test('renders data-fixed-columns only when at least one column declares a width meta', () => {
		const widthlessColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				cell: ({ getValue }) => String(getValue()),
			},
		];
		const widthColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				meta: { width: '200px' },
				cell: ({ getValue }) => String(getValue()),
			},
		];

		const { unmount } = render(
			<DataTable
				{...baseProps}
				columns={widthlessColumns}
				rows={rows}
				isError={false}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').hasAttribute('data-fixed-columns'),
		).toBe(false);
		unmount();

		render(
			<DataTable
				{...baseProps}
				columns={widthColumns}
				rows={rows}
				isError={false}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').hasAttribute('data-fixed-columns'),
		).toBe(true);
	});

	describe('DataTable hideBelow column visibility', () => {
		const originalInnerWidth = window.innerWidth;

		afterEach(() => {
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: originalInnerWidth,
			});
		});

		const setViewportWidth = (width: number): void => {
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: width,
			});
			fireEvent(window, new Event('resize'));
		};

		const responsiveColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'bio',
				accessorKey: 'name',
				header: 'Bio',
				meta: { width: '150px', hideBelow: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
		];

		test('removes a hideBelow column (header, cells, and colgroup col) below its breakpoint, and restores it above', () => {
			setViewportWidth(390);

			render(
				<DataTable
					{...baseProps}
					columns={responsiveColumns}
					rows={rows}
					isError={false}
				/>,
			);

			expect(screen.queryByRole('columnheader', { name: 'Bio' })).toBeNull();
			expect(
				screen.getByTestId('test-table-rows').querySelectorAll('colgroup col'),
			).toHaveLength(1);
			expect(
				screen
					.getByTestId('test-table-rows')
					.hasAttribute('data-fixed-columns'),
			).toBe(false);

			setViewportWidth(1024);

			expect(screen.getByRole('columnheader', { name: 'Bio' })).toBeTruthy();
			expect(
				screen.getByTestId('test-table-rows').querySelectorAll('colgroup col'),
			).toHaveLength(2);
			expect(
				screen
					.getByTestId('test-table-rows')
					.hasAttribute('data-fixed-columns'),
			).toBe(true);
		});
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

	test('renders meta.align:center as a data-align attribute on the header and body cells', () => {
		const alignedColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'actions',
				header: () => <span>Actions</span>,
				meta: { width: '40px', align: 'center' },
				cell: () => <button type="button">…</button>,
			},
		];

		render(
			<DataTable
				{...baseProps}
				columns={alignedColumns}
				rows={rows}
				isError={false}
			/>,
		);

		expect(
			screen
				.getByRole('columnheader', { name: 'Actions' })
				.getAttribute('data-align'),
		).toBe('center');
		expect(
			screen
				.getByRole('columnheader', { name: 'Name' })
				.getAttribute('data-align'),
		).toBeNull();

		const actionCells = screen
			.getByTestId('test-table-rows')
			.querySelectorAll('[data-slot="table-cell"][data-align="center"]');
		expect(actionCells).toHaveLength(rows.length);
	});
});

describe('DataTable i18n', () => {
	test('routes the rows-per-page label and aria-label through t()', () => {
		render(<DataTable {...baseProps} rows={rows} isError={false} />);

		expect(screen.getByText('rows-per-page')).toBeTruthy();
		expect(
			screen
				.getByTestId('test-table-page-size-trigger')
				.getAttribute('aria-label'),
		).toBe('rows-per-page');
	});

	test('locks the search input with the shared, keyed title while a selection is active', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				isError={false}
				selection={createSelection({ 'row-1': true })}
			/>,
		);

		expect(screen.getByTestId('test-table-search').getAttribute('title')).toBe(
			SELECTION_LOCKED_TITLE_KEY,
		);
	});
});
