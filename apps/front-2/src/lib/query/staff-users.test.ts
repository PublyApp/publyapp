import { describe, expect, test } from 'vitest';
import {
	buildFindStaffUsersQueryParameters,
	toStaffUserDetails,
	toStaffUserRows,
} from '~/lib/query/staff-users';

import type {
	GetStaffUserByIdResult,
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
