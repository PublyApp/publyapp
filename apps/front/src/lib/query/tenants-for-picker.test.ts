import { describe, expect, test } from 'vitest';

import {
	isActiveTenantForPicker,
	isSuspendedTenantForPicker,
	resolveWorkspaceTenant,
	toTenantsForPickerData,
	type TenantsForPickerData,
} from './tenants-for-picker';

const activeData: TenantsForPickerData = {
	tenants: [
		{ id: 't-1', name: 'Acme', code: 'acme', status: 'Active' },
		{ id: 't-2', name: 'TechStart', code: 'ts', status: 'Active' },
		{ id: 't-3', name: 'Global', code: 'gl', status: 'Suspended' },
	],
	activeCount: 2,
	totalCount: 3,
	hasDeletedTenants: false,
	hasSuspendedTenants: true,
};

describe('toTenantsForPickerData', () => {
	test('normalizes a full picker response', () => {
		expect(
			toTenantsForPickerData({
				activeCount: 2,
				totalCount: 3,
				hasDeletedTenants: true,
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
			hasDeletedTenants: true,
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
			hasDeletedTenants: false,
			hasSuspendedTenants: false,
		});
	});

	// #258: the flag must survive normalization — it is what lets the empty
	// state tell "all your organizations were deleted" from "none found".
	test('maps hasDeletedTenants through for an otherwise-empty picker', () => {
		expect(
			toTenantsForPickerData({
				activeCount: 0,
				totalCount: 0,
				hasDeletedTenants: true,
				hasSuspendedTenants: false,
				tenants: [],
			}),
		).toMatchObject({ hasDeletedTenants: true });
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

describe('resolveWorkspaceTenant', () => {
	test('resolves the stored selection when it names an active tenant', () => {
		expect(resolveWorkspaceTenant(activeData, 't-2')?.id).toBe('t-2');
	});

	test('ignores a stored selection that is suspended or gone', () => {
		expect(resolveWorkspaceTenant(activeData, 't-3')).toBeUndefined();
		expect(resolveWorkspaceTenant(activeData, 'missing')).toBeUndefined();
	});

	test('auto-resolves the single active tenant when none is stored', () => {
		const data: TenantsForPickerData = {
			tenants: [
				{ id: 't-1', name: 'Acme', code: 'acme', status: 'Active' },
				{ id: 't-3', name: 'Global', code: 'gl', status: 'Suspended' },
			],
			activeCount: 1,
			totalCount: 2,
			hasSuspendedTenants: true,
		};
		expect(resolveWorkspaceTenant(data, null)?.id).toBe('t-1');
	});

	test('stays unresolved when multiple actives and no valid selection', () => {
		expect(resolveWorkspaceTenant(activeData, null)).toBeUndefined();
	});
});
