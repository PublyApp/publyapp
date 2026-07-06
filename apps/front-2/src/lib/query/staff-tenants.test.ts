import { describe, expect, test } from 'vitest';
import {
	buildFindStaffTenantsQueryParameters,
	toStaffTenantDetails,
	toStaffTenantRows,
} from '~/lib/query/staff-tenants';

import type {
	GetTenantAsStaffResult,
	TenantAsStaffListItem,
} from '@org/client-ts/src/models/index.js';

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

describe('toStaffTenantDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		const createdAt = new Date('2026-07-01T08:30:00Z');

		const result = toStaffTenantDetails({
			tenantId: 'tenant-7',
			name: ' Acme Corporation ',
			code: ' ACME ',
			status: ' Active ',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: ' https://cdn.example.com/acme.png ',
			createdAt,
			updatedAt: new Date('invalid'),
		} as GetTenantAsStaffResult);

		expect(result).toEqual({
			id: 'tenant-7',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: 'https://cdn.example.com/acme.png',
			createdAt,
			updatedAt: null,
		});
	});

	test('returns null when the payload has no usable tenant id', () => {
		expect(
			toStaffTenantDetails({
				tenantId: ' ',
				name: 'Acme Corporation',
			} as GetTenantAsStaffResult),
		).toBeNull();
	});
});
