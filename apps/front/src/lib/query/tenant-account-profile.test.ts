import { describe, expect, test } from 'vitest';

import {
	buildUpdateAccountProfileBody,
	toAccountProfile,
} from './tenant-account-profile';

describe('toAccountProfile', () => {
	test('normalizes a full profile result', () => {
		expect(
			toAccountProfile({
				id: 'user-1',
				email: 'jason@studio.io',
				firstName: ' Jason ',
				lastName: 'Tatum',
				avatarUrl: 'https://cdn.example.test/a.png',
			}),
		).toEqual({
			id: 'user-1',
			email: 'jason@studio.io',
			firstName: 'Jason',
			lastName: 'Tatum',
			avatarUrl: 'https://cdn.example.test/a.png',
			displayName: 'Jason Tatum',
		});
	});

	test('returns null without a usable id', () => {
		expect(toAccountProfile(undefined)).toBeNull();
		expect(toAccountProfile({ id: null, email: 'x@y.io' })).toBeNull();
	});

	test('handles nulled identity fields', () => {
		const profile = toAccountProfile({
			id: 'user-1',
			email: 'jason@studio.io',
			firstName: null,
			lastName: null,
			avatarUrl: null,
		});

		expect(profile).not.toBeNull();
		expect(profile?.firstName).toBeNull();
		expect(profile?.displayName).toBeNull();
	});
});

describe('buildUpdateAccountProfileBody', () => {
	test('omits absent fields and clears with null', () => {
		expect(
			buildUpdateAccountProfileBody({
				tenantId: 't-1',
				firstName: 'Jay',
				avatarUrl: null,
			}),
		).toEqual({
			firstName: expect.anything(),
			avatarUrl: null,
		});
	});

	test('trims whitespace-only values down to a clear', () => {
		expect(
			buildUpdateAccountProfileBody({
				tenantId: 't-1',
				lastName: '   ',
			}).lastName,
		).toBeNull();
	});

	test('produces an empty body for an empty input', () => {
		expect(buildUpdateAccountProfileBody({ tenantId: 't-1' })).toEqual({});
	});
});
