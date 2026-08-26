// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import {
	buildSearchCommitSearch,
	buildSizeChangeSearch,
	buildSortChangeSearch,
	resolveSize,
	resolveSort,
	useTableController,
} from './use-table-controller';
import type {
	UseTableControllerOptions,
	UseTableControllerResult,
} from './use-table-controller';

// react-dom's `act` expects this flag when there's no test-runner integration
// (e.g. @testing-library/react) declaring the environment for it.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 25;

// Renders the real `useTableController` hook (not just its pure builder
// helpers) so the regression test below can catch a stale-closure bug in the
// debounced search commit — something a pure-function test can't see, since
// it never exercises the hook across a prop change while a debounce is
// in-flight.
const mountedRoots: Root[] = [];

afterEach(() => {
	for (const root of mountedRoots.splice(0)) {
		act(() => {
			root.unmount();
		});
	}
});

const renderTableController = (options: UseTableControllerOptions) => {
	let latest: UseTableControllerResult | undefined;

	const Probe = (props: { options: UseTableControllerOptions }): null => {
		latest = useTableController(props.options);
		return null;
	};

	const container = document.createElement('div');
	const root = createRoot(container);
	mountedRoots.push(root);

	const renderWith = (nextOptions: UseTableControllerOptions): void => {
		act(() => {
			root.render(createElement(Probe, { options: nextOptions }));
		});
	};

	renderWith(options);

	return {
		rerender: renderWith,
		result: () => {
			if (!latest) {
				throw new Error('useTableController did not render');
			}
			return latest;
		},
	};
};

describe('resolveSort / resolveSize', () => {
	test('falls back to defaults when the URL has no sort/size', () => {
		expect(resolveSort({}, DEFAULT_SORT)).toEqual(DEFAULT_SORT);
		expect(resolveSize({}, DEFAULT_SIZE)).toBe(DEFAULT_SIZE);
	});

	test('prefers URL state over defaults', () => {
		const search: TableSearchParams = {
			sortId: 'level',
			sortOrder: 'asc',
			size: 10,
		};
		expect(resolveSort(search, DEFAULT_SORT)).toEqual({
			id: 'level',
			order: 'asc',
		});
		expect(resolveSize(search, DEFAULT_SIZE)).toBe(10);
	});
});

describe('buildSortChangeSearch', () => {
	test('writes the new sort and always drops cursor', () => {
		const search: TableSearchParams = { q: 'alpha', cursor: 'stale-cursor' };
		expect(
			buildSortChangeSearch(search, { id: 'level', order: 'asc' }),
		).toEqual({
			q: 'alpha',
			cursor: undefined,
			sortId: 'level',
			sortOrder: 'asc',
		});
	});

	test('clearing the sort clears both sortId and sortOrder', () => {
		const search: TableSearchParams = { sortId: 'level', sortOrder: 'asc' };
		expect(buildSortChangeSearch(search, undefined)).toEqual({
			sortId: undefined,
			sortOrder: undefined,
			cursor: undefined,
		});
	});
});

describe('buildSizeChangeSearch', () => {
	test('writes the new size and drops cursor', () => {
		const search: TableSearchParams = { size: 10, cursor: 'stale-cursor' };
		expect(buildSizeChangeSearch(search, 50)).toEqual({
			size: 50,
			cursor: undefined,
		});
	});
});

describe('buildSearchCommitSearch', () => {
	test('trims and writes q, drops cursor', () => {
		const search: TableSearchParams = {
			sortId: 'level',
			cursor: 'stale-cursor',
		};
		expect(buildSearchCommitSearch(search, '  alpha  ')).toEqual({
			sortId: 'level',
			cursor: undefined,
			q: 'alpha',
		});
	});

	test('an empty/whitespace-only value clears q to undefined, not empty string', () => {
		const search: TableSearchParams = { q: 'alpha' };
		expect(buildSearchCommitSearch(search, '   ')).toEqual({
			q: undefined,
			cursor: undefined,
		});
		expect(buildSearchCommitSearch(search, '')).toEqual({
			q: undefined,
			cursor: undefined,
		});
	});
});

