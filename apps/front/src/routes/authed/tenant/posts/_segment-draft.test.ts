import { describe, expect, test } from 'vitest';

import { reconcileSegmentDrafts } from './_segment-draft';

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

	test('a first load (no previous drafts) gives every segment a fresh id', () => {
		const [one, two] = reconcileSegmentDrafts([], ['A', 'B']);

		expect(one?.id).not.toBe(two?.id);
	});
});
