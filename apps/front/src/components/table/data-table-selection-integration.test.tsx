/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vitest';
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
 * Visibility guard: the `data-icon` assertion alone only proves an icon is
 * *declared*, never that it is *visible*. A mutation like `invisible` (or any
 * other CSS hiding mechanism) applied to the icon element would keep `data-icon`
 * present and readable while the icon is hidden from the user. The guard below
 * reads the computed style of the icon element and fails if its `visibility` is
 * `hidden` or its `display` is `none` — the two canonical ways Tailwind's
 * `invisible` / `hidden` utilities hide an element. This is an ENUMERATION of
 * hiding mechanisms: it covers `visibility:hidden` (Tailwind `invisible`) and
 * `display:none` (Tailwind `hidden`), but does NOT cover `opacity:0`
 * (Tailwind `opacity-0`), `clip-path`, `transform: scale(0)`, `width:0`,
 * `height:0`, `position:absolute` off-screen, or `aria-hidden` without visual
 * hiding. Those are out of scope here and would need dedicated coverage if a
 * mutation uses them.
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

/** Returns the rendered icon name inside a checkbox, or null if none. */
const getCheckboxIcon = (checkbox: HTMLElement | null): string | null =>
	checkbox?.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null;

/**
 * Returns the icon element inside a checkbox (by `data-icon`), or null if none.
 * Used to inspect the element's computed style for visibility.
 */
const getCheckboxIconElement = (
	checkbox: HTMLElement | null,
): HTMLElement | null =>
	checkbox?.querySelector<HTMLElement>('[data-icon]') ?? null;

/**
 * The icon visibility guard is implemented as a real measurement (computed
 * styles + `aria-hidden` attribute), not a class-name enumeration. To make
 * `window.getComputedStyle` return the real Tailwind values in jsdom, the
 * guard's compiled CSS is injected into the test document once per test
 * file. See `data-table-icon-visibility-guard.ts` for the full rationale.
 */
import {
	assertIconIsVisible as assertIconIsVisibleImpl,
	injectGuardStylesheet,
} from './data-table-icon-visibility-guard';

/** Returns all row checkbox elements in the body. */
const getRowCheckboxes = (): HTMLElement[] =>
	Array.from(
		screen
			.getByTestId('selection-integration-rows')
			.querySelectorAll('tbody [data-slot="checkbox"]'),
	);

describe('DataTable row selection integration (issue #1730)', () => {
	beforeAll(async () => {
		// jsdom does not resolve Tailwind utility classes into computed styles
		// on its own. Inject the guard's compiled CSS once so
		// `getComputedStyle` returns the real Tailwind values for `hidden`,
		// `invisible`, and `opacity-0`. Without this injection, every
		// `getComputedStyle` call would return `''` for `visibility` and
		// `display`, and the icon visibility guard could not catch a
		// `visibility:hidden` or `display:none` mutation at all.
		await injectGuardStylesheet(document);
	});

	afterEach(cleanup);

	/**
	 * Thin wrapper around the guard helper that resolves the checkbox to its
	 * icon element first. Fails the test when the icon element is missing
	 * (none of the relevant states should ever produce a checkbox without
	 * a `data-icon` child) and delegates the real measurement to
	 * `assertIconIsVisibleImpl`.
	 */
	const assertIconIsVisible = (
		checkbox: HTMLElement | null,
		context: string,
	): void => {
		const iconElement = getCheckboxIconElement(checkbox);
		expect(
			iconElement,
			`${context}: icon element exists`,
		).not.toBeNull();
		assertIconIsVisibleImpl(iconElement, context);
	};

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
			expect(getCheckboxIcon(checkbox)).toBeNull();
		}

		// Header checkbox should also be unchecked (no selection).
		const headerCheckbox = getHeaderCheckbox();
		expect(headerCheckbox).not.toBeNull();
		expect(headerCheckbox?.hasAttribute('data-checked')).toBe(false);
		expect(headerCheckbox?.getAttribute('data-indeterminate')).toBeNull();
		expect(getCheckboxIcon(headerCheckbox)).toBeNull();
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
		expect(getCheckboxIcon(headerCheckbox)).toBe('check');
		// Visibility guard: the icon must be visible, not just declared.
		assertIconIsVisible(headerCheckbox, 'header checkbox (all selected)');
		// Accessible state: checked.
		expect(headerCheckbox?.getAttribute('aria-checked')).toBe('true');
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
		expect(getCheckboxIcon(headerCheckbox)).toBe('minus');
		// Visibility guard: the icon must be visible, not just declared.
		assertIconIsVisible(headerCheckbox, 'header checkbox (partial selection)');
		// Accessible state: mixed.
		expect(headerCheckbox?.getAttribute('aria-checked')).toBe('mixed');
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
		expect(getCheckboxIcon(headerCheckbox)).toBeNull();
		// Accessible state: false.
		expect(headerCheckbox?.getAttribute('aria-checked')).toBe('false');
	});
});