describe('useTableController (hook, regression)', () => {
	test('a sort/size change before the debounce fires is preserved, not clobbered by a stale search closure', () => {
		vi.useFakeTimers();

		try {
			const onSearchChange = vi.fn();
			let search: TableSearchParams = {
				sortId: 'created_at',
				sortOrder: 'desc',
				size: 25,
			};
			const baseOptions: UseTableControllerOptions = {
				search,
				onSearchChange,
				defaultSort: DEFAULT_SORT,
				defaultSize: DEFAULT_SIZE,
				searchDebounceMs: 300,
			};

			const hook = renderTableController(baseOptions);

			// Type into search — schedules the debounced commit, closing over
			// whatever `search` the hook currently sees.
			act(() => {
				hook.result().search.onDraftChange('abc');
			});

			// Before the debounce fires, sort/size changes underneath it (e.g. the
			// user clicked a column header, which writes a new URL and re-renders
			// this hook with an updated `search` prop).
			search = { ...search, sortId: 'level', sortOrder: 'asc' };
			hook.rerender({ ...baseOptions, search });

			act(() => {
				vi.advanceTimersByTime(300);
			});

			// The committed search must reflect the NEWER sort/size, not the one
			// captured when the debounce was scheduled — and still apply `q`.
			expect(onSearchChange).toHaveBeenCalledTimes(1);
			expect(onSearchChange).toHaveBeenCalledWith({
				sortId: 'level',
				sortOrder: 'asc',
				size: 25,
				q: 'abc',
				cursor: undefined,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test('an external cursor reset key change resets pagination back to page 1', () => {
		const onSearchChange = vi.fn();
		const baseOptions: UseTableControllerOptions = {
			search: {
				sortId: 'created_at',
				sortOrder: 'desc',
				size: 25,
			},
			onSearchChange,
			defaultSort: DEFAULT_SORT,
			defaultSize: DEFAULT_SIZE,
			cursorResetKey: 'pending',
		};

		const hook = renderTableController(baseOptions);

		act(() => {
			hook.result().cursor.onNextPage('cursor-1');
		});

		expect(hook.result().cursor.pageIndex).toBe(1);

		hook.rerender({
			...baseOptions,
			cursorResetKey: 'accepted',
		});

		expect(hook.result().cursor.pageIndex).toBe(0);
		expect(hook.result().cursor.hasPreviousPage).toBe(false);
	});

	// Replaces the previous useEffect(setDraft(committedQ)) repair effect
	// (react-doctor no-derived-state). The draft is now DERIVED from
	// `committedQ`: with no edit open, `draft` mirrors `committedQ` directly;
	// an open edit is stored as {seed, value}. When the seed drifts from
	// `committedQ` (browser back/forward, a cleared or externally rewritten
	// URL), the edit is dropped DURING RENDER — React's documented
	// adjust-state-while-rendering reset, the same pattern useCursorPagination
	// uses for generation changes. This test pins the user-visible behavior
	// (no stale draft after a back/forward) and the implementation's
	// convergence on the next render — without the fix, the draft would
	// still echo the stale user input for one frame after the URL changes.
	test('the open search-draft edit is dropped the same render the committed URL changes under it (browser back/forward, external URL writes)', () => {
		const onSearchChange = vi.fn();
		const baseOptions: UseTableControllerOptions = {
			search: { sortId: 'created_at', sortOrder: 'desc', size: 25 },
			onSearchChange,
			defaultSort: DEFAULT_SORT,
			defaultSize: DEFAULT_SIZE,
		};

		const hook = renderTableController(baseOptions);
		expect(hook.result().search.draft).toBe('');

		// User types into the search box — opens an edit, seeded from the
		// current empty committed value.
		act(() => {
			hook.result().search.onDraftChange('abc');
		});
		expect(hook.result().search.draft).toBe('abc');

		// The URL underneath changes to a different committed value (e.g.
		// the user hit browser back, or some other surface rewrote the URL).
		// The seed of the open edit no longer matches, so the edit must be
		// dropped during the next render — NOT carried into the new render
		// and certainly not synced via a post-paint effect.
		hook.rerender({
			...baseOptions,
			search: { sortId: 'created_at', sortOrder: 'desc', size: 25, q: 'old' },
		});
		expect(hook.result().search.draft).toBe('old');
	});

	test('a draft edit that is still in sync with the committed value is preserved across a no-op re-render', () => {
		const onSearchChange = vi.fn();
		const baseOptions: UseTableControllerOptions = {
			search: { sortId: 'created_at', sortOrder: 'desc', size: 25, q: 'abc' },
			onSearchChange,
			defaultSort: DEFAULT_SORT,
			defaultSize: DEFAULT_SIZE,
		};

		const hook = renderTableController(baseOptions);
		expect(hook.result().search.draft).toBe('abc');

		act(() => {
			hook.result().search.onDraftChange('abcdef');
		});
		expect(hook.result().search.draft).toBe('abcdef');

		// A re-render that does not change the committed value must NOT
		// drop the in-progress edit.
		hook.rerender(baseOptions);
		expect(hook.result().search.draft).toBe('abcdef');
	});

	test('resetDraftToCommitted cancels the debounce and snaps the draft back to the committed value', () => {
		vi.useFakeTimers();
		try {
			const onSearchChange = vi.fn();
			const baseOptions: UseTableControllerOptions = {
				search: { sortId: 'created_at', sortOrder: 'desc', size: 25, q: 'old' },
				onSearchChange,
				defaultSort: DEFAULT_SORT,
				defaultSize: DEFAULT_SIZE,
				searchDebounceMs: 300,
			};

			const hook = renderTableController(baseOptions);
			expect(hook.result().search.draft).toBe('old');

			act(() => {
				hook.result().search.onDraftChange('typed-and-not-yet-committed');
			});
			expect(hook.result().search.draft).toBe('typed-and-not-yet-committed');

			act(() => {
				hook.result().search.resetDraftToCommitted();
			});
			expect(hook.result().search.draft).toBe('old');

			// The pending debounce must be cancelled too — advancing the
			// timers must NOT emit a stale onSearchChange.
			act(() => {
				vi.advanceTimersByTime(1000);
			});
			expect(onSearchChange).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
