import type { ColumnDef } from '@tanstack/react-table';
/**
 * Issue #282 — the "x–y on N" range counter in the table footer.
 *
 * The state matrix from the owner's arbitration (2026-08-26) IS the test:
 *
 * | case                        | label                    |
 * |-----------------------------|--------------------------|
 * | total known                 | 21–40 of 137 items       |
 * | total unknown               | 21–40                    |
 * | genuine zero                | No items / Aucun élément |
 * | partial last page           | 121–137 of 137 items     |
 *
 * Plus the in-flight case: a page whose count lands AFTER the rows — the
 * label must move from "21–40" to "21–40 of 137" without ever displaying a
 * fabricated total ("of 0") in between. A missing total means UNKNOWN, never
 * zero — the same distinction `clampOffsetPageIndex` has held since #999.
 *
 * These assertions run against the REAL shipped locale bundles through the
 * production init helper (`createI18nFromResources`) — never a synthetic
 * `t()` — so the rendered strings are pinned per language (EN + FR), exactly
 * the pattern of `staff-users/bulk-bar-real-bundles.test.tsx`.
 */
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, test } from 'vitest';
import resourceEN from '~/i18n/locales/en/common.json';
import resourceFR from '~/i18n/locales/fr/common.json';
import {
	createI18nFromResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import { DataTable, DataTableCursorFooter } from './data-table';

afterEach(cleanup);

type TestRow = { id: string; name: string };
const columns: ColumnDef<TestRow>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ getValue }) => String(getValue()),
	},
];

/** Page 2 of a 20-row page size, drawn from a 137-item collection. */
const fullPageRows: TestRow[] = Array.from({ length: 20 }, (_, index) => ({
	id: `row-${index + 21}`,
	name: `Row ${index + 21}`,
}));

/** The partial last page: 17 rows out of 137 starting at 121. */
const lastPageRows: TestRow[] = Array.from({ length: 17 }, (_, index) => ({
	id: `row-${index + 121}`,
	name: `Row ${index + 121}`,
}));

const createI18n = (language: SupportedLanguage): I18nInstance =>
	createI18nFromResources(language, ['common'], {
		[language]: { common: language === 'en' ? resourceEN : resourceFR },
	});

const renderTable = (
	i18n: I18nInstance,
	props: {
		rows: TestRow[];
		totalCount?: number | null;
		pageIndex?: number;
		size?: number;
	},
): ReturnType<typeof render> =>
	render(
		createElement(
			I18nextProvider,
			{ i18n },
			createElement(DataTable<TestRow>, {
				testId: 'test-table',
				ariaLabel: 'Test table',
				columns,
				rows: props.rows,
				queryState: {
					isPending: false,
					isError: false,
					onRetry: () => undefined,
					hasActiveSearch: false,
				},
				pagination: {
					pageIndex: props.pageIndex ?? 1,
					hasPreviousPage: true,
					hasNextPage: true,
					isPaginationPending: false,
					onNextPage: () => undefined,
					onPreviousPage: () => undefined,
					totalCount: props.totalCount,
				},
				sort: { id: 'name', order: 'asc' },
				onSortChange: () => undefined,
				size: props.size ?? 20,
				onSizeChange: () => undefined,
			}),
		),
	);

const rangeLabel = (): HTMLElement | null =>
	screen.queryByTestId('test-table-range-label');

describe('DataTable range counter — the #282 state matrix (real bundles)', () => {
	test('total known renders "21–40 of 137 items" in English', () => {
		renderTable(createI18n('en'), { rows: fullPageRows, totalCount: 137 });

		expect(rangeLabel()?.textContent).toBe('21–40 of 137 items');
	});

	test('total known renders "21–40 sur 137 éléments" in French', () => {
		renderTable(createI18n('fr'), { rows: fullPageRows, totalCount: 137 });

		expect(rangeLabel()?.textContent).toBe('21–40 sur 137 éléments');
	});

	test('an unknown total renders the bare range — never "of 0"', () => {
		for (const totalCount of [undefined, null]) {
			const view = renderTable(createI18n('en'), {
				rows: fullPageRows,
				totalCount,
			});

			expect(rangeLabel()?.textContent).toBe('21–40');
			expect(screen.queryByText(/of 0\b/)).toBeNull();
			expect(screen.queryByText(/\bsur 0\b/)).toBeNull();
			view.unmount();
		}
	});

	test('a genuine zero renders the empty-collection label in both languages', () => {
		// Reachable only through the shared footer directly: DataTable gates
		// its footer behind a non-empty rows state, so a real zero surfaces as
		// the empty state — the footer keeps the honest label for surfaces
		// that render the footer outside that gate (card grids).
		for (const language of ['en', 'fr'] as const) {
			const view = render(
				createElement(
					I18nextProvider,
					{ i18n: createI18n(language) },
					createElement(DataTableCursorFooter, {
						testId: 'footer',
						pageIndex: 0,
						size: 20,
						onSizeChange: () => undefined,
						pageRowCount: 0,
						totalCount: 0,
						hasPreviousPage: false,
						hasNextPage: false,
						isPaginationPending: false,
						onNextPage: () => undefined,
						onPreviousPage: () => undefined,
					}),
				),
			);

			expect(screen.queryByTestId('footer-range-label')?.textContent).toBe(
				language === 'en' ? 'No items' : 'Aucun élément',
			);
			view.unmount();
		}
	});

	test('a partial last page renders "121–137 of 137 items"', () => {
		renderTable(createI18n('en'), {
			rows: lastPageRows,
			totalCount: 137,
			pageIndex: 6,
		});

		expect(rangeLabel()?.textContent).toBe('121–137 of 137 items');
	});

	test('a count arriving after the rows moves "21–40" to "21–40 of 137" without ever showing a total of zero', () => {
		const i18n = createI18n('en');
		const view = renderTable(i18n, { rows: fullPageRows });

		// Count still in flight: bare range, no fabricated total.
		expect(rangeLabel()?.textContent).toBe('21–40');

		view.rerender(
			createElement(
				I18nextProvider,
				{ i18n },
				createElement(DataTable<TestRow>, {
					testId: 'test-table',
					ariaLabel: 'Test table',
					columns,
					rows: fullPageRows,
					queryState: {
						isPending: false,
						isError: false,
						onRetry: () => undefined,
						hasActiveSearch: false,
					},
					pagination: {
						pageIndex: 1,
						hasPreviousPage: true,
						hasNextPage: true,
						isPaginationPending: false,
						onNextPage: () => undefined,
						onPreviousPage: () => undefined,
						totalCount: 137,
					},
					sort: { id: 'name', order: 'asc' },
					onSortChange: () => undefined,
					size: 20,
					onSizeChange: () => undefined,
				}),
			),
		);

		expect(rangeLabel()?.textContent).toBe('21–40 of 137 items');
	});
});
