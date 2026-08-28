import { QueryClient } from '@tanstack/react-query';
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
	buildFindTenantPublicationsQueryParameters,
	invalidateTenantPublications,
	isTenantPublicationStatus,
	publishNowMutation,
	tenantPublicationsQueryOptions,
	TENANT_PUBLICATIONS_QUERY_KEY,
	toTenantPublicationRows,
} from '~/lib/query/tenant-publications';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('publishNowMutation', () => {
	const tenantId = '11111111-1111-1111-1111-111111111111';
	const postId = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

	const stubPost = () => vi.fn().mockResolvedValue({});

	const stubClient = (post: ReturnType<typeof stubPost>) =>
		mocks.getOrCreateClient.mockReturnValue({
			posts: {
				byPostId: (id: string) => ({
					publishNow: { post },
					postId: id,
				}),
			},
		});

	test('fires publish-now carrying the selected account ids as untyped array', async () => {
		const post = stubPost();
		stubClient(post);

		await publishNowMutation.mutationFn({
			postId,
			accountIds: ['01890a5d-ac96-774b-bcce-b302099a8057'],
			tenantId,
		});

		expect(mocks.getOrCreateClient).toHaveBeenCalledWith(tenantId);
		expect(post).toHaveBeenCalledTimes(1);
		const body = post.mock.calls[0]?.[0] as {
			accountIds?: unknown;
		};
		expect(body.accountIds).toBeDefined();
	});

	test('omits accountIds when no target is checked', async () => {
		const post = stubPost();
		stubClient(post);

		await publishNowMutation.mutationFn({
			postId,
			accountIds: [],
			tenantId,
		});

		const body = post.mock.calls[0]?.[0] as {
			accountIds?: unknown;
		};
		expect(body.accountIds ?? null).toBeNull();
	});
});

describe('buildFindTenantPublicationsQueryParameters', () => {
	test('trims, filters to the wire vocabulary, dedupes, and joins statuses as ONE csv param', () => {
		expect(
			buildFindTenantPublicationsQueryParameters({
				statuses: [' published ', 'bogus', 'failed', 'failed'],
				cursor: ' cursor-123 ',
				limit: 50,
			}),
		).toEqual({
			status: 'published,failed',
			cursor: 'cursor-123',
			limit: '50',
		});
	});

	test('omits every param when variables carry nothing usable', () => {
		expect(
			buildFindTenantPublicationsQueryParameters({
				statuses: ['', '   '],
				cursor: '  ',
				limit: 0,
			}),
		).toEqual({});
	});
});

describe('isTenantPublicationStatus', () => {
	test('accepts exactly the PublicationWire.FormatStatus vocabulary', () => {
		for (const status of [
			'scheduled',
			'in_progress',
			'published',
			'failed',
			'paused',
		]) {
			expect(isTenantPublicationStatus(status)).toBe(true);
		}
	});

	test('rejects drift: casing, whitespace, unknown words', () => {
		for (const status of ['Published', 'published ', '', 'done']) {
			expect(isTenantPublicationStatus(status)).toBe(false);
		}
	});
});

describe('toTenantPublicationRows', () => {
	test('maps list items and keeps cause/url/status verbatim', () => {
		const updatedAt = new Date('2026-08-25T10:00:00Z');

		const rows = toTenantPublicationRows({
			data: [
				{
					id: '0198c7a2-0000-7000-8000-000000000001',
					postId: '0198c7a2-0000-7000-8000-000000000002',
					socialAccountId: '0198c7a2-0000-7000-8000-000000000003',
					accountLabel: '@team.publyapp.dev',
					postExcerpt: 'Hello world',
					status: 'published',
					externalUrl: 'https://bsky.app/profile/team.publyapp.dev/post/1',
					lastError: null,
					updatedAt,
				},
				{
					id: '0198c7a2-0000-7000-8000-000000000004',
					status: 'failed',
					lastError: 'Bluesky refused the credentials',
				},
			],
			nextCursor: undefined,
		});

		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			id: '0198c7a2-0000-7000-8000-000000000001',
			postId: '0198c7a2-0000-7000-8000-000000000002',
			socialAccountId: '0198c7a2-0000-7000-8000-000000000003',
			accountLabel: '@team.publyapp.dev',
			postExcerpt: 'Hello world',
			status: 'published',
			externalUrl: 'https://bsky.app/profile/team.publyapp.dev/post/1',
			lastError: null,
			updatedAt,
		});
		expect(rows[1].status).toBe('failed');
		expect(rows[1].lastError).toBe('Bluesky refused the credentials');
	});

	test('drops rows without an id and survives an empty payload', () => {
		expect(toTenantPublicationRows({ data: [{ status: 'paused' }] })).toEqual(
			[],
		);
		expect(toTenantPublicationRows(null)).toEqual([]);
		expect(toTenantPublicationRows(undefined)).toEqual([]);
	});
});

describe('tenantPublicationsQueryOptions', () => {
	test('scopes the cache key under the tenant scope factory', () => {
		const key = tenantPublicationsQueryOptions.queryKey({
			tenantId: 'tenant-1',
			statuses: ['published'],
		});

		expect(key[0]).toBe('tenant');
		expect(key).toContain(TENANT_PUBLICATIONS_QUERY_KEY[0]);
		expect(key).toContain('tenant-1');
	});

	test('fetcher hits publishing.publications.get through the tenant client', async () => {
		const get = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
		mocks.getOrCreateClient.mockReturnValue({
			publishing: { publications: { get } },
		});

		const result = await tenantPublicationsQueryOptions.fetcher({
			tenantId: 'tenant-1',
			statuses: ['published', 'failed'],
			limit: 100,
		});

		expect(mocks.getOrCreateClient).toHaveBeenCalledWith('tenant-1');
		expect(get).toHaveBeenCalledWith({
			queryParameters: {
				status: 'published,failed',
				limit: '100',
			},
		});
		expect(result).toEqual({ data: [], nextCursor: null });
	});
});

describe('invalidateTenantPublications', () => {
	test('invalidates the tenant-scoped publications family', async () => {
		const queryClient = new QueryClient();
		const invalidateQueries = vi
			.spyOn(queryClient, 'invalidateQueries')
			.mockResolvedValue(undefined);

		await invalidateTenantPublications(queryClient, 'tenant-1');

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: expect.arrayContaining([
				'tenant',
				TENANT_PUBLICATIONS_QUERY_KEY[0],
				'tenant-1',
			]),
		});
	});
});
