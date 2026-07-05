import { describe, expect, test } from 'vitest';
import {
	buildFindStaffTenantProfilesQueryParameters,
	toStaffTenantProfileRows,
} from '~/lib/query/staff-tenant-profiles';

import type { TenantProfileItem } from '@org/client-ts/src/models/index.js';

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
