import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: () => ({}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

import {
	buildFindStaffUsersQueryParameters,
	invalidateStaffUsers,
	STAFF_USERS_QUERY_KEY,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	toStaffUserRows,
} from '~/lib/query/staff-users';

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	AccountLevelObject,
	UserStatusObject,
} from '@org/client-ts/models/index';
import type {
	GetStaffUserByIdResult,
	GetStaffUserProfilesResult,
	StaffUserItem,
} from '@org/client-ts/models/index';

describe('buildFindStaffUsersQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffUsersQueryParameters({
				q: ' staff-admin ',
				sortId: ' created_at ',
				sortOrder: 'desc',
				cursor: ' cursor-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'staff-admin',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: 'cursor-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffUsersQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('toStaffUserRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: StaffUserItem[] = [
			{
				id: 'user-1',
				email: ' alpha@example.com ',
				firstName: ' Alpha ',
				lastName: ' Admin ',
				avatarUrl: ' https://example.com/alpha.png ',
				level: AccountLevelObject.Admin,
				status: UserStatusObject.Active,
			},
			{
				id: '',
				email: 'skip@example.com',
				firstName: 'Skip',
				lastName: 'Me',
			},
			{
				id: 'user-2',
				email: ' beta@example.com ',
				firstName: ' ',
				lastName: null,
				avatarUrl: null,
				level: null,
				status: null,
			},
		];

		expect(toStaffUserRows(items)).toEqual([
			{
				id: 'user-1',
				email: 'alpha@example.com',
				firstName: 'Alpha',
				lastName: 'Admin',
				avatarUrl: 'https://example.com/alpha.png',
				level: AccountLevelObject.Admin,
				status: UserStatusObject.Active,
				displayName: 'Alpha Admin',
			},
			{
				id: 'user-2',
				email: 'beta@example.com',
				firstName: null,
				lastName: null,
				avatarUrl: null,
				level: null,
				status: null,
				displayName: 'beta@example.com',
			},
		]);
	});

	// shell-r5-F3: a row missing its required `email` (the fallback identity
	// `getDisplayName` reads when no name is set) used to be kept with a
	// `'—'` placeholder a staff admin can't distinguish from real data. It
	// must be dropped instead.
	test('drops a row with a blank/missing email rather than fabricating a placeholder', () => {
		const items: StaffUserItem[] = [
			{
				id: 'user-3',
				email: '   ',
				firstName: 'Nobody',
				lastName: 'Home',
			},
			{
				id: 'user-4',
				email: null,
			},
		];

		expect(toStaffUserRows(items)).toEqual([]);
	});
});

describe('toStaffUserDetails', () => {
	test('normalizes a detail payload and falls back to email for display name', () => {
		const updatedAt = new Date('2026-07-02T08:30:00Z');

		const result = toStaffUserDetails({
			id: 'user-7',
			email: ' owner@publyapp.local ',
			firstName: ' ',
			lastName: null,
			avatarUrl: ' https://example.com/avatar.png ',
			accountLevel: AccountLevelObject.Admin,
			status: UserStatusObject.Active,
			createdAt: new Date('invalid'),
			updatedAt,
		} as GetStaffUserByIdResult);

		expect(result).toEqual({
			id: 'user-7',
			email: 'owner@publyapp.local',
			firstName: null,
			lastName: null,
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: AccountLevelObject.Admin,
			status: UserStatusObject.Active,
			createdAt: null,
			updatedAt,
			displayName: 'owner@publyapp.local',
		});
	});

	test('returns null when the payload has no usable id', () => {
		expect(
			toStaffUserDetails({
				id: ' ',
				email: 'owner@publyapp.local',
			} as GetStaffUserByIdResult),
		).toBeNull();
	});

	// shell-r5-F3: a payload missing its required `email` used to be treated
	// as present-but-blank, letting `displayName` fabricate a `'—'`
	// placeholder. It must be treated the same as "not found" instead.
	test('returns null when the payload has no usable email', () => {
		expect(
			toStaffUserDetails({
				id: 'user-9',
				email: '   ',
			} as GetStaffUserByIdResult),
		).toBeNull();
	});

	test('resolves a root-relative /files/ avatarUrl against the API origin', () => {
		expect(
			toStaffUserDetails({
				id: 'user-8',
				email: 'root-relative@publyapp.local',
				avatarUrl: '/files/uploads/2026/07/avatar.png',
			} as GetStaffUserByIdResult)?.avatarUrl,
		).toBe('https://api.example.test/files/uploads/2026/07/avatar.png');
	});
});

describe('toAssignedStaffProfiles', () => {
	test('normalizes assigned profiles and skips items without usable ids', () => {
		const result = toAssignedStaffProfiles({
			assignedProfiles: [
				{
					id: 'profile-1',
					name: ' Platform admins ',
					description: ' Full staff access ',
				},
				{
					id: 'profile-2',
					name: '   ',
					description: ' ',
				},
				{
					id: '',
					name: 'Skip me',
					description: 'Missing id',
				},
			],
			maxProfilesPerUser: 3,
		} as GetStaffUserProfilesResult);

		expect(result).toEqual([
			{
				id: 'profile-1',
				name: 'Platform admins',
				description: 'Full staff access',
			},
			{
				id: 'profile-2',
				name: undefined,
				description: null,
			},
		]);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toAssignedStaffProfiles(undefined)).toEqual([]);
		expect(
			toAssignedStaffProfiles({
				assignedProfiles: null,
			} as GetStaffUserProfilesResult),
		).toEqual([]);
	});
});

describe('invalidateStaffUsers', () => {
	test('invalidates the shared staff-users scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffUsers({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_USERS_QUERY_KEY],
		});
	});
});
