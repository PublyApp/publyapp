import { useCallback, useState } from 'react';
import type { SortOrder } from '~/lib/url-state/table-search-params';

/** Cursors are only meaningful for the (sortId, sortOrder, size) they were fetched under. */
export type CursorGeneration = {
	sortId: string;
	sortOrder: SortOrder;
	size: number;
	scopeKey?: string;
};

export type CursorPaginationState = {
	current: string | undefined;
	history: (string | undefined)[];
	pageIndex: number;
	generation: CursorGeneration;
};

export const MAX_CURSOR_HISTORY = 50;

export const initialCursorPaginationState = (
	generation: CursorGeneration,
): CursorPaginationState => ({
	current: undefined,
	history: [],
	pageIndex: 0,
	generation,
});

const sameGeneration = (a: CursorGeneration, b: CursorGeneration): boolean =>
	a.sortId === b.sortId &&
	a.sortOrder === b.sortOrder &&
	a.size === b.size &&
	a.scopeKey === b.scopeKey;

/**
 * Reads `state` as of `generation`. A sort/size change invalidates the stored
 * cursor stack immediately (generation-stamp mismatch) without needing an
 * effect-driven reset: a stale cursor is simply never read back.
 */
export const deriveCursorPaginationState = (
	state: CursorPaginationState,
	generation: CursorGeneration,
): CursorPaginationState =>
	sameGeneration(state.generation, generation)
		? state
		: initialCursorPaginationState(generation);

export const advanceCursorPagination = (
	state: CursorPaginationState,
	generation: CursorGeneration,
	nextCursor: string | undefined,
): CursorPaginationState => {
	const base = deriveCursorPaginationState(state, generation);
	const history = [...base.history, base.current].slice(-MAX_CURSOR_HISTORY);

	return {
		current: nextCursor,
		history,
		pageIndex: base.pageIndex + 1,
		generation,
	};
};

export const retreatCursorPagination = (
	state: CursorPaginationState,
	generation: CursorGeneration,
): CursorPaginationState => {
	const base = deriveCursorPaginationState(state, generation);
	if (base.history.length === 0) {
		return initialCursorPaginationState(generation);
	}

	const previousCursor = base.history.at(-1);
	const history = base.history.slice(0, -1);

	return {
		current: previousCursor,
		history,
		pageIndex: Math.max(base.pageIndex - 1, 0),
		generation,
	};
};

export const resetCursorPagination = (
	generation: CursorGeneration,
): CursorPaginationState => initialCursorPaginationState(generation);

export type UseCursorPaginationResult = {
	cursor: string | undefined;
	pageIndex: number;
	hasPreviousPage: boolean;
	advance: (nextCursor: string | undefined) => void;
	retreat: () => void;
	reset: () => void;
};

/**
 * Client-only cursor history stack. Forward paging advances through opaque
 * server cursors; "previous" walks back through client-held history instead
 * of a server prev-cursor. Never persisted to the URL.
 */
export const useCursorPagination = (
	generation: CursorGeneration,
): UseCursorPaginationResult => {
	const [state, setState] = useState<CursorPaginationState>(() =>
		initialCursorPaginationState(generation),
	);
	const { sortId, sortOrder, size, scopeKey } = generation;

	// Commit (not just derive) the reset when the generation changes, so a
	// stale generation's cursor stack can never resurface if the caller later
	// switches back to it (e.g. sort A -> sort B -> sort A). This is React's
	// documented "adjust state during render" pattern: calling setState here
	// bails out this render and re-renders with synced state before anything
	// commits, so no stale cursor is ever read — on this render or a later one.
	if (!sameGeneration(state.generation, generation)) {
		setState(initialCursorPaginationState(generation));
	}

	const advance = useCallback(
		(nextCursor: string | undefined) => {
			setState((prev) =>
				advanceCursorPagination(
					prev,
					{ sortId, sortOrder, size, scopeKey },
					nextCursor,
				),
			);
		},
		[scopeKey, size, sortId, sortOrder],
	);

	const retreat = useCallback(() => {
		setState((prev) =>
			retreatCursorPagination(prev, { sortId, sortOrder, size, scopeKey }),
		);
	}, [scopeKey, size, sortId, sortOrder]);

	const reset = useCallback(() => {
		setState(resetCursorPagination({ sortId, sortOrder, size, scopeKey }));
	}, [scopeKey, size, sortId, sortOrder]);

	const derived = deriveCursorPaginationState(state, generation);

	return {
		cursor: derived.current,
		pageIndex: derived.pageIndex,
		hasPreviousPage: derived.pageIndex > 0,
		advance,
		retreat,
		reset,
	};
};
