import { IconUsers } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { DataTable, SELECTION_LOCKED_TITLE_KEY } from './data-table';
import { DataTableStates } from './data-table-states';
import type { UseRowSelectionResult } from './use-row-selection';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'list-unavailable-title': 'List unavailable',
				'list-error-default-description':
					'There was a problem loading this list.',
				retry: 'Retry',
				'list-empty-title': 'Nothing here — yet',
				'list-empty-default-description':
					'No records yet. Create one to get started.',
				'list-no-match-title': 'No matches for that search',
				'list-no-match-default-description': 'No results match your search.',
				'select-row-named': 'Select {{name}}',
			};

			let text = labels[key] ?? key;
			if (!options) {
				return text;
			}

			// Interpolates like real i18next — without this, `select-row-named`
			// always resolves to the same literal string regardless of `name`,
			// so a `getRowLabel` regression (e.g. always returning `row.id`)
			// could not fail the a11y-label test below (r3-tests-F8).
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
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

/**
 * DataTable derives its responsive breakpoints from `window.matchMedia`
 * (r3-shell-F7), not from raw `window.innerWidth` + a `resize` listener —
 * `vitest.setup.ts`'s jsdom `matchMedia` polyfill is driven off
 * `window.innerWidth` and only fires `change` for a query whose `matches`
 * actually flipped, so the existing innerWidth+resize pattern below still
 * exercises it faithfully (and proves the "only re-render on an actual
 * crossing" fix for real, not via an approximation).
 */
const installViewportWidthControl = () => {
	const originalInnerWidth = window.innerWidth;

	return {
		setViewportWidth: (width: number): void => {
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: width,
			});
			fireEvent(window, new Event('resize'));
		},
		restore: (): void => {
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: originalInnerWidth,
			});
		},
	};
};

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
	queryState: {
		isPending: false,
		isError: true,
		onRetry: noop,
		hasActiveSearch: false,
	},
	sort: { id: 'name', order: 'asc' } as const,
	onSortChange: noop,
	size: 20,
	onSizeChange: noop,
	pagination: {
		pageIndex: 0,
		hasPreviousPage: false,
		hasNextPage: false,
		isPaginationPending: false,
		onNextPage: noop,
		onPreviousPage: noop,
	},
	searchDraft: '',
	onSearchDraftChange: noop,
};

