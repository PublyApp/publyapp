import { describe, expect, test } from 'vitest';

import {
	parseTenantListSearchParams,
	parseTenantStatusFilter,
	serializeTenantListSearchParams,
	serializeTenantStatusFilter,
	type TenantStatusFilter,
} from './tenants-list-helpers';

describe('parseTenantStatusFilter', () => {
	test.each([
		['Pending', ['pending']],
		['active', ['active']],
		['Suspended', ['suspended']],
		['suspended, active', ['active', 'suspended']],
		['Suspended,pending,active,pending', ['pending', 'active', 'suspended']],
		['active,bogus,suspended', ['active', 'suspended']],
	])('canonicalizes %s', (input, expected) => {
		expect(parseTenantStatusFilter(input)).toEqual(expected);
	});

	test.each([undefined, '', '   ', 'bogus', 42])(
		'collapses %j to an empty selection',
		(input) => {
			expect(parseTenantStatusFilter(input)).toEqual([]);
		},
	);
});

describe('serializeTenantStatusFilter', () => {
	test.each([
		[[], undefined],
		[['active'], 'active'],
		[['suspended', 'active'], 'active,suspended'],
		[['suspended', 'pending', 'active', 'pending'], 'pending,active,suspended'],
	])('serializes %j to %j', (input, expected) => {
		expect(serializeTenantStatusFilter(input as TenantStatusFilter[])).toBe(
			expected,
		);
	});
});

describe('parseTenantListSearchParams / serializeTenantListSearchParams', () => {
	test('round-trips canonical statuses alongside generic table params', () => {
		const parsed = parseTenantListSearchParams({
			status: 'Suspended, active,active',
			q: ' acme ',
			sort_id: 'name',
			sort_order: 'asc',
		});

		expect(parsed).toMatchObject({
			status: ['active', 'suspended'],
			q: 'acme',
		});
		expect(serializeTenantListSearchParams(parsed)).toEqual({
			status: 'active,suspended',
			q: 'acme',
			sort_id: 'name',
			sort_order: 'asc',
		});
	});

	test('invalid-only input never reaches the request shape', () => {
		const parsed = parseTenantListSearchParams({ status: 'bogus,unknown' });
		expect(parsed.status).toEqual([]);
		expect(serializeTenantListSearchParams(parsed)).toEqual({
			status: undefined,
		});
	});
});
