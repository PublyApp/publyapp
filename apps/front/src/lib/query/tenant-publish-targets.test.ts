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
	invalidateTenantPublishTargets,
	tenantPublishTargetsQueryOptions,
	TENANT_PUBLISH_TARGETS_QUERY_KEY,
	toTenantPublishTargets,
	useTenantPublishTargetsQuery,
} from '~/lib/query/tenant-publish-targets';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('TENANT_PUBLISH_TARGETS_QUERY_KEY', () => {
	test('is a stable, unscoped key base', () => {
		expect([...TENANT_PUBLISH_TARGETS_QUERY_KEY]).toEqual([
			'tenant-publish-targets',
		]);
	});
});

describe('toTenantPublishTargets', () => {
	test('maps items keeping id, label and provider verbatim', () => {
		const rows = toTenantPublishTargets({
			items: [
				{
					id: '01890a5d-ac96-774b-bcce-b302099a8057' as never,
					label: 'Acme main',
					provider: 'bluesky',
				},
			],
		});

		expect(rows).toEqual([
			{
				id: '01890a5d-ac96-774b-bcce-b302099a8057',
				label: 'Acme main',
				provider: 'bluesky',
			},
		]);
	});

	test('fails closed: drops rows without an id or with an unknown provider', () => {
		const rows = toTenantPublishTargets({
			items: [
				{ id: undefined, label: 'no id', provider: 'bluesky' },
				{
					id: '01890a5d-ac96-774b-bcce-b302099a8058' as never,
					label: 'unknown provider',
					provider: 'twitter',
				},
				null,
			] as never,
		});

		expect(rows).toEqual([]);
	});

	test('survives a missing payload', () => {
		expect(toTenantPublishTargets(null)).toEqual([]);
		expect(toTenantPublishTargets(undefined)).toEqual([]);
	});
});

describe('tenantPublishTargetsQueryOptions', () => {
	test('fetcher passes the project scope filter to the publish-targets endpoint', async () => {
		const get = vi.fn().mockResolvedValue({ items: [] });
		mocks.getOrCreateClient.mockReturnValue({
			publishing: { publishTargets: { get } },
		});
		const tenantId = '11111111-1111-1111-1111-111111111111';
		const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

		await tenantPublishTargetsQueryOptions.fetcher({
			tenantId,
			projectId,
		});

		expect(mocks.getOrCreateClient).toHaveBeenCalledWith(tenantId);
		expect(get).toHaveBeenCalledWith({
			queryParameters: { projectId },
		});
	});

	test('fetcher omits the project filter for personal drafts', async () => {
		const get = vi.fn().mockResolvedValue({ items: [] });
		mocks.getOrCreateClient.mockReturnValue({
			publishing: { publishTargets: { get } },
		});

		await tenantPublishTargetsQueryOptions.fetcher({
			tenantId: '11111111-1111-1111-1111-111111111111',
			projectId: null,
		});

		expect(get).toHaveBeenCalledWith({});
	});
});

describe('invalidateTenantPublishTargets', () => {
	test('invalidates through the tenant-scoped key', () => {
		const qc = new QueryClient();
		const spy = vi.spyOn(qc, 'invalidateQueries');

		invalidateTenantPublishTargets(qc, '11111111-1111-1111-1111-111111111111');

		expect(spy).toHaveBeenCalledWith({
			queryKey: [
				'tenant',
				'tenant-publish-targets',
				'11111111-1111-1111-1111-111111111111',
			],
			exact: true,
		});
	});
});

describe('useTenantPublishTargetsQuery', () => {
	test('is exported for the composer block', () => {
		expect(useTenantPublishTargetsQuery).toBeTypeOf('function');
	});
});
