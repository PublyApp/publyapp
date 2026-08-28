import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/**
 * Integration test: verifies that pagination state passed through the real
 * useReactTable (legacy) hook produces a visibly rendered page indicator,
 * row count, range label, and pager button states — NOT a mock.
 *
 * Breaker: if `DataTable` incorrectly renders `pageIndex + 2` instead of
 * `pageIndex + 1` in the page label, or renders `hasPreviousPage` state on
 * the Previous button, this test turns RED because the rendered footer
 * content no longer matches the expected pagination state.
 *
 * @vitest-environment jsdom
 */
import type { ColumnDef } from './column-type';
import { DataTable } from './data-table';
import type { SortState } from './sort-descriptor';

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

const paginationColumns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ getValue }) => String(getValue()),
	},
];

/** Page 0 rows — the parent passes only the current page's rows. */
const page0Rows: TestRow[] = [
	{ id: 'row-1', name: 'Alice' },
	{ id: 'row-2', name: 'Bob' },
];

/** Page 1 rows — simulated subset for the second page. */
const page1Rows: TestRow[] = [
	{ id: 'row-3', name: 'Charlie' },
	{ id: 'row-4', name: 'Diana' },
];

type PaginationProps = {
	pageIndex: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	isPaginationPending: boolean;
	totalCount?: number | null;
};

const renderDataTableWithPagination = (
	pagination: PaginationProps,
	rows: TestRow[],
) =>
	render(
		<DataTable
			testId="pagination-integration"
			ariaLabel="Pagination integration table"
			columns={paginationColumns}
			rows={rows}
			queryState={{
				isPending: false,
				isError: false,
				onRetry: () => undefined,
				hasActiveSearch: false,
			}}
			pagination={{
				pageIndex: pagination.pageIndex,
				hasPreviousPage: pagination.hasPreviousPage,
				hasNextPage: pagination.hasNextPage,
				isPaginationPending: pagination.isPaginationPending,
				onNextPage: () => undefined,
				onPreviousPage: () => undefined,
				totalCount: pagination.totalCount,
			}}
			sort={{ id: 'name', order: 'asc' } as SortState}
			onSortChange={() => undefined}
			size={2}
			onSizeChange={() => undefined}
			searchDraft=""
			onSearchDraftChange={() => undefined}
		/>,
	);

