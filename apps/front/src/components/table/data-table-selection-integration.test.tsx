import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/**
 * Integration test: verifies that row selection state passed through the real
 * useReactTable (legacy) hook produces a visibly rendered checkbox state —
 * checked, unchecked, and indeterminate header — NOT a mock.
 *
 * Breaker: if `DataTableGrid` incorrectly inverts the `allRowsSelected` /
 * `hasPartialSelection` derivation (e.g. swapping `allRowsSelected` for
 * `hasPartialSelection` on the header checkbox), the header checkbox shows
 * the wrong state — this test turns RED.
 *
 * @vitest-environment jsdom
 */
import type { ColumnDef } from './column-type';
import { DataTable } from './data-table';
import type { SortState } from './sort-descriptor';
import type {
	RowSelectionMap,
	UseRowSelectionResult,
} from './use-row-selection';

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
				search: 'Search',
				'rows-per-page': 'Rows per page',
				'page-n': 'Page {{page}}',
				'previous-page': 'Previous page',
				'next-page': 'Next page',
				'range-no-total': '{{count}}',
				'range-of-total': '{{start}}–{{end}} of {{count}}',
				'range-of-counted': '{{start}}–{{end}}',
				'row-selection-column': 'Row selection',
				'select-all-rows': 'Select all rows',
			};

			let text = labels[key] ?? key;
			if (!options) {
				return text;
			}
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
		i18n: { language: 'en' },
	}),
}));

type TestRow = { id: string; name: string };

const selectionColumns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ getValue }) => String(getValue()),
	},
];

const selectionRows: TestRow[] = [
	{ id: 'row-1', name: 'Alice' },
	{ id: 'row-2', name: 'Bob' },
	{ id: 'row-3', name: 'Charlie' },
];

const createSelection = (
	rowSelection: RowSelectionMap,
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
	clearSelection: vi.fn(),
});

const renderDataTableWithSelection = (selectionMap: RowSelectionMap) => {
	const selection = createSelection(selectionMap);
	return render(
		<DataTable
			testId="selection-integration"
			ariaLabel="Selection integration table"
			columns={selectionColumns}
			rows={selectionRows}
			queryState={{
				isPending: false,
				isError: false,
				onRetry: () => undefined,
				hasActiveSearch: false,
			}}
			pagination={{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: false,
				isPaginationPending: false,
				onNextPage: () => undefined,
				onPreviousPage: () => undefined,
			}}
			sort={{ id: 'name', order: 'asc' } as SortState}
			onSortChange={() => undefined}
			size={20}
			onSizeChange={() => undefined}
			searchDraft=""
			onSearchDraftChange={() => undefined}
			selection={selection}
		/>,
	);
};

/** Returns the header checkbox element, or null if none is rendered. */
const getHeaderCheckbox = (): HTMLElement | null =>
	screen
		.getByTestId('selection-integration-rows')
		.querySelector('thead [data-slot="checkbox"]');

/** Returns all row checkbox elements in the body. */
const getRowCheckboxes = (): HTMLElement[] =>
	Array.from(
		screen
			.getByTestId('selection-integration-rows')
			.querySelectorAll('tbody [data-slot="checkbox"]'),
	);

describe('DataTable row selection integration (issue #1730)', () => {
	afterEach(cleanup);

	// Breaker: if row checkboxes render as checked when the selection map is
	// empty (inverted logic), `data-checked` would be present — this test goes RED.
	test('renders all row checkboxes unchecked when nothing is selected', () => {
		renderDataTableWithSelection({});

		const checkboxes = getRowCheckboxes();
		expect(checkboxes).toHaveLength(selectionRows.length);

		// Every row checkbox should be unchecked.
		for (const checkbox of checkboxes) {
			expect(checkbox.hasAttribute('data-checked')).toBe(false);
			expect(checkbox.getAttribute('data-indeterminate')).toBeNull();
		}

		// Header checkbox should also be unchecked (no selection).
		const headerCheckbox = getHeaderCheckbox();
		expect(headerCheckbox).not.toBeNull();
		expect(headerCheckbox?.hasAttribute('data-checked')).toBe(false);
		expect(headerCheckbox?.getAttribute('data-indeterminate')).toBeNull();
	});

	// Breaker: if row checkbox checked state is inverted (checked when the row
	// is NOT in the selection map), row-1 would be unchecked and row-2 checked — RED.
	test('renders a row checkbox as checked when that row is in the selection map', () => {
		renderDataTableWithSelection({ 'row-1': true, 'row-2': false });

		const checkboxes = getRowCheckboxes();
		expect(checkboxes).toHaveLength(selectionRows.length);

		// row-1 checkbox should be checked.
		expect(checkboxes[0]?.hasAttribute('data-checked')).toBe(true);
		// row-2 checkbox should be unchecked.
		expect(checkboxes[1]?.hasAttribute('data-checked')).toBe(false);
		// row-3 checkbox should be unchecked.
		expect(checkboxes[2]?.hasAttribute('data-checked')).toBe(false);
	});

	// Breaker: if `allRowsSelected` logic always returns false, the header
	// checkbox would not be `data-checked` — this test goes RED.
	test('renders the header checkbox as checked when all visible rows are selected', () => {
		renderDataTableWithSelection({
			'row-1': true,
			'row-2': true,
			'row-3': true,
		});

		const headerCheckbox = getHeaderCheckbox();
		expect(headerCheckbox).not.toBeNull();
		// All selected -> header is checked, not indeterminate.
		expect(headerCheckbox?.hasAttribute('data-checked')).toBe(true);
		expect(headerCheckbox?.getAttribute('data-indeterminate')).toBeNull();
	});

	// Breaker: if `hasPartialSelection` logic is inverted (only returns true when
	// ALL rows are selected), the header would be `data-checked` not indeterminate — RED.
	test('renders the header checkbox as indeterminate when some but not all rows are selected', () => {
		renderDataTableWithSelection({
			'row-1': true,
			'row-2': false,
			'row-3': false,
		});

		const headerCheckbox = getHeaderCheckbox();
		expect(headerCheckbox).not.toBeNull();
		// Partial selection -> header is indeterminate, not checked.
		expect(headerCheckbox?.hasAttribute('data-checked')).toBe(false);
		expect(headerCheckbox?.getAttribute('data-indeterminate')).toBe('');
	});

	// Breaker: if the header checkbox is always indeterminate when nothing is
	// selected (ignoring the `allRowsSelected` false + `hasPartialSelection` false
	// case), it would carry `data-indeterminate` — this test goes RED.
	test('renders the header checkbox as unchecked when no rows are selected (not indeterminate)', () => {
		renderDataTableWithSelection({
			'row-1': false,
			'row-2': false,
			'row-3': false,
		});

		const headerCheckbox = getHeaderCheckbox();
		expect(headerCheckbox).not.toBeNull();
		// No selection at all -> header is unchecked and not indeterminate.
		expect(headerCheckbox?.hasAttribute('data-checked')).toBe(false);
		expect(headerCheckbox?.getAttribute('data-indeterminate')).toBeNull();
	});
});
