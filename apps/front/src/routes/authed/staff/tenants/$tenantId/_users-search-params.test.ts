import { describe, expect, it } from 'vitest';

import {
	parseTenantUserRoleFilter,
	parseTenantUsersListSearchParams,
	parseTenantUserStatusFilter,
	serializeTenantUserRoleFilter,
	serializeTenantUsersListSearchParams,
	serializeTenantUserStatusFilter,
} from './_users-search-params';

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

describe('parseTenantUserRoleFilter', () => {
	it('keeps only known roles in input order', () => {
		expect(parseTenantUserRoleFilter('standard,FULL_ACCESS,owner')).toEqual([
			'standard',
			'full_access',
		]);
	});

	it('returns an empty list when nothing is recognised', () => {
		expect(parseTenantUserRoleFilter('owner,guest')).toEqual([]);
	});
});

describe('filter serializers', () => {
	it('join values and collapse an empty selection to undefined', () => {
		expect(serializeTenantUserStatusFilter(['active', 'suspended'])).toBe(
			'active,suspended',
		);
		expect(serializeTenantUserStatusFilter([])).toBeUndefined();
		expect(serializeTenantUserRoleFilter(['full_access'])).toBe('full_access');
		expect(serializeTenantUserRoleFilter([])).toBeUndefined();
	});
});

describe('parseTenantUsersListSearchParams', () => {
	it('normalizes status and role filters', () => {
		const parsed = parseTenantUsersListSearchParams({
			status: 'SUSPENDED,bogus',
			role: 'full_access,full_access',
		});

		expect(parsed.status).toBe('suspended');
		expect(parsed.role).toBe('full_access');
	});

	it('drops unknown filter values entirely', () => {
		const parsed = parseTenantUsersListSearchParams({
			status: 'bogus',
			role: 'owner',
		});

		expect(parsed.status).toBeUndefined();
		expect(parsed.role).toBeUndefined();
	});
});

describe('serializeTenantUsersListSearchParams', () => {
	it('round-trips normalized filters', () => {
		const serialized = serializeTenantUsersListSearchParams(
			parseTenantUsersListSearchParams({
				status: 'active,SUSPENDED',
				role: 'standard',
			}),
		);

		expect(serialized.status).toBe('active,suspended');
		expect(serialized.role).toBe('standard');
	});

	it('omits empty filters', () => {
		const serialized = serializeTenantUsersListSearchParams({
			status: '',
			role: undefined,
		});

		expect(serialized.status).toBeUndefined();
		expect(serialized.role).toBeUndefined();
	});
});
