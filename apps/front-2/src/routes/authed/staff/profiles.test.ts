import { describe, expect, test } from 'vitest';

import type { StaffProfileItem } from '@org/client-ts/src/models/index.js';

import { toStaffProfileRows } from './profiles';

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