// users-auth-r6-F2: a list backed by an API with no search contract must not
// render a search box that silently filters nothing — omitting BOTH
// searchDraft/onSearchDraftChange hides the control entirely; a list that
// does have real search keeps rendering it exactly as before.
describe('DataTable search box (users-auth-r6-F2)', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders the search input when searchDraft/onSearchDraftChange are provided', () => {
		render(<DataTable {...baseProps} />);

		expect(screen.getByTestId('test-table-search')).toBeTruthy();
	});

	test('omits the search input entirely when searchDraft/onSearchDraftChange are both omitted', () => {
		const {
			searchDraft: _searchDraft,
			onSearchDraftChange: _onChange,
			...propsWithoutSearch
		} = baseProps;

		render(<DataTable {...propsWithoutSearch} />);

		expect(screen.queryByTestId('test-table-search')).toBeNull();
	});
});

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
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{
					...baseProps.queryState,
					isPending: true,
					isError: false,
				}}
			/>,
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
				queryState={{
					...baseProps.queryState,
					isPending: false,
					isError: false,
					hasActiveSearch: false,
				}}
				rows={[]}
			/>,
		);
		expect(screen.getByTestId('test-table-empty')).toBeTruthy();
		unmount();

		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isPending: false,
					isError: false,
					hasActiveSearch: true,
				}}
				rows={[]}
			/>,
		);
		expect(screen.getByTestId('test-table-no-match')).toBeTruthy();
	});

	test('supports a custom empty icon, title, and extra actions alongside the description', () => {
		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isPending: false,
					isError: false,
					hasActiveSearch: false,
				}}
				rows={[]}
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
				queryState={{
					...baseProps.queryState,
					isPending: false,
					isError: false,
					hasActiveSearch: true,
				}}
				rows={[]}
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
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
				rowHeight={56}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').getAttribute('data-row-height'),
		).toBe('56');
	});

	test('supports h52 row height variant', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
				rowHeight={52}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').getAttribute('data-row-height'),
		).toBe('52');
	});

	test('maps compact density to the compact row height', () => {
		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				rows={rows}
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
				queryState={{
					...baseProps.queryState,
					isError: false,
					hasActiveSearch: false,
				}}
				rows={rows}
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
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
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
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				columns={widthColumns}
				rows={rows}
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
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				columns={widthlessColumns}
				rows={rows}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').hasAttribute('data-fixed-columns'),
		).toBe(false);
		unmount();

		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				columns={widthColumns}
				rows={rows}
			/>,
		);
		expect(
			screen.getByTestId('test-table-rows').hasAttribute('data-fixed-columns'),
		).toBe(true);
	});

	describe('DataTable hideBelow column visibility', () => {
		let viewportWidthControl: ReturnType<typeof installViewportWidthControl>;

		beforeEach(() => {
			viewportWidthControl = installViewportWidthControl();
		});

		afterEach(() => {
			viewportWidthControl.restore();
		});

		const setViewportWidth = (width: number): void => {
			viewportWidthControl.setViewportWidth(width);
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
					queryState={{
						...baseProps.queryState,
						isError: false,
					}}
					columns={responsiveColumns}
					rows={rows}
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

		test('does not re-render on an intermediate resize tick that crosses no breakpoint (r3-shell-F7)', () => {
			let renderCount = 0;
			const countingColumns: ColumnDef<TestRow>[] = [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Name',
					cell: ({ getValue }) => {
						renderCount += 1;
						return String(getValue());
					},
				},
				{
					id: 'bio',
					accessorKey: 'name',
					header: 'Bio',
					meta: { width: '150px', hideBelow: 768 },
					cell: ({ getValue }) => String(getValue()),
				},
			];

			setViewportWidth(1024);
			render(
				<DataTable
					{...baseProps}
					queryState={{
						...baseProps.queryState,
						isError: false,
					}}
					columns={countingColumns}
					rows={rows}
				/>,
			);

			const renderCountAfterMount = renderCount;

			// Neither tick crosses the 768px breakpoint — a raw
			// window.innerWidth+resize subscription (the pre-fix
			// implementation) would still snapshot a new number on every one
			// of these and re-render the whole table; the matchMedia-based
			// subscription must not.
			setViewportWidth(900);
			setViewportWidth(1200);
			setViewportWidth(1024);

			expect(renderCount).toBe(renderCountAfterMount);
		});
	});

	describe('DataTable pinWidthAbove column width', () => {
		let viewportWidthControl: ReturnType<typeof installViewportWidthControl>;

		beforeEach(() => {
			viewportWidthControl = installViewportWidthControl();
		});

		afterEach(() => {
			viewportWidthControl.restore();
		});

		const setViewportWidth = (width: number): void => {
			viewportWidthControl.setViewportWidth(width);
		};

		const pinnedColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				meta: { width: '200px', pinWidthAbove: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'status',
				accessorKey: 'name',
				header: 'Status',
				meta: { width: '122px' },
				cell: ({ getValue }) => String(getValue()),
			},
		];

		test('keeps a pinWidthAbove column at its fixed width at/above the breakpoint, and lets it flex below it', () => {
			setViewportWidth(1024);

			render(
				<DataTable
					{...baseProps}
					queryState={{
						...baseProps.queryState,
						isError: false,
					}}
					columns={pinnedColumns}
					rows={rows}
				/>,
			);

			const desktopCol = screen
				.getByTestId('test-table-rows')
				.querySelectorAll('colgroup col')[0] as HTMLElement;
			expect(desktopCol.style.width).toBe('200px');

			setViewportWidth(390);

			const mobileCol = screen
				.getByTestId('test-table-rows')
				.querySelectorAll('colgroup col')[0] as HTMLElement;
			expect(mobileCol.style.width).toBe('');
		});
	});

	describe('DataTable P3 grid contract (ratified desktop track widths)', () => {
		let viewportWidthControl: ReturnType<typeof installViewportWidthControl>;

		beforeEach(() => {
			viewportWidthControl = installViewportWidthControl();
		});

		afterEach(() => {
			viewportWidthControl.restore();
		});

		const setViewportWidth = (width: number): void => {
			viewportWidthControl.setViewportWidth(width);
		};

		// SPEC 2g grid: 40 / 240 / 1fr / 104 / 140 / 120 / 40 — mirrors the
		// staff profiles P3 column shape (selection/name/description/members/
		// permissions/updated/actions), which has regressed the desktop track
		// widths twice on this branch (f681b0bd, then a dropped-column variant
		// of the same defect). Pinning the computed <col> widths here catches
		// that regression class in vitest instead of only in docker e2e.
		const p3GridColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Profile',
				meta: { width: '240px', pinWidthAbove: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'description',
				accessorKey: 'name',
				header: 'Description',
				meta: { hideBelow: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'members',
				accessorKey: 'name',
				header: 'Members',
				meta: { width: '104px', hideBelow: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'permissions',
				accessorKey: 'name',
				header: 'Permissions',
				meta: { width: '140px', hideBelow: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'updated',
				accessorKey: 'name',
				header: 'Updated',
				meta: { width: '120px', hideBelow: 768 },
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'actions',
				accessorKey: 'name',
				header: 'Actions',
				meta: { width: '40px', align: 'center' },
				cell: ({ getValue }) => String(getValue()),
			},
		];

		test('computes the exact 40/240/1fr/104/140/120/40 track widths at desktop viewport', () => {
			setViewportWidth(1440);

			render(
				<DataTable
					{...baseProps}
					queryState={{
						...baseProps.queryState,
						isError: false,
					}}
					columns={p3GridColumns}
					rows={rows}
					selection={createSelection({})}
				/>,
			);

			const cols = screen
				.getByTestId('test-table-rows')
				.querySelectorAll('colgroup col');

			expect(
				Array.from(cols).map((col) => (col as HTMLElement).style.width),
			).toEqual([
				'40px', // selection
				'240px', // name
				'', // description (fluid)
				'104px', // members
				'140px', // permissions
				'120px', // updated
				'40px', // actions
			]);
		});
	});

	test('locks controls when row selection mode is active', () => {
		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
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
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				columns={alignedColumns}
				rows={rows}
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
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
			/>,
		);

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
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				rows={rows}
				selection={createSelection({ 'row-1': true })}
			/>,
		);

		expect(screen.getByTestId('test-table-search').getAttribute('title')).toBe(
			SELECTION_LOCKED_TITLE_KEY,
		);
	});

	// shell F4: the search input, page label, and pager buttons used to be
	// hardcoded English — now routed through t() like the rest of the chrome.
	test('routes the search aria-label, page label, and pager button labels through t()', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
			/>,
		);

		expect(
			screen.getByTestId('test-table-search').getAttribute('aria-label'),
		).toBe('search');
		expect(screen.getByTestId('test-table-page-label').textContent).toBe(
			'page-n',
		);
		expect(
			screen.getByTestId('test-table-prev-page').getAttribute('aria-label'),
		).toBe('previous-page');
		expect(
			screen.getByTestId('test-table-next-page').getAttribute('aria-label'),
		).toBe('next-page');
	});

	test('falls back to the t()-driven placeholder when no explicit searchPlaceholder is passed', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
			/>,
		);

		expect(
			(screen.getByTestId('test-table-search') as HTMLInputElement).placeholder,
		).toBe('search');
	});
});

