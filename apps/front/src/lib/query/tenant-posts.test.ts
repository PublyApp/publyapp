/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	patch: vi.fn(),
	delete: vi.fn(),
	invalidateTenantPublications: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => ({
			posts: {
				byPostId: () => ({
					patch: mocks.patch,
					delete: mocks.delete,
				}),
				post: mocks.patch,
			},
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	invalidateTenantPublications: mocks.invalidateTenantPublications,
}));

import type {
	FindPostsForTenantResponse,
	PostDetail,
} from '@org/client-ts/models/index';

import {
	buildFindTenantPostsQueryParameters,
	toTenantPostRows,
	toTenantPostDetails,
	useSavePostMutation,
	useDeleteTenantPostMutation,
} from './tenant-posts';
import { TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY } from './tenant-scheduled-publications';

let activeQueryClient: QueryClient | undefined;

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	activeQueryClient = queryClient;
	return ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
};

afterEach(async () => {
	await activeQueryClient?.cancelQueries();
	await cleanup();
	activeQueryClient = undefined;
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.patch.mockResolvedValue({
		id: '11111111-1111-7111-8111-111111111111',
		body: 'Updated body',
		projectId: null,
		status: 'draft',
		createdByUserId: '22222222-2222-7222-8222-222222222222',
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-02T00:00:00Z'),
	});
	mocks.delete.mockResolvedValue(undefined);
	mocks.invalidateTenantPublications.mockResolvedValue(undefined);
});

describe('tenant-posts helpers', () => {
	test('drops empty q and maps size to limit', () => {
		const params = buildFindTenantPostsQueryParameters({
			q: '  ',
			size: 20,
			sortId: 'created_at',
			sortOrder: 'desc',
		});

		expect(params).toEqual({
			sortId: 'created_at',
			sortOrder: 'desc',
			limit: '20',
		});
		expect(params.q).toBeUndefined();
	});

	test('preserves non-empty q and cursor', () => {
		const params = buildFindTenantPostsQueryParameters({
			q: 'hello',
			cursor: 'abc-123',
			size: 10,
			sortId: 'updated_at',
			sortOrder: 'asc',
		});

		expect(params.q).toBe('hello');
		expect(params.cursor).toBe('abc-123');
		expect(params.limit).toBe('10');
	});

	test('maps undefined size to undefined limit', () => {
		const params = buildFindTenantPostsQueryParameters({});
		expect(params.limit).toBeUndefined();
	});

	test('toTenantPostRows filters malformed rows and truncates no further than server preview', () => {
		const rows = toTenantPostRows({
			data: [
				{
					id: '11111111-1111-7111-8111-111111111111',
					bodyPreview: 'hello',
					status: 'draft',
					projectId: null,
					createdByUserId: '22222222-2222-7222-8222-222222222222',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					id: null,
					bodyPreview: 'no-id',
				},
				{
					id: '33333333-3333-7333-8333-333333333333',
					bodyPreview: '',
				},
			],
		} as FindPostsForTenantResponse);

		expect(rows).toHaveLength(1);
		expect(rows[0].excerpt).toBe('hello');
		expect(rows[0].id).toBe('11111111-1111-7111-8111-111111111111');
	});

	test('toTenantPostRows handles null/undefined input', () => {
		expect(toTenantPostRows(null)).toEqual([]);
		expect(toTenantPostRows(undefined)).toEqual([]);
	});

	test('toTenantPostDetails returns null for missing id or body', () => {
		expect(
			toTenantPostDetails({
				id: '11111111-1111-7111-8111-111111111111',
				body: null,
			} as PostDetail),
		).toBeNull();
		expect(
			toTenantPostDetails({
				id: null,
				body: 'has body',
			} as PostDetail),
		).toBeNull();
		expect(toTenantPostDetails(null)).toBeNull();
	});

	test('toTenantPostDetails maps fields correctly', () => {
		const details = toTenantPostDetails({
			id: '11111111-1111-7111-8111-111111111111',
			body: 'Test body',
			projectId: '22222222-2222-7222-8222-222222222222',
			status: 'draft',
			createdByUserId: '33333333-3333-7333-8333-333333333333',
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-02T00:00:00Z'),
		} as PostDetail);

		expect(details).not.toBeNull();
		expect(details!.id).toBe('11111111-1111-7111-8111-111111111111');
		expect(details!.body).toBe('Test body');
		expect(details!.projectId).toBe('22222222-2222-7222-8222-222222222222');
		expect(details!.status).toBe('draft');
	});
});

