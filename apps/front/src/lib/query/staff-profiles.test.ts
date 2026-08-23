import { describe, expect, test } from 'vitest';

import type {
	GetStaffProfileByIdResult,
	StaffProfileItem,
} from '@org/client-ts/models/index';

import { toStaffProfileDetails, toStaffProfileRows } from './staff-profiles';

// shell-r5-F3: a row/payload missing its required `name` used to be kept
// with a `'—'` placeholder (and an icon derived from a fabricated
// `'profile'` fallback name) that a staff admin can't distinguish from real
// data. It must be dropped/treated as "not found" instead.
describe('toStaffProfileRows', () => {
	test('normalizes items and skips rows without usable ids', () => {
		const items: StaffProfileItem[] = [
			{
				id: 'profile-1',
				name: ' Support ',
				description: ' Handles tickets ',
				userAccountCount: 4,
			},
			{
				id: '',
				name: 'Skip me',
			},
		];

		expect(toStaffProfileRows(items)).toEqual([
			expect.objectContaining({
				id: 'profile-1',
				name: 'Support',
				userAccountCount: 4,
			}),
		]);
	});

	test('drops a row with a blank/missing name rather than fabricating a placeholder', () => {
		const items: StaffProfileItem[] = [
			{ id: 'profile-2', name: undefined },
			{ id: 'profile-3', name: '   ' },
		];

		expect(toStaffProfileRows(items)).toEqual([]);
	});

	test('an empty list stays empty (no fabricated rows)', () => {
		expect(toStaffProfileRows([])).toEqual([]);
		expect(toStaffProfileRows(null)).toEqual([]);
		expect(toStaffProfileRows(undefined)).toEqual([]);
	});
});

describe('toStaffProfileDetails', () => {
	test('normalizes a detail payload', () => {
		const result = toStaffProfileDetails({
			profile: {
				id: 'profile-7',
				name: ' Owners ',
				description: 'Full access',
				userAccountCount: 2,
			},
		} as GetStaffProfileByIdResult);

		expect(result).toEqual(
			expect.objectContaining({ id: 'profile-7', name: 'Owners' }),
		);
	});

	test('returns null when the payload has no usable id', () => {
		expect(
			toStaffProfileDetails({
				profile: { id: ' ', name: 'Owners' },
			} as GetStaffProfileByIdResult),
		).toBeNull();
	});

	test('returns null when the payload has no usable name', () => {
		expect(
			toStaffProfileDetails({
				profile: { id: 'profile-8', name: '   ' },
			} as GetStaffProfileByIdResult),
		).toBeNull();
	});

	test('#980: honors persisted icon and tone in the details payload', () => {
		const result = toStaffProfileDetails({
			profile: {
				id: 'profile-9',
				name: 'Owners',
				description: null,
				userAccountCount: 0,
				icon: 'shield-check',
				tone: '5',
			},
		} as GetStaffProfileByIdResult);

		expect(result).toEqual(
			expect.objectContaining({
				id: 'profile-9',
				icon: 'shield-check',
				iconTone: '5',
			}),
		);
	});

	test('#980: derives a deterministic picker-valid style when none was stored', () => {
		const result = toStaffProfileDetails({
			profile: {
				id: 'profile-10',
				name: 'Owners',
				description: null,
				userAccountCount: 0,
			},
		} as GetStaffProfileByIdResult);

		expect(result?.icon).toBeTruthy();
		expect(result?.iconTone).toMatch(/^[0-7]$/);
	});
});
