import { describe, expect, it } from 'vitest';

import {
	parseTenantUserLevelFilter,
	parseTenantUsersListSearchParams,
	parseTenantUserStatusFilter,
	serializeTenantUserLevelFilter,
	serializeTenantUsersListSearchParams,
	serializeTenantUserStatusFilter,
} from './_users-list-search';

describe('parseTenantUserStatusFilter', () => {
	it('keeps only known statuses, lowercased and de-duplicated', () => {
		expect(
			parseTenantUserStatusFilter(' ACTIVE , suspended,active,bogus '),
		).toEqual(['active', 'suspended']);
	});

	it('returns an empty list for blank or non-string input', () => {
		expect(parseTenantUserStatusFilter('   ')).toEqual([]);
		expect(parseTenantUserStatusFilter(42)).toEqual([]);
		expect(parseTenantUserStatusFilter(undefined)).toEqual([]);
	});
});

describe('parseTenantUserLevelFilter', () => {
	it('keeps only known levels in input order', () => {
		expect(parseTenantUserLevelFilter('user,ADMIN,owner')).toEqual([
			'user',
			'admin',
		]);
	});

	it('returns an empty list when nothing is recognised', () => {
		expect(parseTenantUserLevelFilter('owner,guest')).toEqual([]);
	});
});

describe('filter serializers', () => {
	it('join values and collapse an empty selection to undefined', () => {
		expect(serializeTenantUserStatusFilter(['active', 'suspended'])).toBe(
			'active,suspended',
		);
		expect(serializeTenantUserStatusFilter([])).toBeUndefined();
		expect(serializeTenantUserLevelFilter(['admin'])).toBe('admin');
		expect(serializeTenantUserLevelFilter([])).toBeUndefined();
	});
});

describe('parseTenantUsersListSearchParams', () => {
	it('normalizes status and level filters', () => {
		const parsed = parseTenantUsersListSearchParams({
			status: 'SUSPENDED,bogus',
			level: 'admin,admin',
		});

		expect(parsed.status).toBe('suspended');
		expect(parsed.level).toBe('admin');
	});

	it('drops unknown filter values entirely', () => {
		const parsed = parseTenantUsersListSearchParams({
			status: 'bogus',
			level: 'owner',
		});

		expect(parsed.status).toBeUndefined();
		expect(parsed.level).toBeUndefined();
	});
});

describe('serializeTenantUsersListSearchParams', () => {
	it('round-trips normalized filters', () => {
		const serialized = serializeTenantUsersListSearchParams(
			parseTenantUsersListSearchParams({
				status: 'active,SUSPENDED',
				level: 'user',
			}),
		);

		expect(serialized.status).toBe('active,suspended');
		expect(serialized.level).toBe('user');
	});

	it('omits empty filters', () => {
		const serialized = serializeTenantUsersListSearchParams({
			status: '',
			level: undefined,
		});

		expect(serialized.status).toBeUndefined();
		expect(serialized.level).toBeUndefined();
	});
});
