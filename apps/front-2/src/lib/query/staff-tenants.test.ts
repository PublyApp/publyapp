import { describe, expect, test } from 'vitest';
import {
	buildFindStaffTenantsQueryParameters,
	toStaffTenantRows,
} from '~/lib/query/staff-tenants';

import type { TenantAsStaffListItem } from '@org/client-ts/src/models/index.js';

describe('buildFindStaffTenantsQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantsQueryParameters({
				q: ' acme ',
				status: ' Active,Pending ',
				sortId: ' name ',
				sortOrder: 'asc',
				cursor: ' tenant-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'acme',
			status: 'Active,Pending',
			sortId: 'name',
			sortOrder: 'asc',
			cursor: 'tenant-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantsQueryParameters({
				q: '   ',
				status: ' ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('toStaffTenantRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantAsStaffListItem[] = [
			{
				id: 'tenant-1',
				name: ' Acme Corporation ',
				status: ' Active ',
				usersCount: 12,
				maxUsers: 50,
			},
			{
				id: '',
				name: 'Skip me',
				status: 'Pending',
				usersCount: 1,
				maxUsers: 10,
			},
			{
				id: 'tenant-2',
				name: null,
				status: null,
				usersCount: null,
				maxUsers: null,
			},
		];

		expect(toStaffTenantRows(items)).toEqual([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
			{
				id: 'tenant-2',
				name: '—',
				status: null,
				usersCount: 0,
				maxUsers: 0,
			},
		]);
	});
});