describe('DataTable a11y', () => {
	test('row selection checkbox and header controls route their labels through t()', () => {
		render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				rows={rows}
				selection={createSelection({})}
			/>,
		);

		expect(screen.getByTestId('test-table-rows').getAttribute('role')).toBe(
			'grid',
		);
		expect(screen.getByLabelText('row-selection-column')).toBeTruthy();
		expect(screen.getByLabelText('select-all-rows')).toBeTruthy();
	});

	test('defaults the row checkbox label to the row id, and honors a custom getRowLabel', () => {
		const { rerender } = render(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				rows={rows}
				selection={createSelection({})}
			/>,
		);

		// The mock now interpolates {{name}}, so this genuinely fails if
		// getRowLabel stops being invoked (e.g. regresses to a hardcoded
		// string) instead of always passing regardless of the label content.
		expect(screen.getByLabelText('Select row-1')).toBeTruthy();
		expect(screen.getByLabelText('Select row-2')).toBeTruthy();

		rerender(
			<DataTable
				{...baseProps}
				queryState={{
					...baseProps.queryState,
					isError: false,
				}}
				rows={rows}
				selection={createSelection({})}
				getRowLabel={(row) => row.name}
			/>,
		);

		expect(screen.getByLabelText('Select Alice')).toBeTruthy();
		expect(screen.getByLabelText('Select Bob')).toBeTruthy();
	});

	test('only one body cell is a tab stop at a time (roving tabindex), not every cell', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
			/>,
		);

		const cells = screen
			.getByTestId('test-table-rows')
			.querySelectorAll('[data-slot="table-cell"]');
		expect(cells.length).toBeGreaterThan(1);

		const tabbableCells = [...cells].filter(
			(cell) => cell.getAttribute('tabindex') === '0',
		);
		expect(tabbableCells).toHaveLength(1);
		expect(tabbableCells[0]?.getAttribute('data-cell-index')).toBe('0');

		const nonTabbableCells = [...cells].filter(
			(cell) => cell.getAttribute('tabindex') === '-1',
		);
		expect(nonTabbableCells.length).toBe(cells.length - 1);
	});

	test('the roving tab stop follows focus onto whichever cell was focused', () => {
		render(
			<DataTable
				{...baseProps}
				rows={rows}
				queryState={{ ...baseProps.queryState, isError: false }}
			/>,
		);

		const cells = [
			...screen
				.getByTestId('test-table-rows')
				.querySelectorAll('[data-slot="table-cell"]'),
		];
		const secondRowCell = cells.find(
			(cell) => cell.closest('tr')?.getAttribute('data-row-index') === '1',
		) as HTMLElement;

		fireEvent.focus(secondRowCell);

		expect(secondRowCell.getAttribute('tabindex')).toBe('0');
		const firstRowCell = cells.find(
			(cell) => cell.closest('tr')?.getAttribute('data-row-index') === '0',
		) as HTMLElement;
		expect(firstRowCell.getAttribute('tabindex')).toBe('-1');
	});

	describe('DataTable grid keyboard navigation (r3-shell-F8)', () => {
		const multiColumnColumns: ColumnDef<TestRow>[] = [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Name',
				cell: ({ getValue }) => String(getValue()),
			},
			{
				id: 'id',
				accessorKey: 'id',
				header: 'ID',
				cell: ({ getValue }) => String(getValue()),
			},
		];

		const cellAt = (rowIndex: number, cellIndex: number): HTMLElement =>
			screen
				.getByTestId('test-table-rows')
				.querySelector(
					`tr[data-row-index="${rowIndex}"] td[data-cell-index="${cellIndex}"]`,
				) as HTMLElement;

		// hasSelection={true} via `selection` gives cell-index 0 to the row
		// checkbox, so a 2-column table has 3 focusable cells (0/1/2) per row —
		// enough range to prove ArrowLeft/ArrowRight/Home/End move within it.
		const renderGrid = () =>
			render(
				<DataTable
					{...baseProps}
					queryState={{
						...baseProps.queryState,
						isError: false,
					}}
					columns={multiColumnColumns}
					rows={rows}
					selection={createSelection({})}
				/>,
			);

		test('ArrowRight moves focus to the next cell in the row', () => {
			renderGrid();
			const start = cellAt(0, 0);
			start.focus();

			fireEvent.keyDown(start, { key: 'ArrowRight' });

			expect(document.activeElement).toBe(cellAt(0, 1));
		});

		test('ArrowRight at the last cell of a row does not move focus', () => {
			renderGrid();
			const lastCell = cellAt(0, 2);
			lastCell.focus();

			fireEvent.keyDown(lastCell, { key: 'ArrowRight' });

			expect(document.activeElement).toBe(lastCell);
		});

		test('ArrowLeft moves focus to the previous cell in the row', () => {
			renderGrid();
			const middleCell = cellAt(0, 1);
			middleCell.focus();

			fireEvent.keyDown(middleCell, { key: 'ArrowLeft' });

			expect(document.activeElement).toBe(cellAt(0, 0));
		});

		test('ArrowLeft at the first cell of a row does not move focus', () => {
			renderGrid();
			const firstCell = cellAt(0, 0);
			firstCell.focus();

			fireEvent.keyDown(firstCell, { key: 'ArrowLeft' });

			expect(document.activeElement).toBe(firstCell);
		});

		test('Home moves focus to the first cell of the row', () => {
			renderGrid();
			const middleCell = cellAt(1, 1);
			middleCell.focus();

			fireEvent.keyDown(middleCell, { key: 'Home' });

			expect(document.activeElement).toBe(cellAt(1, 0));
		});

		test('End moves focus to the last cell of the row', () => {
			renderGrid();
			const middleCell = cellAt(1, 1);
			middleCell.focus();

			fireEvent.keyDown(middleCell, { key: 'End' });

			expect(document.activeElement).toBe(cellAt(1, 2));
		});

		test('ArrowDown/ArrowUp still move focus vertically alongside the new horizontal keys', () => {
			renderGrid();
			const topCell = cellAt(0, 1);
			topCell.focus();

			fireEvent.keyDown(topCell, { key: 'ArrowDown' });
			expect(document.activeElement).toBe(cellAt(1, 1));

			fireEvent.keyDown(cellAt(1, 1), { key: 'ArrowUp' });
			expect(document.activeElement).toBe(cellAt(0, 1));
		});
	});
});

