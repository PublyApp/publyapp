import { describe, expect, test } from 'vitest';
import {
	buildCreateStaffProfileBody,
	toAssignedStaffPermissionGroups,
	toStaffProfileDetails,
	toStaffProfileRows,
} from '~/lib/query/staff-profiles';

import type {
	GetStaffProfileByIdResult,
	StaffProfileItem,
} from '@org/client-ts/src/models/index.js';

describe('toStaffProfileRows', () => {
	test('normalizes API items and skips rows without ids', () => {
		const items: StaffProfileItem[] = [
			{
				id: 'profile-admin',
				name: 'Admin',
				description: 'Administrators',
				userAccountCount: 3,
			},
			{
				id: '',
				name: 'Skip me',
				description: 'Missing id',
				userAccountCount: 1,
			},
			{
				id: 'profile-empty',
				name: null,
				description: null,
				userAccountCount: null,
			},
		];

		expect(toStaffProfileRows(items)).toEqual([
			{
				id: 'profile-admin',
				name: 'Admin',
				description: 'Administrators',
				userAccountCount: 3,
				icon: expect.any(String) as string,
				iconBg: expect.any(String) as string,
				iconFg: expect.any(String) as string,
			},
			{
				id: 'profile-empty',
				name: '—',
				description: null,
				userAccountCount: 0,
				icon: expect.any(String) as string,
				iconBg: expect.any(String) as string,
				iconFg: expect.any(String) as string,
			},
		]);
	});
});

describe('toStaffProfileDetails', () => {
	test('normalizes a detail payload and falls back for nullable fields', () => {
		const result: GetStaffProfileByIdResult = {
			profile: {
				id: 'profile-admin',
				name: ' Platform admin ',
				description: null,
				userAccountCount: null,
			},
		};

		expect(toStaffProfileDetails(result)).toEqual({
			id: 'profile-admin',
			name: 'Platform admin',
			description: null,
			userAccountCount: 0,
			icon: expect.any(String) as string,
			iconBg: expect.any(String) as string,
			iconFg: expect.any(String) as string,
		});
	});

	test('returns null when the payload is missing a usable profile id', () => {
		const result: GetStaffProfileByIdResult = {
			profile: {
				id: '',
				name: 'Skip me',
				description: 'Malformed',
				userAccountCount: 1,
			},
		};

		expect(toStaffProfileDetails(result)).toBeNull();
		expect(toStaffProfileDetails({ profile: null })).toBeNull();
	});
});

describe('toAssignedStaffPermissionGroups', () => {
	test('groups assigned keys with catalog labels and keeps unknown keys readable', () => {
		const groups = toAssignedStaffPermissionGroups(
			['users.write', 'audit.logs.read', 'users.read', 'users.read', ''],
			{
				users: {
					read: {
						key: 'users.read',
						name: 'Read users',
						description: 'View user records',
					},
					write: {
						key: 'users.write',
						name: 'Write users',
						description: 'Create and edit users',
					},
				},
			},
		);

		expect(groups).toEqual([
			{
				key: 'audit',
				label: 'Audit',
				permissions: [
					{
						key: 'audit.logs.read',
						label: 'audit.logs.read',
						description: null,
					},
				],
			},
			{
				key: 'users',
				label: 'Users',
				permissions: [
					{
						key: 'users.read',
						label: 'Read users',
						description: 'View user records',
					},
					{
						key: 'users.write',
						label: 'Write users',
						description: 'Create and edit users',
					},
				],
			},
		]);
	});

	test('falls back to raw key labels when the catalog is missing', () => {
		expect(
			toAssignedStaffPermissionGroups(['profiles.delete', 'profiles.get']),
		).toEqual([
			{
				key: 'profiles',
				label: 'Profiles',
				permissions: [
					{
						key: 'profiles.delete',
						label: 'profiles.delete',
						description: null,
					},
					{
						key: 'profiles.get',
						label: 'profiles.get',
						description: null,
					},
				],
			},
		]);
	});
});

describe('buildCreateStaffProfileBody', () => {
	test('includes populated fields for the create request body', () => {
		const body = buildCreateStaffProfileBody({
			name: 'Platform admin',
			description: 'Full staff access',
			permissions: ['staff.users.read', 'staff.users.write'],
			emails: [],
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeDefined();
		expect(body.permissions).toBeDefined();
		expect(body.emails).toBeUndefined();
	});

	test('omits optional description, permissions, and emails when empty', () => {
		const body = buildCreateStaffProfileBody({
			name: 'Auditor',
			description: undefined,
			permissions: [],
			emails: [],
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeUndefined();
		expect(body.permissions).toBeUndefined();
		expect(body.emails).toBeUndefined();
	});
});