describe('useSavePostMutation invalidation coherence', () => {
	test('invalidates scheduled-publication windows for the saved tenant', async () => {
		createWrapper();
		const queryClient = activeQueryClient as QueryClient;
		const invalidateQueriesSpy = vi
			.spyOn(queryClient, 'invalidateQueries')
			.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSavePostMutation(), {
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		});

		await result.current.mutateAsync({
			postId: '11111111-1111-7111-8111-111111111111',
			body: 'Updated body',
			projectId: null,
			tenantId: 'tenant-1',
		});

		await waitFor(() => {
			const calls = invalidateQueriesSpy.mock.calls;
			const scheduledCall = calls.find(([arg]) => {
				const key = (arg as { queryKey?: unknown[] })?.queryKey;
				return (
					Array.isArray(key) &&
					key.includes(TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY[0])
				);
			});
			expect(scheduledCall).toBeDefined();
		});
	});

	test('invalidates the tenant-publications history for the saved tenant', async () => {
		createWrapper();
		const queryClient = activeQueryClient as QueryClient;

		const { result } = renderHook(() => useSavePostMutation(), {
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		});

		await result.current.mutateAsync({
			postId: '11111111-1111-1111-1111-111111111111',
			body: 'Updated body',
			projectId: null,
			tenantId: 'tenant-1',
		});

		await waitFor(() => {
			expect(mocks.invalidateTenantPublications).toHaveBeenCalledWith(
				queryClient,
				'tenant-1',
			);
		});
	});

	test('keeps invalidating the existing tenant-posts list and detail families', async () => {
		createWrapper();
		const queryClient = activeQueryClient as QueryClient;
		const invalidateQueriesSpy = vi
			.spyOn(queryClient, 'invalidateQueries')
			.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSavePostMutation(), {
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		});

		await result.current.mutateAsync({
			postId: '11111111-1111-7111-8111-111111111111',
			body: 'Updated body',
			projectId: null,
			tenantId: 'tenant-1',
		});

		await waitFor(() => {
			const calls = invalidateQueriesSpy.mock.calls;
			const postsCall = calls.find(([arg]) => {
				const key = (arg as { queryKey?: unknown[] })?.queryKey;
				return (
					Array.isArray(key) &&
					key.includes('tenant-posts') &&
					!key.includes('detail') &&
					!key.includes(TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY[0])
				);
			});
			const detailCall = calls.find(([arg]) => {
				const key = (arg as { queryKey?: unknown[] })?.queryKey;
				return Array.isArray(key) && key.includes('detail');
			});
			expect(postsCall).toBeDefined();
			expect(detailCall).toBeDefined();
		});
	});

	test('invalidates the tenant-publications history for the deleted tenant', async () => {
		createWrapper();
		const queryClient = activeQueryClient as QueryClient;

		const { result } = renderHook(() => useDeleteTenantPostMutation(), {
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		});

		await result.current.mutateAsync({
			postId: '11111111-1111-1111-1111-111111111111',
			tenantId: 'tenant-1',
		});

		await waitFor(() => {
			expect(mocks.invalidateTenantPublications).toHaveBeenCalledWith(
				queryClient,
				'tenant-1',
			);
		});
	});

	test('keeps invalidating scheduled-publication windows for the deleted tenant', async () => {
		createWrapper();
		const queryClient = activeQueryClient as QueryClient;
		const invalidateQueriesSpy = vi
			.spyOn(queryClient, 'invalidateQueries')
			.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDeleteTenantPostMutation(), {
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		});

		await result.current.mutateAsync({
			postId: '11111111-1111-1111-1111-111111111111',
			tenantId: 'tenant-1',
		});

		await waitFor(() => {
			const scheduledCall = invalidateQueriesSpy.mock.calls.find(([arg]) => {
				const key = (arg as { queryKey?: unknown[] })?.queryKey;
				return (
					Array.isArray(key) &&
					key.includes(TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY[0])
				);
			});
			expect(scheduledCall).toBeDefined();
		});
	});
});
