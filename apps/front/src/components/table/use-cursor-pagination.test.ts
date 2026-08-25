// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';

import {
	MAX_CURSOR_HISTORY,
	advanceCursorPagination,
	deriveCursorPaginationState,
	initialCursorPaginationState,
	resetCursorPagination,
	retreatCursorPagination,
	useCursorPagination,
} from './use-cursor-pagination';
import type {
	CursorGeneration,
	UseCursorPaginationResult,
} from './use-cursor-pagination';

// react-dom's `act` expects this flag when there's no test-runner integration
// (e.g. @testing-library/react) declaring the environment for it.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GEN_A = { sortId: 'created_at', sortOrder: 'desc' as const, size: 25 };
const GEN_B = { sortId: 'created_at', sortOrder: 'asc' as const, size: 25 };

// Renders the real `useCursorPagination` hook (not just its pure helpers) so
// the regression test below can catch a bug in how the hook COMMITS state
// across renders — something the pure-function tests above can't see, since
// they never exercise the hook's internal useState across a prop change.
const mountedRoots: Root[] = [];

afterEach(() => {
	for (const root of mountedRoots.splice(0)) {
		act(() => {
			root.unmount();
		});
	}
});

const renderCursorPagination = (generation: CursorGeneration) => {
	let latest: UseCursorPaginationResult | undefined;

	const Probe = (props: { generation: CursorGeneration }): null => {
		latest = useCursorPagination(props.generation);
		return null;
	};

	const container = document.createElement('div');
	const root = createRoot(container);
	mountedRoots.push(root);

	const renderWith = (nextGeneration: CursorGeneration): void => {
		act(() => {
			root.render(createElement(Probe, { generation: nextGeneration }));
		});
	};

	renderWith(generation);

	return {
		rerender: renderWith,
		result: () => {
			if (!latest) {
				throw new Error('useCursorPagination did not render');
			}
			return latest;
		},
	};
};

describe('cursor pagination state', () => {
	test('advance pushes the current cursor onto history and moves forward', () => {
		const state = initialCursorPaginationState(GEN_A);

		const page1 = advanceCursorPagination(state, GEN_A, 'cursor-1');
		expect(page1).toEqual({
			current: 'cursor-1',
			history: [undefined],
			pageIndex: 1,
			generation: GEN_A,
		});

		const page2 = advanceCursorPagination(page1, GEN_A, 'cursor-2');
		expect(page2).toEqual({
			current: 'cursor-2',
			history: [undefined, 'cursor-1'],
			pageIndex: 2,
			generation: GEN_A,
		});
	});

	test('retreat pops history and walks back', () => {
		const state = initialCursorPaginationState(GEN_A);
		const page1 = advanceCursorPagination(state, GEN_A, 'cursor-1');
		const page2 = advanceCursorPagination(page1, GEN_A, 'cursor-2');

		const backToPage1 = retreatCursorPagination(page2, GEN_A);
		expect(backToPage1).toEqual({
			current: 'cursor-1',
			history: [undefined],
			pageIndex: 1,
			generation: GEN_A,
		});

		const backToPage0 = retreatCursorPagination(backToPage1, GEN_A);
		expect(backToPage0).toEqual({
			current: undefined,
			history: [],
			pageIndex: 0,
			generation: GEN_A,
		});
	});

	test('retreat with empty history resets to page 0', () => {
		const state = initialCursorPaginationState(GEN_A);
		const result = retreatCursorPagination(state, GEN_A);
		expect(result).toEqual(initialCursorPaginationState(GEN_A));
	});

	test('reset clears history, current cursor, and page index', () => {
		const state = initialCursorPaginationState(GEN_A);
		const page1 = advanceCursorPagination(state, GEN_A, 'cursor-1');
		const page2 = advanceCursorPagination(page1, GEN_A, 'cursor-2');

		expect(resetCursorPagination(GEN_A)).toEqual(
			initialCursorPaginationState(GEN_A),
		);
		expect(page2.pageIndex).toBe(2); // sanity: page2 really had advanced first
	});

	test('a generation mismatch (sort/size change) reads the cursor as null immediately', () => {
		const state = initialCursorPaginationState(GEN_A);
		const page1 = advanceCursorPagination(state, GEN_A, 'cursor-1');
		const page2 = advanceCursorPagination(page1, GEN_A, 'cursor-2');

		const derived = deriveCursorPaginationState(page2, GEN_B);
		expect(derived).toEqual(initialCursorPaginationState(GEN_B));
	});

	test('advance/retreat under a mismatched generation re-stamp instead of using stale history', () => {
		const state = initialCursorPaginationState(GEN_A);
		const page1 = advanceCursorPagination(state, GEN_A, 'cursor-1');

		// sort flips (GEN_B) — the next advance should behave as a fresh first page.
		const advancedAfterSortChange = advanceCursorPagination(
			page1,
			GEN_B,
			'cursor-b1',
		);
		expect(advancedAfterSortChange).toEqual({
			current: 'cursor-b1',
			history: [undefined],
			pageIndex: 1,
			generation: GEN_B,
		});

		const retreatedAfterSortChange = retreatCursorPagination(page1, GEN_B);
		expect(retreatedAfterSortChange).toEqual(
			initialCursorPaginationState(GEN_B),
		);
	});

	test('history is capped at MAX_CURSOR_HISTORY entries', () => {
		let state = initialCursorPaginationState(GEN_A);
		const total = MAX_CURSOR_HISTORY + 10;

		for (let index = 0; index < total; index += 1) {
			state = advanceCursorPagination(state, GEN_A, `cursor-${index}`);
		}

		expect(state.history).toHaveLength(MAX_CURSOR_HISTORY);
		expect(state.pageIndex).toBe(total);
		// the oldest entries were dropped; the tail is the most recent history.
		expect(state.history.at(-1)).toBe(`cursor-${total - 2}`);
	});
});

describe('useCursorPagination (hook, regression)', () => {
	test('a generation round-trip (A -> B -> A) does not resurrect the stale A cursor stack', () => {
		const hook = renderCursorPagination(GEN_A);

		act(() => {
			hook.result().advance('cursor-1');
		});
		act(() => {
			hook.result().advance('cursor-2');
		});
		expect(hook.result().pageIndex).toBe(2);
		expect(hook.result().cursor).toBe('cursor-2');

		// Switch to generation B (e.g. a sort change) — no explicit reset call,
		// just a prop change, matching how the real controller drives this hook.
		hook.rerender(GEN_B);
		expect(hook.result().cursor).toBeUndefined();
		expect(hook.result().pageIndex).toBe(0);

		// Switch back to generation A. Before the fix, the hook's internal
		// `state` was never committed on the A -> B transition, so this
		// resurrected the stale page-2 cursor stack.
		hook.rerender(GEN_A);
		expect(hook.result().cursor).toBeUndefined();
		expect(hook.result().pageIndex).toBe(0);
		expect(hook.result().hasPreviousPage).toBe(false);
	});
});
