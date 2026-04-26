import assert from 'node:assert/strict';
import test from 'node:test';

import {
	getProfileUsersDebouncedSearchAction,
	getVisibleSelectedRows,
	reconcileVisibleProfileUserRowSelection,
} from './staff-profile-users-table-helpers.ts';

test('reconcileVisibleProfileUserRowSelection drops stale selected ids after the visible dataset changes', () => {
	const nextRowSelection = reconcileVisibleProfileUserRowSelection(
		{
			'user-1': true,
			'user-2': true,
			'user-3': false,
		},
		[{ id: 'user-2' }, { id: 'user-4' }],
	);

	assert.deepEqual(nextRowSelection, {
		'user-2': true,
	});
});

test('getVisibleSelectedRows only counts selected rows that are still visible', () => {
	const selectedRows = getVisibleSelectedRows(
		[
			{ id: 'user-2', email: 'two@example.com' },
			{ id: 'user-4', email: 'four@example.com' },
		],
		{
			'user-1': true,
			'user-2': true,
		},
	);

	assert.deepEqual(selectedRows, [{ id: 'user-2', email: 'two@example.com' }]);
});

test('getProfileUsersDebouncedSearchAction blocks a queued debounced search flush until the locked input has fully settled back', () => {
	const action = getProfileUsersDebouncedSearchAction({
		isSelectionMode: false,
		isCancellingSelectionLockedSearch: true,
		debouncedQuery: 'pending change',
		persistedQuery: '',
	});

	assert.equal(action, 'wait');
});
