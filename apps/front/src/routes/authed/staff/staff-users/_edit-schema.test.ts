import { describe, expect, test } from 'vitest';

import {
	STATUS_OPTIONS,
	getStaffUserEditSchema,
	normalizeStatus,
} from './_edit-schema';

describe('_edit-schema', () => {
	describe('STATUS_OPTIONS', () => {
		test('contains Active and Suspended', () => {
			expect(STATUS_OPTIONS).toEqual(['Active', 'Suspended']);
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
				status: 'Active',
				roleIds: ['role-1'],
			});
			expect(result.success).toBe(true);
		});

		test('rejects invalid avatar URL', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: 'not-a-url',
				email: 'alex@example.com',
				status: 'Active',
				roleIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('accepts empty avatar URL', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: 'alex@example.com',
				status: 'Active',
				roleIds: [],
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
					status: 'Active',
					roleIds: [],
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
				status: 'Active',
				roleIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('rejects invalid email format', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: 'not-an-email',
				status: 'Active',
				roleIds: [],
			});
			expect(result.success).toBe(false);
		});

		test('accepts empty email string', () => {
			const result = schema.safeParse({
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				email: '',
				status: 'Active',
				roleIds: [],
			});
			expect(result.success).toBe(true);
		});
	});
});
