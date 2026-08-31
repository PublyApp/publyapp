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

const requireScheduledPublicationsModule = async () => {
	return import('./tenant-scheduled-publications');
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('scheduled-publications query parameters', () => {
	test('serializes the ISO window and one validated scalar status CSV', async () => {
		const { buildFindScheduledPublicationsQueryParameters } =
			await requireScheduledPublicationsModule();

		expect(
			buildFindScheduledPublicationsQueryParameters({
				from: new Date('2026-08-01T00:00:00.000Z'),
				to: new Date('2026-08-31T23:59:59.999Z'),
				statuses: [' scheduled ', 'bogus', 'in_progress', 'scheduled'],
				cursor: ' cursor-2 ',
				limit: 50,
			}),
		).toEqual({
			from: '2026-08-01T00:00:00.000Z',
			to: '2026-08-31T23:59:59.999Z',
			status: 'scheduled,in_progress',
			cursor: 'cursor-2',
			limit: '50',
		});
	});
});

describe('scheduled-publication row mapping', () => {
	test('keeps backend order and rejects rows without stable identity or dates', async () => {
		const { toScheduledPublicationRows } =
			await requireScheduledPublicationsModule();
		const firstInstant = new Date('2026-08-20T13:30:00.000Z');
		const secondInstant = new Date('2026-08-20T14:30:00.000Z');

		const rows = toScheduledPublicationRows({
			data: [
				{
					publicationId: 'pub-2',
					postId: 'post-2',
					postBodyPreview: 'Second from the backend',
					accountDisplayHandle: '@second.example',
					status: 'paused',
					postStatus: 'partial',
					scheduledAtUtc: secondInstant,
					scheduledAtLocal: '2026-08-20T16:30:00+02:00',
					timeZone: 'Europe/Paris',
				},
				{
					publicationId: 'pub-1',
					postId: 'post-1',
					postBodyPreview: 'First by id, second in payload',
					accountDisplayHandle: '@first.example',
					status: 'scheduled',
					postStatus: 'scheduled',
					scheduledAtUtc: firstInstant,
					scheduledAtLocal: '2026-08-20T15:30:00+02:00',
					timeZone: 'Europe/Paris',
				},
				{
					postId: 'post-without-publication',
					scheduledAtUtc: firstInstant,
					scheduledAtLocal: '2026-08-20T15:30:00+02:00',
				},
				{
					publicationId: 'pub-without-date',
					scheduledAtLocal: 'not-a-local-date',
				},
				{
					publicationId: 'pub-with-invalid-local-date',
					scheduledAtUtc: firstInstant,
					scheduledAtLocal: 'not-a-local-date',
				},
			],
		});

		expect(rows.map((row) => row.id)).toEqual(['pub-2', 'pub-1']);
		expect(rows[0]).toMatchObject({
			publicationId: 'pub-2',
			postBodyPreview: 'Second from the backend',
			scheduledAtUtc: secondInstant,
			scheduledAtLocal: '2026-08-20T16:30:00+02:00',
			timeZone: 'Europe/Paris',
		});
	});
});

describe('scheduledPublicationsQueryOptions', () => {
	test('uses a tenant-scoped key and calls posts.publications.get', async () => {
		const {
			scheduledPublicationsQueryOptions,
			TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY,
		} = await requireScheduledPublicationsModule();
		const get = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
		mocks.getOrCreateClient.mockReturnValue({
			posts: { publications: { get } },
		});
		const variables = {
			tenantId: 'tenant-1',
			from: new Date('2026-08-01T00:00:00.000Z'),
			to: new Date('2026-08-31T23:59:59.999Z'),
			statuses: ['scheduled', 'paused'],
			limit: 100,
		};

		const key = scheduledPublicationsQueryOptions.queryKey(variables);
		const result = await scheduledPublicationsQueryOptions.fetcher(variables);

		expect(key[0]).toBe('tenant');
		expect(key).toContain(TENANT_SCHEDULED_PUBLICATIONS_QUERY_KEY[0]);
		expect(key).toContain('tenant-1');
		expect(mocks.getOrCreateClient).toHaveBeenCalledWith('tenant-1');
		expect(get).toHaveBeenCalledWith({
			queryParameters: {
				from: '2026-08-01T00:00:00.000Z',
				to: '2026-08-31T23:59:59.999Z',
				status: 'scheduled,paused',
				limit: '100',
			},
		});
		expect(result).toEqual({ data: [], nextCursor: null });
	});
});
