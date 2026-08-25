import { describe, expect, it } from 'vitest';

import {
	buildTenantUserEditPayload,
	buildTenantUserEditSchema,
	normalizeAccountLevel,
	normalizeOptionalUpdateString,
	type TenantUserEditValues,
} from './_edit-schema';

const t = (key: string) => key;

const values: TenantUserEditValues = {
	firstName: '  Ada  ',
	lastName: '',
	avatarUrl: 'https://cdn.example.com/a.png',
	accountLevel: 'Admin',
};

describe('normalizeOptionalUpdateString', () => {
	it('trims a filled value', () => {
		expect(normalizeOptionalUpdateString('  Ada ')).toBe('Ada');
	});

	it('maps blank and undefined values to null (clear)', () => {
		expect(normalizeOptionalUpdateString('   ')).toBe(null);
		expect(normalizeOptionalUpdateString(undefined)).toBe(null);
	});
});

describe('normalizeAccountLevel', () => {
	it('keeps Admin and falls back to User', () => {
		expect(normalizeAccountLevel('Admin')).toBe('Admin');
		expect(normalizeAccountLevel('User')).toBe('User');
		expect(normalizeAccountLevel('owner')).toBe('User');
		expect(normalizeAccountLevel(null)).toBe('User');
	});
});

describe('buildTenantUserEditSchema', () => {
	const schema = buildTenantUserEditSchema(t);

	it('accepts an absolute http avatar url', () => {
		expect(
			schema.safeParse({
				avatarUrl: 'https://cdn.example.com/a.png',
				accountLevel: 'User',
			}).success,
		).toBe(true);
	});

	it('rejects a non-absolute avatar url', () => {
		const result = schema.safeParse({
			avatarUrl: 'not-a-url',
			accountLevel: 'User',
		});

		expect(result.success).toBe(false);
	});

	it('rejects an over-long first name', () => {
		expect(
			schema.safeParse({
				firstName: 'a'.repeat(129),
				accountLevel: 'User',
			}).success,
		).toBe(false);
	});

	it('rejects an unknown account level', () => {
		expect(schema.safeParse({ accountLevel: 'Owner' }).success).toBe(false);
	});
});

describe('buildTenantUserEditPayload', () => {
	it('includes only dirty fields alongside the ids', () => {
		expect(
			buildTenantUserEditPayload({
				tenantId: 'tenant-1',
				userId: 'user-1',
				values,
				dirtyFields: { firstName: true },
			}),
		).toEqual({
			tenantId: 'tenant-1',
			userId: 'user-1',
			firstName: 'Ada',
		});
	});

	it('sends null for a dirty field the user cleared', () => {
		const payload = buildTenantUserEditPayload({
			tenantId: 'tenant-1',
			userId: 'user-1',
			values,
			dirtyFields: { lastName: true },
		});

		expect(payload.lastName).toBe(null);
	});

	it('sends the raw account level when it is dirty', () => {
		const payload = buildTenantUserEditPayload({
			tenantId: 'tenant-1',
			userId: 'user-1',
			values,
			dirtyFields: { accountLevel: true, avatarUrl: true },
		});

		expect(payload.accountLevel).toBe('Admin');
		expect(payload.avatarUrl).toBe('https://cdn.example.com/a.png');
	});

	it('omits every field when nothing is dirty', () => {
		expect(
			buildTenantUserEditPayload({
				tenantId: 'tenant-1',
				userId: 'user-1',
				values,
				dirtyFields: {},
			}),
		).toEqual({ tenantId: 'tenant-1', userId: 'user-1' });
	});
});
