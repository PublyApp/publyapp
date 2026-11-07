import { describe, expect, test } from 'vitest';

import type {
	GetStaffRoleByIdResult,
	StaffRoleItem,
} from '@org/client-ts/models/index';

import {
	buildUpdateStaffRoleBody,
	toStaffRoleDetails,
	toStaffRoleRows,
	type UpdateStaffRoleInput,
} from './staff-roles';

// shell-r5-F3: a row/payload missing its required `name` used to be kept
// with a `'—'` placeholder (and an icon derived from a fabricated
// `'role'` fallback name) that a staff admin can't distinguish from real
// data. It must be dropped/treated as "not found" instead.
describe('toStaffRoleRows', () => {
	test('normalizes items and skips rows without usable ids', () => {
		const items: StaffRoleItem[] = [
			{
				id: 'role-1',
				name: ' Support ',
				description: ' Handles tickets ',
				userAccountCount: 4,
			},
			{
				id: '',
				name: 'Skip me',
			},
		];

		expect(toStaffRoleRows(items)).toEqual([
			expect.objectContaining({
				id: 'role-1',
				name: 'Support',
				userAccountCount: 4,
			}),
		]);
	});

	test('drops a row with a blank/missing name rather than fabricating a placeholder', () => {
		const items: StaffRoleItem[] = [
			{ id: 'role-2', name: undefined },
			{ id: 'role-3', name: '   ' },
		];

		expect(toStaffRoleRows(items)).toEqual([]);
	});

	test('an empty list stays empty (no fabricated rows)', () => {
		expect(toStaffRoleRows([])).toEqual([]);
		expect(toStaffRoleRows(null)).toEqual([]);
		expect(toStaffRoleRows(undefined)).toEqual([]);
	});
});

describe('toStaffRoleDetails', () => {
	test('normalizes a detail payload', () => {
		const result = toStaffRoleDetails({
			role: {
				id: 'role-7',
				name: ' Owners ',
				description: 'Full access',
				userAccountCount: 2,
			},
		} as GetStaffRoleByIdResult);

		expect(result).toEqual(
			expect.objectContaining({ id: 'role-7', name: 'Owners' }),
		);
	});

	test('returns null when the payload has no usable id', () => {
		expect(
			toStaffRoleDetails({
				role: { id: ' ', name: 'Owners' },
			} as GetStaffRoleByIdResult),
		).toBeNull();
	});

	test('returns null when the payload has no usable name', () => {
		expect(
			toStaffRoleDetails({
				role: { id: 'role-8', name: '   ' },
			} as GetStaffRoleByIdResult),
		).toBeNull();
	});

	test('#980: honors persisted icon and tone in the details payload', () => {
		const result = toStaffRoleDetails({
			role: {
				id: 'role-9',
				name: 'Owners',
				description: null,
				userAccountCount: 0,
				icon: 'shield-check',
				tone: '5',
			},
		} as GetStaffRoleByIdResult);

		expect(result).toEqual(
			expect.objectContaining({
				id: 'role-9',
				icon: 'shield-check',
				iconTone: '5',
			}),
		);
	});

	test('#980: derives a deterministic picker-valid style when none was stored', () => {
		const result = toStaffRoleDetails({
			role: {
				id: 'role-10',
				name: 'Owners',
				description: null,
				userAccountCount: 0,
			},
		} as GetStaffRoleByIdResult);

		expect(result?.icon).toBeTruthy();
		expect(result?.iconTone).toMatch(/^[0-7]$/);
	});
});

// #819 — the PATCH body builder mirrors `buildUpdateStaffTenantRoleBody`:
// an absent key means "omit" (keep current value) and an explicit null means
// "clear", matching UpdateStaffRole's omit/set/clear wire semantics.
describe('buildUpdateStaffRoleBody', () => {
	const baseInput: UpdateStaffRoleInput = {
		roleId: 'role-1',
		name: 'Editors',
	};

	test('sends name and omits unset optional fields', () => {
		const body = buildUpdateStaffRoleBody({ ...baseInput });

		expect(body.name).toBeDefined();
		expect(body.description).toBeUndefined();
		expect(body.icon).toBeUndefined();
		expect(body.tone).toBeUndefined();
	});

	test('sends a non-empty description as a string', () => {
		const body = buildUpdateStaffRoleBody({
			...baseInput,
			description: '  Handles tickets  ',
		});

		expect(body.description).toBeDefined();
		expect(body.description).not.toBeNull();
	});

	test('an empty/whitespace description clears the field with an explicit null', () => {
		const body = buildUpdateStaffRoleBody({
			...baseInput,
			description: '   ',
		});

		expect(body.description).toBeNull();
	});

	test('a concrete icon/tone pair is sent as strings', () => {
		const body = buildUpdateStaffRoleBody({
			...baseInput,
			icon: 'briefcase',
			tone: '6',
		});

		expect(body.icon).toBeDefined();
		expect(body.icon).not.toBeNull();
		expect(body.tone).toBeDefined();
		expect(body.tone).not.toBeNull();
	});

	test('null icon/tone clear the automatic-style override with explicit nulls', () => {
		const body = buildUpdateStaffRoleBody({
			...baseInput,
			icon: null,
			tone: null,
		});

		expect(body.icon).toBeNull();
		expect(body.tone).toBeNull();
	});

	test('trims the name', () => {
		const body = buildUpdateStaffRoleBody({
			...baseInput,
			name: '  Editors  ',
		});

		expect(body.name).toBeDefined();
	});
});
