import { describe, expect, test } from 'vitest';

import {
	parseTenantListSearchParams,
	serializeTenantListSearchParams,
	parseTenantStatusFilter,
} from './tenants-list-helpers';

describe('parseTenantStatusFilter', () => {
	test('accepts known statuses case-insensitively', () => {
		expect(parseTenantStatusFilter('Pending')).toBe('pending');
		expect(parseTenantStatusFilter('active')).toBe('active');
		expect(parseTenantStatusFilter('Suspended')).toBe('suspended');
	});

	test('collapses an unknown value to undefined', () => {
		expect(parseTenantStatusFilter('bogus')).toBeUndefined();
		expect(parseTenantStatusFilter(undefined)).toBeUndefined();
		expect(parseTenantStatusFilter(42)).toBeUndefined();
	});
});

describe('parseTenantListSearchParams / serializeTenantListSearchParams', () => {
	test('round-trips a status filter alongside the generic table params', () => {
		const parsed = parseTenantListSearchParams({
			status: 'active',
			q: ' acme ',
			sort_id: 'name',
			sort_order: 'asc',
		});

		expect(parsed.status).toBe('active');
		expect(parsed.q).toBe('acme');

		expect(serializeTenantListSearchParams(parsed)).toEqual({
			status: 'active',
			q: 'acme',
			sort_id: 'name',
			sort_order: 'asc',
		});
	});

	test('an unknown status value never reaches the parsed params or the API', () => {
		const parsed = parseTenantListSearchParams({ status: 'bogus' });

		expect(parsed.status).toBeUndefined();
		expect(serializeTenantListSearchParams(parsed).status).toBeUndefined();
	});

	test('no status param yields no status key', () => {
		const parsed = parseTenantListSearchParams({});

		expect(parsed.status).toBeUndefined();
		expect(serializeTenantListSearchParams(parsed)).toEqual({});
	});
});
