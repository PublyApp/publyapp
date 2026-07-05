import { describe, expect, test } from 'vitest';
import {
	buildFindStaffTenantUsersQueryParameters,
	toStaffTenantUserRows,
} from '~/lib/query/staff-tenant-users';

import type { TenantUserItem } from '@org/client-ts/src/models/index.js';

describe('buildFindStaffTenantUsersQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				q: ' alex ',
				sortId: ' level ',
				sortOrder: 'asc',
				cursor: ' user-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'alex',
			sortId: 'level',
			sortOrder: 'asc',
			cursor: 'user-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('toStaffTenantUserRows', () => {
	test('normalizes API items, builds display names, and skips rows without usable ids', () => {
		const items: TenantUserItem[] = [
			{
				id: 'user-1' as never,
				firstName: ' Alex ',
				lastName: ' Johnson ',
				email: ' alex@example.com ',
				level: ' Admin ',
				status: ' Active ',
				avatarUrl: ' https://example.com/alex.png ',
			},
			{
				id: '' as never,
				firstName: 'Skip',
				lastName: 'Me',
				email: 'skip@example.com',
				level: 'Member',
				status: 'Active',
			},
			{
				id: 'user-2' as never,
				firstName: ' ',
				lastName: null,
				email: ' second@example.com ',
				level: null,
				status: ' ',
				avatarUrl: null,
			},
		];

		expect(toStaffTenantUserRows(items)).toEqual([
			{
				id: 'user-1',
				firstName: 'Alex',
				lastName: 'Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				avatarUrl: 'https://example.com/alex.png',
				displayName: 'Alex Johnson',
			},
			{
				id: 'user-2',
				firstName: null,
				lastName: null,
				email: 'second@example.com',
				level: null,
				status: null,
				avatarUrl: null,
				displayName: 'second@example.com',
			},
		]);
	});
});
