/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => ({
			publishing: { capabilities: { get: mocks.get } },
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	PROVIDER_CAPABILITIES_QUERY_KEY,
	toDisabledProviders,
	useDisabledProviders,
} from '~/lib/query/provider-capabilities';

import type { GetProviderCapabilitiesForTenantResponse } from '@org/client-ts/models/index';

const asResponse = (items: unknown): GetProviderCapabilitiesForTenantResponse =>
	structuredClone({ items }) as GetProviderCapabilitiesForTenantResponse;

describe('PROVIDER_CAPABILITIES_QUERY_KEY', () => {
	test('is a stable, unscoped key base', () => {
		expect([...PROVIDER_CAPABILITIES_QUERY_KEY]).toEqual([
			'provider-capabilities',
		]);
	});
});

describe('toDisabledProviders', () => {
	test('collects only the providers the operator switched off', () => {
		const disabled = toDisabledProviders(
			asResponse([
				{ provider: 'bluesky', enabled: true },
				{ provider: 'mastodon', enabled: false },
				{ provider: 'pixelfed', enabled: false },
			]),
		);

		expect([...disabled].sort()).toEqual(['mastodon', 'pixelfed']);
	});

	test('hides nothing while there is no answer', () => {
		expect(toDisabledProviders(undefined).size).toBe(0);
		expect(toDisabledProviders(null).size).toBe(0);
		expect(toDisabledProviders(asResponse([null, { provider: 3 }])).size).toBe(
			0,
		);
	});

	test('ignores an entry whose enabled flag is missing', () => {
		expect(
			toDisabledProviders(asResponse([{ provider: 'mastodon' }])).size,
		).toBe(0);
	});
});

describe('useDisabledProviders', () => {
	const wrapperFor = (client: QueryClient) => {
		const Wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		return Wrapper;
	};

	test('serves no tenant without throwing and without a request', () => {
		const client = new QueryClient();
		const { result } = renderHook(() => useDisabledProviders(null), {
			wrapper: wrapperFor(client),
		});

		expect(result.current.size).toBe(0);
		expect(mocks.get).not.toHaveBeenCalled();
	});

	test('returns the same set across renders while the answer is unchanged', async () => {
		mocks.get.mockResolvedValue(
			asResponse([{ provider: 'mastodon', enabled: false }]),
		);
		const client = new QueryClient();
		const { result, rerender } = renderHook(() => useDisabledProviders('t1'), {
			wrapper: wrapperFor(client),
		});

		await waitFor(() => expect(result.current.has('mastodon')).toBe(true));
		const first = result.current;
		rerender();

		expect(result.current).toBe(first);
	});
});
