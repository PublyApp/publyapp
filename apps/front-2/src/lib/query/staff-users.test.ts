import { describe, expect, test } from 'vitest';
import {
	buildFindStaffUsersQueryParameters,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	toStaffUserRows,
} from '~/lib/query/staff-users';

import type {
	GetStaffUserByIdResult,
	GetStaffUserProfilesResult,
	StaffUserItem,
} from '@org/client-ts/src/models/index.js';

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
				level: ' SuperAdmin ',
				status: ' Active ',
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
				level: 'SuperAdmin',
				status: 'Active',
				displayName: 'Alpha Admin',
			},
			{
				id: 'user-2',
				email: 'beta@example.com',
				firstName: null,
				lastName: null,
				level: null,
				status: null,
				displayName: 'beta@example.com',
			},
		]);
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
			accountLevel: ' Owner ',
			status: ' Active ',
			createdAt: new Date('invalid'),
			updatedAt,
		} as GetStaffUserByIdResult);

		expect(result).toEqual({
			id: 'user-7',
			email: 'owner@publyapp.local',
			firstName: null,
			lastName: null,
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Owner',
			status: 'Active',
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
				name: 'Unnamed profile',
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
