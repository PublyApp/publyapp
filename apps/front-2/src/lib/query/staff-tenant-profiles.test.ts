import { describe, expect, test } from 'vitest';
import {
	buildCreateStaffTenantProfileBody,
	buildFindStaffTenantProfilesQueryParameters,
	toStaffTenantProfileDetails,
	toStaffTenantProfilePermissionKeys,
	toStaffTenantProfileRows,
} from '~/lib/query/staff-tenant-profiles';

import type {
	FindTenantProfilePermissionsAsStaffResult,
	GetTenantProfileByIdResponse,
	TenantProfileItem,
} from '@org/client-ts/src/models/index.js';

describe('buildFindStaffTenantProfilesQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantProfilesQueryParameters({
				q: ' approver ',
				sortId: ' name ',
				sortOrder: 'asc',
				cursor: ' profile-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'approver',
			sortId: 'name',
			sortOrder: 'asc',
			cursor: 'profile-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantProfilesQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('buildCreateStaffTenantProfileBody', () => {
	test('includes a trimmed description without serializing permission keys', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			description: '  Can review approvals  ',
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeDefined();
		expect(body.permissionKeys).toBeUndefined();
	});

	test('omits blank description and permission keys when not provided', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeUndefined();
		expect(body.permissionKeys).toBeUndefined();
	});
});

describe('toStaffTenantProfileRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantProfileItem[] = [
			{
				id: 'profile-1' as never,
				name: ' Approvers ',
				description: ' Can review approvals ',
				isDefault: true,
				userAccountCount: 7,
			},
			{
				id: '' as never,
				name: 'Skip me',
				description: 'Missing id',
				isDefault: false,
				userAccountCount: 1,
			},
			{
				id: 'profile-2' as never,
				name: null,
				description: ' ',
				isDefault: null,
				userAccountCount: null,
			},
		];

		expect(toStaffTenantProfileRows(items)).toEqual([
			{
				id: 'profile-1',
				name: 'Approvers',
				description: 'Can review approvals',
				isDefault: true,
				userAccountCount: 7,
			},
			{
				id: 'profile-2',
				name: '—',
				description: null,
				isDefault: false,
				userAccountCount: 0,
			},
		]);
	});
});

describe('toStaffTenantProfileDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: 'profile-7' as never,
					name: ' Approvers ',
					description: ' Can review approvals ',
					isDefault: true,
					userAccountCount: 7,
				},
			} as GetTenantProfileByIdResponse),
		).toEqual({
			id: 'profile-7',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
		});
	});

	test('returns null when the payload has no usable profile id', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: ' ' as never,
					name: 'Approvers',
				},
			} as GetTenantProfileByIdResponse),
		).toBeNull();
	});
});

describe('toStaffTenantProfilePermissionKeys', () => {
	test('normalizes keys, removes blanks, de-duplicates, and keeps sorted order', () => {
		expect(
			toStaffTenantProfilePermissionKeys({
				permissionKeys: [
					' tenant.users.manage ',
					'',
					'tenant.billing.view',
					'tenant.users.manage',
					null,
				],
			} as FindTenantProfilePermissionsAsStaffResult),
		).toEqual(['tenant.billing.view', 'tenant.users.manage']);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toStaffTenantProfilePermissionKeys(undefined)).toEqual([]);
	});
});