describe('DataTable pagination integration (issue #1730)', () => {
	afterEach(cleanup);

	// Breaker: if DataTable renders `pageIndex + 2` instead of `pageIndex + 1`,
	// the page label would show "Page 3" instead of "Page 2" — this test goes RED.
	test('renders the current page number in the page label', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 1,
				hasPreviousPage: true,
				hasNextPage: false,
				isPaginationPending: false,
				totalCount: 10,
			},
			page1Rows,
		);

		// pageIndex is 0-based, so page 1 renders "Page 2".
		expect(
			screen.getByTestId('pagination-integration-page-label').textContent,
		).toBe('Page 2');
	});

	// Breaker: if the range calculation ignores `size` or offsets `start` by 1,
	// the label would show "1–3 of 10" or "0–2 of 10" — this test goes RED.
	test('renders the correct range for the first page (known total)', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: true,
				isPaginationPending: false,
				totalCount: 10,
			},
			page0Rows,
		);

		// pageIndex 0, size 2, pageRowCount 2 -> start=1, end=2
		expect(
			screen.getByTestId('pagination-integration-range-label').textContent,
		).toBe('1–2 of 10');
	});

	// Breaker: if the range start omits the page offset (uses start=1 instead of
	// start=3 for page 1), the label would show "1–2 of 10" — this test goes RED.
	test('renders the correct range for the second page (known total)', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 1,
				hasPreviousPage: true,
				hasNextPage: false,
				isPaginationPending: false,
				totalCount: 10,
			},
			page1Rows,
		);

		// pageIndex 1, size 2, pageRowCount 2 -> start=3, end=4
		expect(
			screen.getByTestId('pagination-integration-range-label').textContent,
		).toBe('3–4 of 10');
	});

	// Breaker: if DataTable renders all rows instead of just the current page's
	// rows, "Charlie" and "Diana" would appear — this test goes RED.
	test('renders only the rows for the current page in the table body', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: true,
				isPaginationPending: false,
				totalCount: 10,
			},
			page0Rows,
		);

		// Page 0 rows are rendered.
		expect(screen.getByText('Alice')).toBeTruthy();
		expect(screen.getByText('Bob')).toBeTruthy();
		// Page 1 rows are NOT rendered — only the current page's rows are shown.
		expect(screen.queryByText('Charlie')).toBeNull();
		expect(screen.queryByText('Diana')).toBeNull();
	});

	// Breaker: if DataTable ignores `hasPreviousPage` and always enables the
	// Previous button, `disabled` would be absent even when false — this test goes RED.
	test('enables the Previous button when hasPreviousPage is true', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 1,
				hasPreviousPage: true,
				hasNextPage: false,
				isPaginationPending: false,
				totalCount: 10,
			},
			page1Rows,
		);

		const prevButton = screen.getByTestId('pagination-integration-prev-page');
		expect(prevButton.hasAttribute('disabled')).toBe(false);
	});

	// Breaker: if DataTable swaps `hasPreviousPage` and `hasNextPage` on the
	// Previous button, it would be enabled when `hasPreviousPage` is false — RED.
	test('disables the Previous button when hasPreviousPage is false', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: true,
				isPaginationPending: false,
				totalCount: 10,
			},
			page0Rows,
		);

		const prevButton = screen.getByTestId('pagination-integration-prev-page');
		expect(prevButton.hasAttribute('disabled')).toBe(true);
		expect(prevButton.getAttribute('aria-label')).toBe('Previous page');
	});

	// Breaker: if DataTable ignores `hasNextPage` and always disables the
	// Next button, `disabled` would be present even when true — this test goes RED.
	test('enables the Next button when hasNextPage is true', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: true,
				isPaginationPending: false,
				totalCount: 10,
			},
			page0Rows,
		);

		const nextButton = screen.getByTestId('pagination-integration-next-page');
		expect(nextButton.hasAttribute('disabled')).toBe(false);
	});

	// Breaker: if DataTable swaps `hasPreviousPage` and `hasNextPage` on the
	// Next button, it would be enabled when `hasNextPage` is false — this goes RED.
	test('disables the Next button when hasNextPage is false', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 1,
				hasPreviousPage: true,
				hasNextPage: false,
				isPaginationPending: false,
				totalCount: 10,
			},
			page1Rows,
		);

		const nextButton = screen.getByTestId('pagination-integration-next-page');
		expect(nextButton.hasAttribute('disabled')).toBe(true);
		expect(nextButton.getAttribute('aria-label')).toBe('Next page');
	});

	// Breaker: if the pending flag does not disable pager buttons, buttons would
	// remain enabled during pagination — this test goes RED.
	test('disables both pager buttons while isPaginationPending is true', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: true,
				hasNextPage: true,
				isPaginationPending: true,
				totalCount: 10,
			},
			page0Rows,
		);

		const prevButton = screen.getByTestId('pagination-integration-prev-page');
		const nextButton = screen.getByTestId('pagination-integration-next-page');
		expect(prevButton.hasAttribute('disabled')).toBe(true);
		expect(nextButton.hasAttribute('disabled')).toBe(true);
	});

	// Breaker: if the range label always shows "of N" even when `totalCount` is
	// undefined, it would render "1–2 of 0" instead of bare "1–2" — RED.
	test('renders the bare range (no "of N") when totalCount is undefined', () => {
		renderDataTableWithPagination(
			{
				pageIndex: 0,
				hasPreviousPage: false,
				hasNextPage: true,
				isPaginationPending: false,
				totalCount: undefined,
			},
			page0Rows,
		);

		// No total -> bare range label: "1–2"
		expect(
			screen.getByTestId('pagination-integration-range-label').textContent,
		).toBe('1–2');
	});
});
