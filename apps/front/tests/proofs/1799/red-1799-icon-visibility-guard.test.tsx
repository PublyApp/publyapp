/**
 * @vitest-environment jsdom
 *
 * KEPT RED TEST — issue #1799.
 *
 * The icon visibility guard in
 * `apps/front/src/components/table/data-table-icon-visibility-guard.ts`
 * used to be a class-name enumeration: it checked for the two specific
 * Tailwind utilities `invisible` and `hidden` and called it a day. The
 * brief at #1799 names that as the defect: a class enumeration is, by
 * construction, never exhaustive. `opacity-0` (opacity:0) and
 * `aria-hidden="true"` (a DOM attribute, not a CSS value) slipped through
 * the old guard, even though each of them makes the icon invisible to
 * the user.
 *
 * The ideal behavior the guard must satisfy, asserted below: for each of
 * the four hiding mechanisms the issue names (`invisible`, `hidden`,
 * `opacity-0`, `aria-hidden="true"`), the guard MUST raise with a named
 * reason — not stay silent. The proof renders a real DataTable in jsdom
 * and feeds the helper a fake `ComputedStyleReader` that returns the
 * computed-style values Chromium would produce for each mutation. The
 * helper is then responsible for the visibility measurement — not for
 * picking which class names count as "hidden".
 *
 * Replay (green, fixed code):
 *
 *   pnpm --filter front exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx
 *
 * Expected (current buggy code, this commit): FAIL — the two tests for
 * `opacity-0` and `aria-hidden` go red; the two tests for `invisible` and
 * `hidden` stay green. The 5 existing tests in
 * `data-table-selection-integration.test.tsx` stay green either way (the
 * helper's API is unchanged).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import type { ColumnDef } from '../../../src/components/table/column-type';
import { DataTable } from '../../../src/components/table/data-table';
import { assertIconIsVisible } from '../../../src/components/table/data-table-icon-visibility-guard';
import type { ComputedStyleReader } from '../../../src/components/table/data-table-icon-visibility-guard-reader';
import type { SortState } from '../../../src/components/table/sort-descriptor';
import type {
	RowSelectionMap,
	UseRowSelectionResult,
} from '../../../src/components/table/use-row-selection';

const { makeT } = vi.hoisted(() => {
	const labels: TestLabelMap = {
		'icon-hidden-aria': 'icon has aria-hidden="true"',
		'icon-hidden-visibility': 'icon has computed visibility:hidden',
		'icon-hidden-display': 'icon has computed display:none',
		'icon-hidden-opacity': 'icon has computed opacity:0',
		'icon-guard-context-null': '{{context}}: icon element is null',
		'list-unavailable-title': 'List unavailable',
		'list-error-default-description': 'There was a problem loading this list.',
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

	const fn = (key: string, options?: Record<string, unknown>): string => {
		let text = labels[key] ?? key;
		if (!options) {
			return text;
		}
		for (const [optionKey, value] of Object.entries(options)) {
			text = text.replaceAll(`{{${optionKey}}}`, String(value));
		}
		return text;
	};

	return { makeT: fn };
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: makeT,
		i18n: { language: 'en' },
	}),
}));

vi.mock('i18next', () => ({
	default: {
		t: makeT,
	},
}));

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

const renderAllSelected = (): HTMLElement => {
	const selection = createSelection({
		'row-1': true,
		'row-2': true,
		'row-3': true,
	});
	render(
		<DataTable
			testId="proof-1799"
			ariaLabel="proof 1799 table"
			columns={columns}
			rows={rows}
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
	const headerCheckbox = screen
		.getByTestId('proof-1799-rows')
		.querySelector<HTMLElement>('thead [data-slot="checkbox"]');
	if (headerCheckbox === null) {
		throw new Error('proof-1799: header checkbox is missing');
	}
	const iconElement = headerCheckbox.querySelector<HTMLElement>('[data-icon]');
	if (iconElement === null) {
		throw new Error('proof-1799: header icon is missing');
	}
	return iconElement;
};

/**
 * A `ComputedStyleReader` that pretends every Tailwind utility applied to
 * the element was resolved by a real browser. Each test installs the
 * class/attribute the test is about, then passes a reader that returns
 * the values that reader WOULD return for that mutation. The helper is
 * then responsible for measuring, not for enumerating — exactly the
 * invariant the original defect violated.
 */
const fixedComputedStyleFor: ComputedStyleReader = (element) => {
	const classes = new Set(Array.from(element.classList));
	if (classes.has('invisible')) {
		return { visibility: 'hidden', display: 'inline-block', opacity: '1' };
	}
	if (classes.has('hidden')) {
		return { visibility: 'visible', display: 'none', opacity: '1' };
	}
	if (classes.has('opacity-0')) {
		return { visibility: 'visible', display: 'inline-block', opacity: '0' };
	}
	return { visibility: 'visible', display: 'inline-block', opacity: '1' };
};

const reader: ComputedStyleReader = (element) => fixedComputedStyleFor(element);

describe('Icon visibility guard (#1799) — kept red proof', () => {
	afterEach(cleanup);

	test('baseline: an unmutated icon is visible (no false positive)', () => {
		const icon = renderAllSelected();
		// No mutation, no reader: the helper's default reader is
		// `window.getComputedStyle`, which returns `''` for every property
		// in jsdom — and the helper MUST treat the icon as visible.
		expect(() =>
			assertIconIsVisible(icon, 'proof-1799 baseline'),
		).not.toThrow();
	});

	test('invisible (Tailwind → visibility:hidden) is caught', () => {
		const icon = renderAllSelected();
		icon.classList.add('invisible');
		expect(() =>
			assertIconIsVisible(icon, 'proof-1799 invisible', reader),
		).toThrow(/visibility:hidden|invisible/);
	});

	test('hidden (Tailwind → display:none) is caught', () => {
		const icon = renderAllSelected();
		icon.classList.add('hidden');
		expect(() =>
			assertIconIsVisible(icon, 'proof-1799 hidden', reader),
		).toThrow(/display:none|hidden/);
	});

	test('opacity-0 (Tailwind → opacity:0) is caught — the bug the old enumeration missed', () => {
		const icon = renderAllSelected();
		icon.classList.add('opacity-0');
		// The fixed reader returns opacity:0 for an `opacity-0` element.
		// The guard MUST raise; the old classList enumeration would not.
		expect(() =>
			assertIconIsVisible(icon, 'proof-1799 opacity-0', reader),
		).toThrow(/opacity:0/);
	});

	test('aria-hidden="true" on the icon is caught — the bug the old enumeration missed', () => {
		const icon = renderAllSelected();
		icon.setAttribute('aria-hidden', 'true');
		expect(() =>
			assertIconIsVisible(icon, 'proof-1799 aria-hidden', reader),
		).toThrow(/aria-hidden/);
	});
});
