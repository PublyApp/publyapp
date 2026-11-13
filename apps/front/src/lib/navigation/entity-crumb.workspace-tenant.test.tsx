/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	pickerGet: vi.fn(),
	postGet: vi.fn(),
	clientFor: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateTenantScopeClient: () => ({
			auth: { tenantsForPicker: { get: mocks.pickerGet } },
		}),
		getOrCreateClient: (tenantId: string) => ({
			posts: {
				byPostId: () => ({
					get: () => {
						mocks.clientFor(tenantId);
						return mocks.postGet();
					},
				}),
			},
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

import {
	selectTenantPostCrumbName,
	tenantPostCrumbQuery,
	tenantPostDetailsQueryOptions,
	useTenantPostDetailsQuery,
} from '~/lib/query/tenant-posts';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { EntityCrumb } from './entity-crumb';

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.clearAllMocks();
});

const PageDetails = ({ tenantId }: { tenantId: string }) => {
	useTenantPostDetailsQuery({ postId: 'post-1', tenantId });
	return null;
};

/** The page: resolves the tenant through the same hook, then reads the post. */
const PageStandIn = () => {
	const tenantId = useResolvedWorkspaceTenantId();
	return tenantId === null ? null : <PageDetails tenantId={tenantId} />;
};

describe('post crumb on a cold cache (#2410)', () => {
	test('shares the picker query and the page key, never a tenant-less one', async () => {
		mocks.pickerGet.mockResolvedValue({
			tenants: [{ id: 'tenant-1', name: 'T', code: 'T', status: 'Active' }],
			activeCount: 1,
			totalCount: 1,
		});
		mocks.postGet.mockResolvedValue({ id: 'post-1', body: 'Launch day' });
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<EntityCrumb
					spec={{
						kind: 'entity',
						workspaceTenant: true,
						query: tenantPostCrumbQuery,
						select: selectTenantPostCrumbName,
					}}
					params={{ postId: 'post-1' }}
				/>
				<PageStandIn />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				screen.getByTestId('app-shell-breadcrumb-entity-name'),
			).toBeTruthy();
		});
		expect(screen.getByText('Launch day')).toBeTruthy();
		// One picker request, one post request, for the resolved tenant.
		expect(mocks.pickerGet).toHaveBeenCalledTimes(1);
		expect(mocks.postGet).toHaveBeenCalledTimes(1);
		expect(mocks.clientFor).toHaveBeenCalledWith('tenant-1');
		// Key equality with the page's own query key.
		const pageKey = tenantPostDetailsQueryOptions.queryKey({
			postId: 'post-1',
			tenantId: 'tenant-1',
		});
		expect(queryClient.getQueryData(pageKey)).toBeTruthy();
		expect(
			queryClient
				.getQueryCache()
				.findAll()
				// The disabled placeholder the crumb holds until the tenant resolves
				// never fetches (one post request above).
				.filter(
					(q) =>
						JSON.stringify(q.queryKey).includes('tenant-posts') &&
						!JSON.stringify(q.queryKey).includes('crumb-pending'),
				)
				.map((q) => JSON.stringify(q.queryKey)),
		).toEqual([JSON.stringify(pageKey)]);
	});
});
