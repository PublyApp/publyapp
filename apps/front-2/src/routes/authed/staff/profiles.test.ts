import { describe, expect, test } from 'vitest';
import {
	buildCreateStaffProfileBody,
	toStaffProfileRows,
} from '~/lib/query/staff-profiles';

import type { StaffProfileItem } from '@org/client-ts/src/models/index.js';

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
			},
			{
				id: 'profile-empty',
				name: '—',
				description: null,
				userAccountCount: 0,
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
