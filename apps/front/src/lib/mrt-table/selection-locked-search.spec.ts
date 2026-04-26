import assert from 'node:assert/strict';
import test from 'node:test';

import { getSelectionLockedSearchAction } from './selection-locked-search.ts';

test('getSelectionLockedSearchAction waits while a stale debounced value has not caught up to the current input yet', () => {
	const action = getSelectionLockedSearchAction({
		isSelectionMode: false,
		isCancellingSelectionLockedSearch: true,
		searchValue: 'fresh query',
		debouncedValue: 'stale query',
		persistedValue: '',
	});

	assert.equal(action, 'wait');
});

test('getSelectionLockedSearchAction applies a fresh query once debounce catches up after selection lock is released', () => {
	const action = getSelectionLockedSearchAction({
		isSelectionMode: false,
		isCancellingSelectionLockedSearch: true,
		searchValue: 'fresh query',
		debouncedValue: 'fresh query',
		persistedValue: '',
	});

	assert.equal(action, 'clear-cancel-and-apply');
});

test('getSelectionLockedSearchAction clears cancellation without applying when the reset input settles back to the persisted query', () => {
	const action = getSelectionLockedSearchAction({
		isSelectionMode: false,
		isCancellingSelectionLockedSearch: true,
		searchValue: '',
		debouncedValue: '',
		persistedValue: '',
	});

	assert.equal(action, 'clear-cancel');
});
