import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/**
 * Integration test: verifies that a SortState passed through the real
 * useReactTable (legacy) hook produces a visibly rendered sort direction
 * in the header row — NOT a mock. This fills the test gap flagged in the
 * r1 verdict: the existing `data-table.test.tsx` suite mocks react-i18next
 * and renders static columns without exercising the real TanStack table
 * instance's sorting-state → aria-sort / sort-icon pipeline.
 *
 * Breaker: if `toSortingState` incorrectly maps `desc: true` to `{ desc: false }`
 * (or vice-versa), this test turns RED because the rendered sort icon /
 * aria-sort attribute no longer matches the requested SortState.
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

const sortColumns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		enableSorting: true,
		cell: ({ getValue }) => String(getValue()),
	},
];

const sortRows: TestRow[] = [
	{ id: 'row-1', name: 'Alice' },
	{ id: 'row-2', name: 'Bob' },
];

const renderDataTableWithSort = (sort: SortState) =>
	render(
		<DataTable
			testId="sort-integration"
			ariaLabel="Sort integration table"
			columns={sortColumns}
			rows={sortRows}
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
			sort={sort}
			onSortChange={() => undefined}
			size={20}
			onSizeChange={() => undefined}
			searchDraft=""
			onSearchDraftChange={() => undefined}
		/>,
	);

describe('DataTable sort integration (r2-brief-F4)', () => {
	afterEach(cleanup);

	test('renders ascending sort direction when SortState.order is "asc"', () => {
		renderDataTableWithSort({ id: 'name', order: 'asc' });

		const header = screen.getByRole('columnheader', { name: 'Name' });

		// aria-sort must reflect ascending.
		expect(header.getAttribute('aria-sort')).toBe('ascending');

		// The up-arrow icon must be present (renderSortIcon returns IconArrowUp for asc).
		const icon = header.querySelector(
			'[data-slot="table-sort-icon"]',
		) as HTMLElement | null;
		expect(icon).not.toBeNull();
		expect(icon?.tagName.toLowerCase()).toBe('svg');
	});

	test('renders descending sort direction when SortState.order is "desc"', () => {
		renderDataTableWithSort({ id: 'name', order: 'desc' });

		const header = screen.getByRole('columnheader', { name: 'Name' });

		// aria-sort must reflect descending.
		expect(header.getAttribute('aria-sort')).toBe('descending');

		const icon = header.querySelector(
			'[data-slot="table-sort-icon"]',
		) as HTMLElement | null;
		expect(icon).not.toBeNull();
		expect(icon?.tagName.toLowerCase()).toBe('svg');
	});

	test('renders aria-sort="none" when sort column id does not match the column', () => {
		// When tableSort?.id !== columnId, the header shows "none".
		renderDataTableWithSort({ id: 'other-column', order: 'asc' });

		const header = screen.getByRole('columnheader', { name: 'Name' });
		expect(header.getAttribute('aria-sort')).toBe('none');
	});
});
