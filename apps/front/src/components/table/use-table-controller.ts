import { useEffect, useRef, useState } from 'react';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { createDebouncer } from './debouncer';
import type { Debouncer } from './debouncer';
import type { SortState } from './sort-descriptor';
import { useCursorPagination } from './use-cursor-pagination';

const DEFAULT_SEARCH_DEBOUNCE_MS = 300;

export const resolveSort = (
	search: TableSearchParams,
	defaultSort: SortState,
): SortState => ({
	id: search.sortId ?? defaultSort.id,
	order: search.sortOrder ?? defaultSort.order,
});

export const resolveSize = (
	search: TableSearchParams,
	defaultSize: number,
): number => search.size ?? defaultSize;

/** Cursor is never part of URL search state — every URL write drops it. */
export const buildSortChangeSearch = (
	search: TableSearchParams,
	nextSort: SortState | undefined,
): TableSearchParams => ({
	...search,
	sortId: nextSort?.id,
	sortOrder: nextSort?.order,
	cursor: undefined,
});

export const buildSizeChangeSearch = (
	search: TableSearchParams,
	nextSize: number,
): TableSearchParams => ({ ...search, size: nextSize, cursor: undefined });

export const buildSearchCommitSearch = (
	search: TableSearchParams,
	nextQ: string,
): TableSearchParams => {
	const trimmed = nextQ.trim();
	return {
		...search,
		q: trimmed.length > 0 ? trimmed : undefined,
		cursor: undefined,
	};
};

type ApiVariables = {
	q?: string;
	sortId: string;
	sortOrder: SortState['order'];
	cursor?: string;
	size: number;
};

export type UseTableControllerOptions = {
	search: TableSearchParams;
	onSearchChange: (next: TableSearchParams) => void;
	defaultSort: SortState;
	defaultSize: number;
	searchDebounceMs?: number;
	cursorResetKey?: string;
};

export type UseTableControllerResult = {
	sort: SortState;
	onSortChange: (nextSort: SortState | undefined) => void;
	size: number;
	onSizeChange: (nextSize: number) => void;
	search: {
		draft: string;
		committed: string | undefined;
		onDraftChange: (value: string) => void;
		/** Cancels any pending debounced commit and snaps the draft back to the
		 * committed URL value. Callers freeze search this way when selection
		 * mode becomes active (selection lives outside this hook — see below). */
		resetDraftToCommitted: () => void;
	};
	cursor: {
		pageIndex: number;
		hasPreviousPage: boolean;
		onNextPage: (nextCursor: string | undefined) => void;
		onPreviousPage: () => void;
	};
	apiVariables: ApiVariables;
};

/**
 * Composes URL-backed sort/size/search state with a client-only cursor
 * history stack into `apiVariables` for the list query.
 *
 * Selection is intentionally a SEPARATE hook (`useRowSelection`), not owned
 * here: it is derived from the query's row ids, which are themselves derived
 * from `apiVariables` — fusing them into one hook would be circular. Compose
 * both at the call site (see the staff-users route), the same split the
 * current-app contract uses (`useTableState` + `useTableRowSelection`).
 */
export const useTableController = (
	options: UseTableControllerOptions,
): UseTableControllerResult => {
	const {
		search,
		onSearchChange,
		defaultSort,
		defaultSize,
		searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
		cursorResetKey,
	} = options;

	const sort = resolveSort(search, defaultSort);
	const size = resolveSize(search, defaultSize);
	const committedQ = search.q ?? '';

	const cursorPagination = useCursorPagination({
		sortId: sort.id,
		sortOrder: sort.order,
		size,
		scopeKey: cursorResetKey,
	});

	const [draftEdit, setDraftEdit] = useState<{
		seed: string;
		value: string;
	} | null>(null);
	const debouncerRef = useRef<Debouncer | null>(null);
	if (debouncerRef.current === null) {
		debouncerRef.current = createDebouncer(searchDebounceMs);
	}

	// The debounced commit below fires later, after possibly several
	// re-renders (e.g. a sort/size change while typing). It must read
	// whatever `search` is current AT FIRE TIME, not the value captured when
	// it was scheduled — otherwise it clobbers a sort/size change that
	// happened in between. See use-table-controller.test.ts's regression test.
	const searchRef = useRef(search);
	useEffect(() => {
		searchRef.current = search;
	}, [search]);

	// The draft is DERIVED from the committed value, not a mirrored copy of
	// it: with no edit open, `draft` renders straight from `committedQ`. An
	// open edit is stored as {seed, value} — the committed value it grew out
	// of plus what the user typed. When the seed drifts from `committedQ`
	// (browser back/forward, a cleared or externally rewritten URL), the edit
	// is dropped DURING RENDER — React's documented adjust-state-while-rendering
	// reset, the same pattern `useCursorPagination` uses for generation
	// changes. That replaces the previous useEffect(setDraft(committedQ))
	// repair effect, which synced one frame late and flashed the stale draft
	// after paint (react-doctor no-derived-state).
	if (draftEdit !== null && draftEdit.seed !== committedQ) {
		setDraftEdit(null);
	}

	const draft = draftEdit === null ? committedQ : draftEdit.value;
	useEffect(() => {
		const debouncer = debouncerRef.current;
		return () => debouncer?.cancel();
	}, []);

	const resetDraftToCommitted = (): void => {
		debouncerRef.current?.cancel();
		setDraftEdit(null);
	};

	const onSearchDraftChange = (value: string): void => {
		setDraftEdit({ seed: committedQ, value });
		debouncerRef.current?.schedule(() => {
			cursorPagination.reset();
			onSearchChange(buildSearchCommitSearch(searchRef.current, value));
		});
	};

	const onSortChange = (nextSort: SortState | undefined): void => {
		onSearchChange(buildSortChangeSearch(search, nextSort));
	};

	const onSizeChange = (nextSize: number): void => {
		onSearchChange(buildSizeChangeSearch(search, nextSize));
	};

	return {
		sort,
		onSortChange,
		size,
		onSizeChange,
		search: {
			draft,
			committed: search.q,
			onDraftChange: onSearchDraftChange,
			resetDraftToCommitted,
		},
		cursor: {
			pageIndex: cursorPagination.pageIndex,
			hasPreviousPage: cursorPagination.hasPreviousPage,
			onNextPage: cursorPagination.advance,
			onPreviousPage: cursorPagination.retreat,
		},
		apiVariables: {
			q: search.q,
			sortId: sort.id,
			sortOrder: sort.order,
			cursor: cursorPagination.cursor,
			size,
		},
	};
};
