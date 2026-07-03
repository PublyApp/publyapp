import { describe, expect, test } from 'vitest';

import {
	MAX_CURSOR_HISTORY,
	advanceCursorPagination,
	deriveCursorPaginationState,
	initialCursorPaginationState,
	resetCursorPagination,
	retreatCursorPagination,
} from './use-cursor-pagination';

const GEN_A = { sortId: 'created_at', sortOrder: 'desc' as const, size: 25 };
const GEN_B = { sortId: 'created_at', sortOrder: 'asc' as const, size: 25 };

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
