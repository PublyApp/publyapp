import { describe, expect, test } from 'vitest';

import { toCurrentUser } from './auth';

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
