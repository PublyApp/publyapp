import { describe, expect, test } from 'vitest';

import {
	isActiveTenantForPicker,
	isSuspendedTenantForPicker,
	toTenantsForPickerData,
} from './tenants-for-picker';

describe('toTenantsForPickerData', () => {
	test('normalizes a full picker response', () => {
		expect(
			toTenantsForPickerData({
				activeCount: 2,
				totalCount: 3,
				hasSuspendedTenants: true,
				tenants: [
					{
						id: 't-1',
						name: '  Acme Corp  ',
						code: ' acme-corp ',
						status: 'Active',
					},
					{ id: 't-2', name: 'TechStart', code: null, status: 'Active' },
					{ id: 't-3', name: 'Global', code: 'global', status: 'Suspended' },
				],
			}),
		).toEqual({
			activeCount: 2,
			totalCount: 3,
			hasSuspendedTenants: true,
			tenants: [
				{ id: 't-1', name: 'Acme Corp', code: 'acme-corp', status: 'Active' },
				{ id: 't-2', name: 'TechStart', code: null, status: 'Active' },
				{ id: 't-3', name: 'Global', code: 'global', status: 'Suspended' },
			],
		});
	});

	test('skips tenants without a usable id', () => {
		expect(
			toTenantsForPickerData({
				activeCount: 1,
				totalCount: 1,
				hasSuspendedTenants: false,
				tenants: [{ id: null, name: 'No id', code: null, status: 'Active' }],
			}).tenants,
		).toEqual([]);
	});

	test('defaults everything for a nil result (loading/empty state)', () => {
		expect(toTenantsForPickerData(undefined)).toEqual({
			tenants: [],
			activeCount: 0,
			totalCount: 0,
			hasSuspendedTenants: false,
		});
	});
});

describe('isActiveTenantForPicker / isSuspendedTenantForPicker', () => {
	test('classifies by status', () => {
		expect(isActiveTenantForPicker({ status: 'Active' })).toBe(true);
		expect(isActiveTenantForPicker({ status: 'Suspended' })).toBe(false);
		expect(isActiveTenantForPicker({ status: 'Pending' })).toBe(false);
		expect(isSuspendedTenantForPicker({ status: 'Suspended' })).toBe(true);
		expect(isSuspendedTenantForPicker({ status: 'Active' })).toBe(false);
	});
});
