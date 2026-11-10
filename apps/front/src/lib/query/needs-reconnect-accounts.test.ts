import { describe, expect, test, vi } from 'vitest';

import { needsReconnectAccountsQueryOptions } from './needs-reconnect-accounts';

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: vi.fn(),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

describe('needsReconnectAccountsQueryOptions', () => {
	test('key is the array the hook built before extraction', () => {
		expect(
			needsReconnectAccountsQueryOptions.queryKey({ tenantId: 'tenant-42' }),
		).toEqual(['needs-reconnect-accounts', 'tenant-42']);
	});

	test('is session-stable per tenant', () => {
		expect(needsReconnectAccountsQueryOptions.staleTime).toBe(Infinity);
	});
});
