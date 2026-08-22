import { expect, test } from 'vitest';

import { getQueryKey } from './keys';

type SharedNode = {
	self?: SharedNode;
};

test('builds stable string keys from explicit path segments', () => {
	const key = getQueryKey(['health']);
	expect(key).toEqual(['health']);
});

test('builds stable string keys with nested primitives', () => {
	const key = getQueryKey(['users', 'list', 'byId', 'abc', true]);
	expect(key).toEqual(['users', 'list', 'byId', 'abc', 'true']);
});

test('serializes undefined and null key segments', () => {
	const key = getQueryKey(['users', undefined, null]);
	expect(key).toEqual(['users', 'undefined', 'null']);
});

test('handles circular query args', () => {
	const circular: SharedNode = {};
	circular.self = circular;

	const key = getQueryKey([circular]);
	expect(key).toEqual(['{self:[circular]}']);
});

test('does not serialize shared non-cyclic objects as circular', () => {
	const shared = { id: 1 };
	const key = getQueryKey([{ left: shared, right: shared }]);
	expect(key).toEqual(['{left:{id:1},right:{id:1}}']);
});
