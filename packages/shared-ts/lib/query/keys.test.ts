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
	expect(key).toBe('health');
});

test('builds stable string keys with args', () => {
	const key = getQueryKey<FakeApiClient>((client) =>
		client.users.list.byId('abc', true),
	);
	expect(key).toBe('users.list.byId.abc.true');
});
