import { describe, expect, test } from 'vitest';
import {
	buildStaffProfileUsersRequestQuery,
	toStaffProfileUserRows,
} from '~/lib/query/staff-profile-users';

import type { StaffProfileUserItem } from '@org/client-ts/src/models/index.js';

describe('toStaffProfileUserRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: StaffProfileUserItem[] = [
			{
				id: 'user-1',
				email: 'alpha@example.com',
				firstName: ' Alpha ',
				lastName: ' Admin ',
				avatarUrl: 'https://example.com/alpha.png',
				status: 'Active',
			},
			{
				id: '',
				email: 'skip@example.com',
				firstName: 'Skip',
				lastName: 'Me',
				status: 'Suspended',
			},
			{
				id: 'user-2',
				email: null,
				firstName: null,
				lastName: null,
				avatarUrl: null,
				status: null,
			},
		];

		expect(toStaffProfileUserRows(items)).toEqual([
			{
				id: 'user-1',
				email: 'alpha@example.com',
				firstName: 'Alpha',
				lastName: 'Admin',
				avatarUrl: 'https://example.com/alpha.png',
				status: 'Active',
			},
			{
				id: 'user-2',
				email: '',
				firstName: null,
				lastName: null,
				avatarUrl: null,
				status: null,
			},
		]);
	});
});

describe('buildStaffProfileUsersRequestQuery', () => {
	test('trims search and converts zero-based page index to the API page parameter', () => {
		expect(
			buildStaffProfileUsersRequestQuery({
				q: ' alpha ',
				sortId: ' email ',
				sortOrder: 'asc',
				pageIndex: 1,
				size: 50,
			}),
		).toEqual({
			q: 'alpha',
			sortId: 'email',
			sortOrder: 'asc',
			page: '2',
			limit: '50',
		});
	});

	test('drops blank search and falls back to the first page when page index is invalid', () => {
		expect(
			buildStaffProfileUsersRequestQuery({
				q: '   ',
				sortId: 'created_at',
				sortOrder: 'desc',
				pageIndex: -3,
				size: 0,
			}),
		).toEqual({
			sortId: 'created_at',
			sortOrder: 'desc',
			page: '1',
			limit: undefined,
		});
	});
});
