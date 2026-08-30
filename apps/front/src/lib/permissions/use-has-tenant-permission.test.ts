/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock ONLY the infrastructure seams (workspace resolution + API client);
// useQuery and the hook under test stay REAL so the tests prove the actual
// query wiring — including that the auth-data fetch is scoped with
// ?tenant_id= (C3 defect 5: an unscoped call returns [] and gates everything
// closed).
const mocks = vi.hoisted(() => ({
	workspaceTenantId: undefined as string | null | undefined,
	userAuthDataGet: vi.fn(),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => mocks.workspaceTenantId,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		// The session-neutral client — same factory the production hook must
		// use, since neither a staff-only nor a tenant-header client applies
		// to /auth/user-auth-data (it takes ?tenant_id= instead).
		getOrCreateSessionClient: () => ({
			auth: { userAuthData: { get: mocks.userAuthDataGet } },
		}),
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
	useCanManageSocialAccounts,
	useHasTenantPermission,
} from './use-has-tenant-permission';

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	// createElement, not JSX: this spec stays a `.test.ts` sibling of the
	// hook per the plan's File Map.
	return ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
};

// Every render goes through a fresh QueryClient so the REAL useQuery wiring
// runs; no shared cache can mask an unscoped fetch.
const renderWithQueryClient = <TProps, TResult>(
	hook: (props: TProps) => TResult,
) => renderHook(hook, { wrapper: createWrapper() });

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
		// No workspace scope resolved → the request must not fire at all; the
		// backend would answer [] for an unscoped call (gate closed by design).
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
});
