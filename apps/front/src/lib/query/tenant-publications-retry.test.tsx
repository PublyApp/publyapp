/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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
	useMarkPublicationPublishedMutation,
	useRetryPublicationMutation,
} from '~/lib/query/tenant-publications';

const tenantId = '11111111-1111-1111-1111-111111111111';

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={new QueryClient()}>
		{children}
	</QueryClientProvider>
);

const stubClient = (post: (publicationId: string) => Promise<object>) =>
	mocks.getOrCreateClient.mockReturnValue({
		posts: {
			publications: {
				byPublicationId: (publicationId: string) => ({
					retry: { post: () => post(publicationId) },
				}),
			},
		},
	});

beforeEach(() => {
	vi.clearAllMocks();
});

describe('useRetryPublicationMutation', () => {
	test('posts the retry for exactly the given publication', async () => {
		const post = vi.fn().mockResolvedValue({});
		stubClient(post);
		const { result } = renderHook(() => useRetryPublicationMutation(), {
			wrapper,
		});

		result.current.mutate({ tenantId, publicationId: 'pub-1' });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mocks.getOrCreateClient).toHaveBeenCalledWith(tenantId);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith('pub-1');
	});
});

describe('useMarkPublicationPublishedMutation', () => {
	test('posts mark-published for exactly the given publication', async () => {
		const post = vi.fn().mockResolvedValue({});
		mocks.getOrCreateClient.mockReturnValue({
			posts: {
				publications: {
					byPublicationId: (publicationId: string) => ({
						markPublished: { post: () => post(publicationId) },
					}),
				},
			},
		});
		const { result } = renderHook(() => useMarkPublicationPublishedMutation(), {
			wrapper,
		});

		result.current.mutate({ tenantId, publicationId: 'pub-1' });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mocks.getOrCreateClient).toHaveBeenCalledWith(tenantId);
		expect(post).toHaveBeenCalledWith('pub-1');
	});
});
