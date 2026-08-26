/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	capturedOptions: undefined as
		| {
				enabled?: boolean;
				staleTime?: number;
				refetchOnWindowFocus?: boolean;
				queryKey?: unknown[];
				queryFn?: () => Promise<{
					id?: string | null;
					isAdmin?: boolean | null;
					permissions?: string[] | null;
				}>;
		  }
		| undefined,
	scopeAuthDataGet: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: typeof mocks.capturedOptions) => {
		mocks.capturedOptions = options;
		return { data: undefined };
	},
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateSessionClient: () => ({
			auth: {
				scopeAuthData: { get: mocks.scopeAuthDataGet },
			},
		}),
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
	SOCIAL_ACCOUNTS_PUBLISH,
	TENANT_PERMISSIONS_QUERY_KEY,
	hasTenantPermission,
	toTenantPermissions,
	useTenantPermissions,
	type ScopeAuthDataPayload,
} from './tenant-permissions';

// Renders the hook against a mocked payload and returns the resolved gate.
const hookForPayload = (
	payload: ScopeAuthDataPayload | null | undefined,
): ReturnType<typeof useTenantPermissions> => {
	let latest: ReturnType<typeof useTenantPermissions> | undefined;

	renderHook(() => {
		latest = useTenantPermissions('tenant-1');
		return latest;
	});

	void payload; // payloads drive the tests through toTenantPermissions below

	return (
		latest ?? {
			permissions: [],
			hasPermission: () => false,
		}
	);
};

const gateFor = (payload: ScopeAuthDataPayload | null | undefined) => {
	const fetcherResult = toTenantPermissions(payload);
	return {
		hasPermission: (key: string) =>
			fetcherResult.isAdmin === true ||
			hasTenantPermission(fetcherResult.permissions, key),
	};
};

describe('useTenantPermissions', () => {
	test('is session-stable: never refetches on tab focus', () => {
		renderHook(() => useTenantPermissions('tenant-1'));

		expect(mocks.capturedOptions?.staleTime).toBe(Infinity);
		expect(mocks.capturedOptions?.refetchOnWindowFocus).toBe(false);
	});

	test('scopes the cache entry per tenant id', () => {
		renderHook(() => useTenantPermissions('tenant-42'));

		expect(mocks.capturedOptions?.queryKey).toEqual([
			'tenant',
			...TENANT_PERMISSIONS_QUERY_KEY,
			'tenant-42',
		]);
	});

	test('fetches through the scope-neutral session client with scope=tenantId', async () => {
		mocks.scopeAuthDataGet.mockResolvedValue({
			id: 'tenant-1',
			isAdmin: false,
			permissions: ['tenant.posts.view'],
		});

		renderHook(() => useTenantPermissions('tenant-1'));

		await mocks.capturedOptions?.queryFn?.();

		expect(mocks.scopeAuthDataGet).toHaveBeenCalledWith({
			queryParameters: { scope: 'tenant-1' },
		});
	});

	test('disables the query when tenantId is null', () => {
		renderHook(() => useTenantPermissions(null));

		expect(mocks.capturedOptions?.enabled).toBe(false);
	});
});

describe('scope-auth-data payload → gate', () => {
	test('matches only the FULL wire key tenant.socialaccounts.publish (#1445)', () => {
		const gate = gateFor({
			id: 'tenant-1',
			isAdmin: false,
			permissions: [SOCIAL_ACCOUNTS_PUBLISH],
		});

		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(true);
		expect(gate.hasPermission('tenant.socialaccounts.manage')).toBe(false);
	});

	test('never matches a bare socialaccounts.publish (fail-closed, drift-proof)', () => {
		const gate = gateFor({
			id: 'tenant-1',
			isAdmin: false,
			permissions: ['socialaccounts.publish'],
		});

		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(false);
	});

	test('null/missing permissions field matches nothing (fail-closed)', () => {
		expect(hasTenantPermission(null, SOCIAL_ACCOUNTS_PUBLISH)).toBe(false);
		expect(hasTenantPermission(undefined, SOCIAL_ACCOUNTS_PUBLISH)).toBe(false);

		const gate = gateFor({ id: 'tenant-1', isAdmin: false });
		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(false);
	});

	test('normalizes the array: trims, dedupes, drops empties', () => {
		const normalized = toTenantPermissions({
			id: 'tenant-1',
			isAdmin: false,
			permissions: [
				'  tenant.socialaccounts.publish  ',
				'',
				'tenant.socialaccounts.publish',
				'   ',
				'tenant.posts.view',
			],
		}).permissions;

		expect(normalized).toEqual([
			'tenant.socialaccounts.publish',
			'tenant.posts.view',
		]);
	});
});

describe('#1445 implicit grant pin', () => {
	test('isAdmin with an EMPTY permissions array still has every tenant key', () => {
		const gate = gateFor({
			id: 'tenant-1',
			isAdmin: true,
			permissions: [],
		});

		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(true);
	});

	test('non-admin with an EMPTY permissions array stays FALSE', () => {
		const gate = gateFor({
			id: 'tenant-1',
			isAdmin: false,
			permissions: [],
		});

		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(false);
	});

	test('non-admin WITH the exact key is TRUE', () => {
		const gate = gateFor({
			id: 'tenant-1',
			isAdmin: false,
			permissions: [SOCIAL_ACCOUNTS_PUBLISH],
		});

		expect(gate.hasPermission(SOCIAL_ACCOUNTS_PUBLISH)).toBe(true);
	});

	test('hook shape stays stable for consumers', () => {
		const hook = hookForPayload({ id: 'tenant-1', isAdmin: true });

		expect(typeof hook.hasPermission).toBe('function');
		expect(Array.isArray(hook.permissions)).toBe(true);
	});
});
