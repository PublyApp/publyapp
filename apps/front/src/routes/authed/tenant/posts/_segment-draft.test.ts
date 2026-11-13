import { describe, expect, test } from 'vitest';

import { reconcileSegmentDrafts, segmentNumberOf } from './_segment-draft';

const drafts = (...entries: [string, string][]) =>
	entries.map(([id, text]) => ({ id, text }));

describe('reconcileSegmentDrafts', () => {
	test('keeps every id when the server segments are the drafts', () => {
		const previous = drafts(['a', 'A'], ['b', 'B']);

		expect(reconcileSegmentDrafts(previous, ['A', 'B'])).toEqual(previous);
	});

	test('follows the text, not the position: a local reorder keeps each id on its own text', () => {
		// Saved [A, B, C]; locally reordered to [A, C, B].
		const previous = drafts(['a', 'A'], ['c', 'C'], ['b', 'B']);

		expect(reconcileSegmentDrafts(previous, ['A', 'B', 'C'])).toEqual(
			drafts(['a', 'A'], ['b', 'B'], ['c', 'C']),
		);
	});

	test('a server segment with no matching draft gets a fresh id, never a leftover one', () => {
		const previous = drafts(['a', 'A'], ['b', 'B']);

		const [first, second] = reconcileSegmentDrafts(previous, ['A', 'Z']);

		expect(first).toEqual({ id: 'a', text: 'A' });
		expect(second?.text).toBe('Z');
		expect(['a', 'b']).not.toContain(second?.id);
	});

	test('duplicate texts each take their own draft, in order', () => {
		const previous = drafts(['x1', 'same'], ['x2', 'same']);

		expect(reconcileSegmentDrafts(previous, ['same', 'same'])).toEqual(
			previous,
		);
	});

	test('prefers the draft at the same index when its text matches, then the first match', () => {
		const previous = drafts(['p0', 'same'], ['p1', 'same']);

		const [first, second] = reconcileSegmentDrafts(previous, ['z', 'same']);

		expect(first?.text).toBe('z');
		// Index 1 keeps its own draft, not the earlier identical one.
		expect(second).toEqual({ id: 'p1', text: 'same' });
	});

	test('a first load (no previous drafts) gives every segment a fresh id', () => {
		const [one, two] = reconcileSegmentDrafts([], ['A', 'B']);

		expect(one?.id).not.toBe(two?.id);
	});

	test('stamps each draft with the stored segment it came from, so a save can name it', () => {
		const [one, two] = reconcileSegmentDrafts([], ['A', 'B'], ['s-1', 's-2']);

		expect(one?.serverId).toBe('s-1');
		expect(two?.serverId).toBe('s-2');
	});

	test('a draft added in the editor has no stored segment', () => {
		const [added] = reconcileSegmentDrafts([], ['A']);

		expect(added).not.toHaveProperty('serverId');
	});
});

describe('segmentNumberOf', () => {
	const drafts = [
		{ id: 'a', text: '' },
		{ id: 'b', text: '' },
	];

	test('numbers a follow-up from 2', () => {
		expect(segmentNumberOf('b', drafts)).toBe(3);
	});

	test('is undefined for the post itself or a follow-up that is gone', () => {
		expect(segmentNumberOf(undefined, drafts)).toBeUndefined();
		expect(segmentNumberOf('zzz', drafts)).toBeUndefined();
	});
});
