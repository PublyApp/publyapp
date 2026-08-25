/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

// Mock ONLY the session query seam; the hook under test stays real.
const mocks = vi.hoisted(() => ({
	currentUser: undefined as
		| { tenantPermissionKeys: string[] }
		| null
		| undefined,
}));

vi.mock('~/lib/query/auth', () => ({
	useCurrentUserQuery: () => ({ data: mocks.currentUser }),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
	useCanManageSocialAccounts,
	useCanViewIntegrations,
	useHasTenantPermission,
} from './use-has-tenant-permission';

describe('useHasTenantPermission', () => {
	test('ItShouldReturnFalseWhileTheSessionLoads', () => {
		mocks.currentUser = undefined;

		const { result } = renderHook(() =>
			useHasTenantPermission('tenant.posts.view'),
		);

		expect(result.current).toBe(false);
	});

	test('ItShouldReturnFalseWithoutTheKey', () => {
		mocks.currentUser = { tenantPermissionKeys: ['tenant.posts.view'] };

		const { result } = renderHook(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		expect(result.current).toBe(false);
	});

	test('ItShouldReturnTrueWithTheKey', () => {
		mocks.currentUser = {
			tenantPermissionKeys: ['tenant.socialaccounts.manage'],
		};

		const { result } = renderHook(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		expect(result.current).toBe(true);
	});

	test('ItShouldReturnTrueForWildcardSentinelHolder', () => {
		mocks.currentUser = { tenantPermissionKeys: ['*'] };

		const { result } = renderHook(() =>
			useHasTenantPermission('tenant.socialaccounts.manage'),
		);

		expect(result.current).toBe(true);
	});

	test('ItShouldReturnFalseForEmptyKeySetEvenWhenCheckingAnyKey', () => {
		mocks.currentUser = { tenantPermissionKeys: [] };

		const { result } = renderHook(() =>
			useHasTenantPermission('tenant.socialaccounts.view'),
		);

		expect(result.current).toBe(false);
	});
});

describe('social slice convenience wrappers', () => {
	test('ItShouldGateManageOnTheManageKey', () => {
		mocks.currentUser = {
			tenantPermissionKeys: ['tenant.socialaccounts.manage'],
		};
		const manage = renderHook(() => useCanManageSocialAccounts());
		expect(manage.result.current).toBe(true);

		mocks.currentUser = {
			tenantPermissionKeys: ['tenant.socialaccounts.view'],
		};
		const viewOnly = renderHook(() => useCanManageSocialAccounts());
		expect(viewOnly.result.current).toBe(false);
	});

	test('ItShouldGateViewIntegrationsOnTheViewKeyOrWildcard', () => {
		mocks.currentUser = { tenantPermissionKeys: ['*'] };
		const wildcard = renderHook(() => useCanViewIntegrations());
		expect(wildcard.result.current).toBe(true);

		mocks.currentUser = { tenantPermissionKeys: [] };
		const none = renderHook(() => useCanViewIntegrations());
		expect(none.result.current).toBe(false);
	});
});
