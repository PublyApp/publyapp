import { describe, expect, it } from 'vitest';

import {
	buildTenantUserEditPayload,
	buildTenantUserEditSchema,
	normalizeOptionalUpdateString,
	type TenantUserEditValues,
} from './_edit-schema';

const t = (key: string) => key;

const values: TenantUserEditValues = {
	firstName: '  Ada  ',
	lastName: '',
	avatarUrl: 'https://cdn.example.com/a.png',
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

describe('buildTenantUserEditSchema', () => {
	const schema = buildTenantUserEditSchema(t);

	it('accepts an absolute http avatar url', () => {
		expect(
			schema.safeParse({
				avatarUrl: 'https://cdn.example.com/a.png',
			}).success,
		).toBe(true);
	});

	it('rejects a non-absolute avatar url', () => {
		const result = schema.safeParse({
			avatarUrl: 'not-a-url',
		});

		expect(result.success).toBe(false);
	});

	it('rejects an over-long first name', () => {
		expect(
			schema.safeParse({
				firstName: 'a'.repeat(129),
			}).success,
		).toBe(false);
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

	it('sends a dirty avatar url', () => {
		const payload = buildTenantUserEditPayload({
			tenantId: 'tenant-1',
			userId: 'user-1',
			values,
			dirtyFields: { avatarUrl: true },
		});

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
