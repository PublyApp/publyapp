/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	workspaceTenantId: undefined as string | null | undefined,
	userAuthDataGet: vi.fn(),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => mocks.workspaceTenantId,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateSessionClient: () => ({
			auth: { userAuthData: { get: mocks.userAuthDataGet } },
		}),
	}),
}));

import {
	useCanManageSocialAccounts,
	useCanViewIntegrations,
	useHasTenantPermission,
} from './use-has-tenant-permission';

let activeQueryClient: QueryClient | undefined;

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	activeQueryClient = queryClient;
	return ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
};

const renderWithQueryClient = <TProps, TResult>(
	hook: (props: TProps) => TResult,
) => renderHook(hook, { wrapper: createWrapper() });

afterEach(async () => {
	await activeQueryClient?.cancelQueries();
	await cleanup();
	activeQueryClient = undefined;
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.workspaceTenantId = 'tenant-1';
	mocks.userAuthDataGet.mockResolvedValue({
		tenantPermissionKeys: ['*'],
	});
});

describe('useHasTenantPermission', () => {
	test('ItShouldFetchAuthDataScopedToTheWorkspaceTenant', async () => {
		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		await waitFor(() => expect(result.current).toBe(true));

		expect(mocks.userAuthDataGet).toHaveBeenCalledWith({
			queryParameters: { tenantId: 'tenant-1' },
		});
	});

	test('ItShouldReturnFalseWhileTheKeysLoad', () => {
		mocks.userAuthDataGet.mockReturnValue(new Promise(() => {}));

		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.posts.view'),
		);

		expect(result.current).toBe(false);
		expect(mocks.userAuthDataGet).toHaveBeenCalled();
	});

	test('ItShouldReturnFalseWithoutTheKey', async () => {
		mocks.userAuthDataGet.mockResolvedValue({
			tenantPermissionKeys: ['tenant.posts.view'],
		});

		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		await waitFor(() => expect(mocks.userAuthDataGet).toHaveBeenCalledTimes(1));
		expect(result.current).toBe(false);
	});

	test('ItShouldReturnTrueWithTheExactKey', async () => {
		mocks.userAuthDataGet.mockResolvedValue({
			tenantPermissionKeys: ['tenant.socialaccounts.manage'],
		});

		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		await waitFor(() => expect(result.current).toBe(true));
	});

	test('ItShouldStayIdleWithoutAWorkspaceTenant', () => {
		mocks.workspaceTenantId = null;

		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		expect(result.current).toBe(false);
		expect(mocks.userAuthDataGet).not.toHaveBeenCalled();
	});

	test('ItShouldReturnFalseForEmptyKeySet', async () => {
		mocks.userAuthDataGet.mockResolvedValue({ tenantPermissionKeys: [] });

		const { result } = renderWithQueryClient(() =>
			useHasTenantPermission('tenant.socialaccounts.view'),
		);

		await waitFor(() => expect(mocks.userAuthDataGet).toHaveBeenCalledTimes(1));
		expect(result.current).toBe(false);
	});
});

describe('social slice convenience wrappers', () => {
	test('ItShouldGateManageOnTheManageKey', async () => {
		mocks.userAuthDataGet.mockResolvedValue({
			tenantPermissionKeys: ['tenant.socialaccounts.manage'],
		});
		const manage = renderWithQueryClient(() => useCanManageSocialAccounts());
		await waitFor(() => expect(manage.result.current).toBe(true));

		mocks.userAuthDataGet.mockResolvedValue({
			tenantPermissionKeys: ['tenant.socialaccounts.view'],
		});
		const viewOnly = renderWithQueryClient(() => useCanManageSocialAccounts());
		await waitFor(() => expect(viewOnly.result.current).toBe(false));
	});

	test('ItShouldGateViewIntegrationsOnTheViewKeyOrWildcard', async () => {
		mocks.userAuthDataGet.mockResolvedValue({ tenantPermissionKeys: ['*'] });
		const wildcard = renderWithQueryClient(() => useCanViewIntegrations());
		await waitFor(() => expect(wildcard.result.current).toBe(true));

		mocks.userAuthDataGet.mockResolvedValue({ tenantPermissionKeys: [] });
		const none = renderWithQueryClient(() => useCanViewIntegrations());
		await waitFor(() => expect(none.result.current).toBe(false));
	});
});
