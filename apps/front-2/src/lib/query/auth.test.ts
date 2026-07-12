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
		  }
		| undefined,
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: typeof mocks.capturedOptions) => {
		mocks.capturedOptions = options;
		return { data: undefined };
	},
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: () => ({
			auth: { userAuthData: { get: vi.fn() } },
		}),
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { toCurrentUser, useCurrentUserQuery } from './auth';

describe('useCurrentUserQuery', () => {
	test('is session-stable: never refetches on tab focus', () => {
		renderHook(() => useCurrentUserQuery());

		expect(mocks.capturedOptions?.staleTime).toBe(Infinity);
		expect(mocks.capturedOptions?.refetchOnWindowFocus).toBe(false);
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
		});
	});

	test('returns null when the id is missing (loading/empty state)', () => {
		expect(toCurrentUser(undefined)).toBeNull();
		expect(toCurrentUser(null)).toBeNull();
		expect(toCurrentUser({ email: 'no-id@example.com' })).toBeNull();
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
		});
	});
});