describe('DataTableStates (extracted)', () => {
	test('renders the skeleton card for the loading state', () => {
		render(
			<DataTableStates
				testId="states"
				bodyState="loading"
				resolvedRowHeight={48}
				onRetry={noop}
			/>,
		);

		expect(screen.getByTestId('states-loading')).toBeTruthy();
		expect(screen.queryByTestId('states-error')).toBeNull();
	});

	test('renders the error surface with a retry action', () => {
		const onRetry = vi.fn();
		render(
			<DataTableStates
				testId="states"
				bodyState="error"
				resolvedRowHeight={48}
				onRetry={onRetry}
			/>,
		);

		expect(screen.getByText('List unavailable')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test('renders the empty surface with custom actions', () => {
		render(
			<DataTableStates
				testId="states"
				bodyState="empty"
				resolvedRowHeight={48}
				onRetry={noop}
				emptyActions={<button type="button">Invite</button>}
			/>,
		);

		expect(screen.getByText('Nothing here — yet')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy();
	});

	test('renders the no-match surface for a search with no results', () => {
		render(
			<DataTableStates
				testId="states"
				bodyState="no-match"
				resolvedRowHeight={48}
				onRetry={noop}
				noMatchContent="Nothing matched acme."
			/>,
		);

		expect(screen.getByText('No matches for that search')).toBeTruthy();
		expect(screen.getByText('Nothing matched acme.')).toBeTruthy();
	});

	test('renders nothing for the rows state', () => {
		const { container } = render(
			<DataTableStates
				testId="states"
				bodyState="rows"
				resolvedRowHeight={48}
				onRetry={noop}
			/>,
		);

		expect(container.innerHTML).toBe('');
	});
});
