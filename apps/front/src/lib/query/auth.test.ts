/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	capturedOptions: undefined as
		| {
				staleTime?: number;
				refetchOnWindowFocus?: boolean;
				queryFn?: () => void;
				meta?: { skipAuthedErrorBackstop?: boolean };
		  }
		| undefined,
	userAuthDataGet: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: typeof mocks.capturedOptions) => {
		mocks.capturedOptions = options;
		return { data: undefined };
	},
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	// Only a session-neutral client is exposed here — no
	// `getOrCreateStaffClient` — so a regression back to the staff-only
	// factory would throw at fetch time instead of silently 401ing.
	getClientManager: () => ({
		getOrCreateSessionClient: () => ({
			auth: { userAuthData: { get: mocks.userAuthDataGet } },
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { toCurrentUser, useCurrentUserQuery } from './auth';

describe('useCurrentUserQuery', () => {
	test('is session-stable: never refetches on tab focus', () => {
		renderHook(() => useCurrentUserQuery());

		expect(mocks.capturedOptions?.staleTime).toBe(Infinity);
		expect(mocks.capturedOptions?.refetchOnWindowFocus).toBe(false);
	});

	test('reads through the scope-neutral session client, not a staff-only one (r3-shell-F3)', async () => {
		mocks.userAuthDataGet.mockResolvedValue({
			id: 'tenant-user-1',
			email: 'tenant-user@example.com',
		});

		renderHook(() => useCurrentUserQuery());

		await mocks.capturedOptions?.queryFn?.();

		expect(mocks.userAuthDataGet).toHaveBeenCalled();
	});

	// shell-r6-F2: the auth surface (accept-invitation) reuses this
	// scope-agnostic query where a 401 is expected — it must opt the query
	// out of the central authed-error backstop regardless of pathname.
	test('carries no backstop opt-out by default (authed consumers, e.g. the user menu)', () => {
		renderHook(() => useCurrentUserQuery());

		expect(mocks.capturedOptions?.meta).toBeUndefined();
	});

	test('sets meta.skipAuthedErrorBackstop when used on the auth surface', () => {
		renderHook(() => useCurrentUserQuery({ authSurface: true }));

		expect(mocks.capturedOptions?.meta).toEqual({
			skipAuthedErrorBackstop: true,
		});
	});
});

describe('toCurrentUser', () => {
	test('normalizes a full auth-data result into a display-ready user', () => {
		expect(
			toCurrentUser({
				id: 'user-1',
				email: '  Jane@Example.com  ',
				firstName: ' Jane ',
				lastName: ' Doe ',
				avatarUrl: 'https://cdn.example.com/jane.png',
			}),
		).toEqual({
			id: 'user-1',
			email: 'Jane@Example.com',
			firstName: 'Jane',
			lastName: 'Doe',
			avatarUrl: 'https://cdn.example.com/jane.png',
			displayName: 'Jane Doe',
			tenantPermissionKeys: [],
		});
	});

	test('carries the effective tenant permission keys through (C3 gating)', () => {
		// The raw generated model allows null holes in the list; a fixture
		// carrying one must survive as a filtered, precise string array.
		const rawKeys: Array<string | null> = ['*', null, '', 'tenant.posts.view'];
		expect(
			toCurrentUser({
				id: 'user-perms',
				email: 'perms@example.com',
				firstName: null,
				lastName: null,
				avatarUrl: null,
				tenantPermissionKeys: rawKeys,
			})?.tenantPermissionKeys,
		).toEqual(['*', 'tenant.posts.view']);

		// Absent list (older payload shape) normalises to an empty array.
		expect(
			toCurrentUser({
				id: 'user-noperms',
				email: 'noperms@example.com',
			})?.tenantPermissionKeys,
		).toEqual([]);
	});

	test('returns null when the id is missing (loading/empty state)', () => {
		expect(toCurrentUser(undefined)).toBeNull();
		expect(toCurrentUser(null)).toBeNull();
		expect(toCurrentUser({ email: 'no-id@example.com' })).toBeNull();
	});

	test('resolves a root-relative /files/ avatarUrl against the API origin', () => {
		expect(
			toCurrentUser({
				id: 'user-3',
				email: 'root-relative@example.com',
				firstName: 'Rae',
				lastName: 'Lee',
				avatarUrl: '/files/uploads/2026/07/avatar.png',
			})?.avatarUrl,
		).toBe('https://api.example.test/files/uploads/2026/07/avatar.png');
	});

	test('falls back to a null displayName and avatarUrl when the user has no name or avatar', () => {
		expect(
			toCurrentUser({
				id: 'user-2',
				email: 'no-name@example.com',
				firstName: null,
				lastName: null,
				avatarUrl: null,
			}),
		).toEqual({
			id: 'user-2',
			email: 'no-name@example.com',
			firstName: null,
			lastName: null,
			avatarUrl: null,
			displayName: null,
			tenantPermissionKeys: [],
		});
	});
});
