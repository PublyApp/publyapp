/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
	getOrCreateClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: mocks.getOrCreateClient,
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	tenantPublicationRenditionQueryOptions,
	toTenantPublicationRendition,
	useResetPublicationRenditionMutation,
	useSavePublicationRenditionMutation,
} from '~/lib/query/tenant-publication-renditions';
import { untypedNodeToJson } from '~/lib/testing/untyped-node-json';

import type {
	RenditionResponse,
	SetPublicationRenditionBody,
} from '@org/client-ts/models/index';

const tenantId = '11111111-1111-1111-1111-111111111111';

interface RenditionMethods {
	get?: Mock;
	put?: Mock;
	delete?: Mock;
}

const stubClient = ({ get, put, delete: remove }: RenditionMethods) =>
	mocks.getOrCreateClient.mockReturnValue({
		posts: {
			publications: {
				byPublicationId: (publicationId: string) => ({
					rendition: {
						get: () => get?.(publicationId),
						put: (body: SetPublicationRenditionBody) =>
							put?.(publicationId, body),
						delete: () => remove?.(publicationId),
					},
				}),
			},
		},
	});

const renderWithClient = <T,>(hook: () => T) => {
	const client = new QueryClient();
	const invalidate = vi.spyOn(client, 'invalidateQueries');
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return { ...renderHook(hook, { wrapper }), invalidate };
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('toTenantPublicationRendition', () => {
	test('maps segment overrides and the media subset with alt texts', () => {
		const response: RenditionResponse = {
			publicationId: 'pub-1',
			customized: true,
			segments: [{ position: 1, text: 'Second, for A' }],
			media: {
				assetIds: ['asset-2', 'asset-1'],
				altTexts: [{ assetId: 'asset-2', altText: 'A cat' }],
			},
		};
		const rendition = toTenantPublicationRendition(response);

		expect(rendition).toEqual({
			publicationId: 'pub-1',
			customized: true,
			overrides: {
				segments: [{ position: 1, text: 'Second, for A' }],
				media: {
					assetIds: ['asset-2', 'asset-1'],
					altTexts: [{ assetId: 'asset-2', altText: 'A cat' }],
				},
			},
		});
	});

	test('no media override is null, and a media override without assetIds keeps every image', () => {
		const inheriting: RenditionResponse = {
			publicationId: 'pub-1',
			customized: false,
			segments: [],
			media: null,
		};
		const altOnly: RenditionResponse = {
			publicationId: 'pub-1',
			customized: true,
			segments: [],
			media: { assetIds: null, altTexts: [] },
		};

		expect(toTenantPublicationRendition(inheriting)?.overrides).toEqual({
			segments: [],
			media: null,
		});
		expect(toTenantPublicationRendition(altOnly)?.overrides.media).toEqual({
			assetIds: null,
			altTexts: [],
		});
	});

	test('fails closed without a publication id, and drops malformed segments', () => {
		expect(toTenantPublicationRendition(null)).toBeNull();
		expect(toTenantPublicationRendition({})).toBeNull();
		expect(
			toTenantPublicationRendition({
				publicationId: 'pub-1',
				segments: [{ position: 0 }, { text: 'no position' }],
			})?.overrides.segments,
		).toEqual([]);
	});
});

describe('tenantPublicationRenditionQueryOptions', () => {
	test('reads GET rendition of exactly that publication, under a tenant-scoped key', async () => {
		const get = vi.fn().mockResolvedValue({ publicationId: 'pub-1' });
		stubClient({ get });

		const key = tenantPublicationRenditionQueryOptions.queryKey({
			publicationId: 'pub-1',
			tenantId,
		});
		await tenantPublicationRenditionQueryOptions.fetcher({
			publicationId: 'pub-1',
			tenantId,
		});

		expect(key[0]).toBe('tenant');
		expect(key).toContain(tenantId);
		expect(mocks.getOrCreateClient).toHaveBeenCalledWith(tenantId);
		expect(get).toHaveBeenCalledWith('pub-1');
	});
});

describe('useSavePublicationRenditionMutation', () => {
	test('PUTs the overrides and refreshes the rendition, the queue/calendar and history', async () => {
		const put = vi.fn().mockResolvedValue({});
		stubClient({ put });
		const { result, invalidate } = renderWithClient(() =>
			useSavePublicationRenditionMutation(),
		);

		result.current.mutate({
			tenantId,
			publicationId: 'pub-1',
			overrides: {
				segments: [{ position: 0, text: 'For B' }],
				media: { assetIds: ['asset-1'], altTexts: [] },
			},
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		const body = put.mock.calls[0]?.[1] as SetPublicationRenditionBody;
		expect(put.mock.calls[0]?.[0]).toBe('pub-1');
		expect(untypedNodeToJson(body.segments)).toEqual([
			{ position: 0, text: 'For B' },
		]);
		expect(untypedNodeToJson(body.media)).toEqual({
			assetIds: ['asset-1'],
			altTexts: [],
		});
		const families = invalidate.mock.calls.map(
			(call) => (call[0]?.queryKey as string[])[1],
		);
		expect(families).toEqual(
			expect.arrayContaining([
				'tenant-publication-rendition',
				'tenant-scheduled-publications',
				'tenant-publications',
			]),
		);
	});

	test('no overrides at all is an empty PUT body (the destination follows the shared post)', async () => {
		const put = vi.fn().mockResolvedValue({});
		stubClient({ put });
		const { result } = renderWithClient(() =>
			useSavePublicationRenditionMutation(),
		);

		result.current.mutate({
			tenantId,
			publicationId: 'pub-1',
			overrides: null,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(put.mock.calls[0]?.[1]).toEqual({});
	});

	test('a refused PUT (409/422) rejects so the editor can show the cause inline', async () => {
		const refusal = { responseStatusCode: 409 };
		stubClient({ put: vi.fn().mockRejectedValue(refusal) });
		const { result } = renderWithClient(() =>
			useSavePublicationRenditionMutation(),
		);

		await expect(
			result.current.mutateAsync({
				tenantId,
				publicationId: 'pub-1',
				overrides: null,
			}),
		).rejects.toBe(refusal);
	});
});

describe('useResetPublicationRenditionMutation', () => {
	test('DELETEs the rendition of exactly that publication and refreshes the same families', async () => {
		const del = vi.fn().mockResolvedValue({});
		stubClient({ delete: del });
		const { result, invalidate } = renderWithClient(() =>
			useResetPublicationRenditionMutation(),
		);

		result.current.mutate({ tenantId, publicationId: 'pub-1' });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(del).toHaveBeenCalledWith('pub-1');
		expect(invalidate).toHaveBeenCalledTimes(3);
	});
});
