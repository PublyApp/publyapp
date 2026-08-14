import { describe, expect, test, vi } from 'vitest';

import {
	buildUpdateAccountProfileBody,
	toAccountProfile,
} from './tenant-account-profile';

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: vi.fn(),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

const unwrapUntyped = (value: unknown): unknown => {
	if (
		typeof value === 'object' &&
		value !== null &&
		'getValue' in value &&
		typeof (value as { getValue: unknown }).getValue === 'function'
	) {
		return (value as { getValue: () => unknown }).getValue();
	}

	return value;
};

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

	test('strips the API origin off a same-origin /files/ avatar before sending', () => {
		expect(
			unwrapUntyped(
				buildUpdateAccountProfileBody({
					tenantId: 't-1',
					avatarUrl:
						'https://api.example.test/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png',
				}).avatarUrl,
			),
		).toBe('/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png');
	});

	test('leaves an externally hosted avatar URL untouched', () => {
		expect(
			unwrapUntyped(
				buildUpdateAccountProfileBody({
					tenantId: 't-1',
					avatarUrl: 'https://cdn.example.com/avatar.png',
				}).avatarUrl,
			),
		).toBe('https://cdn.example.com/avatar.png');
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
