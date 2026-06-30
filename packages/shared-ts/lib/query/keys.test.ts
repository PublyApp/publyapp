import { expect, test } from 'vitest';

import { getQueryKey } from './keys';

type FakeApiClient = {
	users: {
		list: {
			byId: (id: string, includeDeleted: boolean) => unknown;
		};
	};
	health: () => unknown;
};

test('builds stable string keys from accessor path and primitive args', () => {
	const key = getQueryKey<FakeApiClient>((client) => {
		return client.health();
	});
	expect(key).toEqual(['health']);
});

test('builds stable string keys with args', () => {
	const key = getQueryKey<FakeApiClient>((client) =>
		client.users.list.byId('abc', true),
	);
	expect(key).toEqual(['users', 'list', 'byId', 'abc', 'true']);
});

test('ignores promise-like then accessor access', () => {
	type FakeApiClientWithThen = {
		list: () => unknown;
	};

	const key = getQueryKey<FakeApiClientWithThen>((client) => client.list());
	expect(key).toEqual(['list']);
});

test('handles circular query args', () => {
	type FakeCircularClient = {
		users: {
			byId: (arg: unknown) => unknown;
		};
	};

	const circular: Record<string, unknown> = {};
	circular.self = circular;

	const key = getQueryKey<FakeCircularClient>((client) => client.users.byId(circular));
	expect(key).toEqual(['users', 'byId', '{self:[circular]}']);
});
