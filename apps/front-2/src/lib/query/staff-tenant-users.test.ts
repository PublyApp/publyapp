import { describe, expect, test } from 'vitest';
import {
	buildCreateStaffTenantUserInvitationBody,
	buildFindStaffTenantUsersQueryParameters,
	toStaffTenantUserDetails,
	toStaffTenantUserRows,
} from '~/lib/query/staff-tenant-users';

import type { TenantUserDetailsResult, TenantUserItem } from '@org/client-ts/src/models/index.js';

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

describe('buildCreateStaffTenantUserInvitationBody', () => {
	test('trims email and account level and wraps them for the API contract', () => {
		expect(
			buildCreateStaffTenantUserInvitationBody({
				email: '  alice@example.com  ',
				accountLevel: 'User',
			}),
		).toMatchObject({
			email: { value: 'alice@example.com' },
			accountLevel: { value: 'User' },
		});
	});

	test('drops missing values', () => {
		expect(
			buildCreateStaffTenantUserInvitationBody({
				email: '   ',
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

describe('toStaffTenantUserDetails', () => {
	test('normalizes a detail payload and builds a stable display name', () => {
		const result = toStaffTenantUserDetails({
			id: ' user-9 ',
			email: ' owner@publyapp.local ',
			firstName: ' Owner ',
			lastName: ' User ',
			avatarUrl: ' https://example.com/avatar.png ',
			level: 'Admin',
			status: ' Active ',
			tenantId: ' 11111111-1111-1111-1111-111111111111 ',
			createdAt: new Date('invalid'),
		} as TenantUserDetailsResult);

		expect(result).toEqual({
			id: 'user-9',
			email: 'owner@publyapp.local',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'Active',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: null,
			updatedAt: null,
			displayName: 'Owner User',
		});
	});

	test('returns null when the payload has no usable id', () => {
		expect(
			toStaffTenantUserDetails({
				id: ' ',
				email: 'owner@publyapp.local',
			} as TenantUserDetailsResult),
		).toBeNull();
	});
});
});
