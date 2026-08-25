import { describe, expect, test } from 'vitest';

import {
	ACCOUNT_LEVEL_OPTIONS,
	STATUS_OPTIONS,
	getStaffUserEditSchema,
	normalizeAccountLevel,
	normalizeStatus,
} from './_edit-schema';

describe('_edit-schema', () => {
	describe('ACCOUNT_LEVEL_OPTIONS', () => {
		test('contains Admin and User', () => {
			expect(ACCOUNT_LEVEL_OPTIONS).toEqual(['Admin', 'User']);
		});
	});

	describe('STATUS_OPTIONS', () => {
		test('contains Active and Suspended', () => {
			expect(STATUS_OPTIONS).toEqual(['Active', 'Suspended']);
		});
	});

	describe('normalizeAccountLevel', () => {
		test('returns Admin for Admin', () => {
			expect(normalizeAccountLevel('Admin')).toBe('Admin');
		});

		test('returns User for User', () => {
			expect(normalizeAccountLevel('User')).toBe('User');
		});

		test('returns User for null', () => {
			expect(normalizeAccountLevel(null)).toBe('User');
		});

		test('returns User for unknown values', () => {
			expect(normalizeAccountLevel('SuperAdmin')).toBe('User');
		});
	});

	describe('normalizeStatus', () => {
		test('returns Suspended for Suspended', () => {
			expect(normalizeStatus('Suspended')).toBe('Suspended');
		});

		test('returns Active for Active', () => {
			expect(normalizeStatus('Active')).toBe('Active');
		});

		test('returns Active for null', () => {
			expect(normalizeStatus(null)).toBe('Active');
		});

		test('returns Active for unknown values', () => {
			expect(normalizeStatus('Deleted')).toBe('Active');
		});
	});

	describe('getStaffUserEditSchema', () => {
		const t = (key: string) => key;
		const schema = getStaffUserEditSchema(t);

		test('accepts valid data', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: 'https://example.com/avatar.png',
				email: 'alex@example.com',
				accountLevel: 'Admin',
				status: 'Active',
				profileIds: ['profile-1'],
			});
			expect(result.success).toBe(true);
		});

		test('rejects invalid avatar URL', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: 'not-a-url',
				email: 'alex@example.com',
				accountLevel: 'Admin',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('accepts empty avatar URL', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: 'alex@example.com',
				accountLevel: 'Admin',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(true);
		});

		test('accepts http and https avatar URLs', () => {
			for (const url of [
				'http://example.com/avatar.png',
				'https://example.com/avatar.png',
			]) {
				const result = schema.safeParse({
					firstName: 'Alex',
					lastName: 'User',
					avatarUrl: url,
					email: 'alex@example.com',
					accountLevel: 'User',
					status: 'Active',
					profileIds: [],
				});
				expect(result.success).toBe(true);
			}
		});

		test('rejects ftp avatar URL', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: 'ftp://example.com/avatar.png',
				email: 'alex@example.com',
				accountLevel: 'User',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('rejects invalid account level', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: 'alex@example.com',
				accountLevel: 'SuperAdmin',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('rejects invalid email format', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: 'not-an-email',
				accountLevel: 'User',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('accepts empty email string', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: '',
				accountLevel: 'User',
				status: 'Active',
				profileIds: [],
			});
			expect(result.success).toBe(true);
		});
	});
});
