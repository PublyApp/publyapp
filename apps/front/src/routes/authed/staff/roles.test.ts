import { describe, expect, test } from 'vitest';
import {
	buildCreateStaffRoleBody,
	toAssignedStaffPermissionGroups,
	toStaffRoleDetails,
	toStaffRoleRows,
} from '~/lib/query/staff-roles';

import type {
	GetStaffRoleByIdResult,
	StaffRoleItem,
} from '@org/client-ts/models/index';

/** A Kiota payload with its `getValue()` wrappers recursively stripped. */
type Unwrapped =
	| string
	| number
	| boolean
	| null
	| Unwrapped[]
	| { [key: string]: Unwrapped };

const unwrapUntyped = (value: unknown): Unwrapped => {
	if (
		typeof value === 'object' &&
		value !== null &&
		'getValue' in value &&
		typeof (value as { getValue?: unknown }).getValue === 'function'
	) {
		return unwrapUntyped((value as { value?: unknown }).value);
	}

	if (Array.isArray(value)) {
		return value.map((item) => unwrapUntyped(item));
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
				key,
				unwrapUntyped(nested),
			]),
		);
	}

	// Exhaustive by construction: primitives pass through, wrappers/arrays/
	// objects recurse. The cast documents the invariant TS cannot infer.
	return value as Unwrapped;
};

describe('toStaffRoleRows', () => {
	// shell-r5-F3: a row with no readable name is malformed and is now
	// dropped rather than rendered with a fabricated `'—'` placeholder a
	// staff admin can't distinguish from a legitimate value — this test
	// previously pinned that forbidden `'—'` outcome (duplicating, and
	// drifting from, the dedicated mapper coverage added in
	// src/lib/query/staff-roles.test.ts for the same fix).
	test('normalizes API items and skips rows without ids or a usable name', () => {
		const items: StaffRoleItem[] = [
			{
				id: 'role-admin',
				name: 'Admin',
				description: 'Administrators',
				userAccountCount: 3,
			},
			{
				id: 'role-system',
				name: 'System',
				description: 'Seeded full-access role',
				userAccountCount: 0,
				isFullAccess: true,
			},
			{
				id: '',
				name: 'Skip me',
				description: 'Missing id',
				userAccountCount: 1,
			},
			{
				id: 'role-empty',
				name: null,
				description: null,
				userAccountCount: null,
			},
		];

		expect(toStaffRoleRows(items)).toEqual([
			{
				id: 'role-admin',
				name: 'Admin',
				description: 'Administrators',
				userAccountCount: 3,
				// Omitted by the API → the mapper's default.
				isFullAccess: false,
				icon: expect.any(String) as string,
				iconTone: expect.any(String) as string,
			},
			{
				id: 'role-system',
				name: 'System',
				description: 'Seeded full-access role',
				userAccountCount: 0,
				isFullAccess: true,
				icon: expect.any(String) as string,
				iconTone: expect.any(String) as string,
			},
		]);
	});
});

describe('toStaffRoleDetails', () => {
	test('normalizes a detail payload and falls back for nullable fields', () => {
		const result: GetStaffRoleByIdResult = {
			role: {
				id: 'role-admin',
				name: ' Platform admin ',
				description: null,
				userAccountCount: null,
			},
		};

		expect(toStaffRoleDetails(result)).toEqual({
			id: 'role-admin',
			name: 'Platform admin',
			description: null,
			userAccountCount: null,
			// Omitted by the API → the mapper's default.
			isFullAccess: false,
			icon: expect.any(String) as string,
			iconTone: expect.any(String) as string,
		});
	});

	test('keeps the full-access flag from a detail payload', () => {
		const result: GetStaffRoleByIdResult = {
			role: {
				id: 'role-system',
				name: 'System',
				description: null,
				userAccountCount: 0,
				isFullAccess: true,
			},
		};

		expect(toStaffRoleDetails(result)).toEqual({
			id: 'role-system',
			name: 'System',
			description: null,
			userAccountCount: 0,
			isFullAccess: true,
			icon: expect.any(String) as string,
			iconTone: expect.any(String) as string,
		});
	});

	test('returns null when the payload is missing a usable role id', () => {
		const result: GetStaffRoleByIdResult = {
			role: {
				id: '',
				name: 'Skip me',
				description: 'Malformed',
				userAccountCount: 1,
			},
		};

		expect(toStaffRoleDetails(result)).toBeNull();
		expect(toStaffRoleDetails({ role: null })).toBeNull();
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
			toAssignedStaffPermissionGroups(['roles.delete', 'roles.get']),
		).toEqual([
			{
				key: 'roles',
				label: 'Roles',
				permissions: [
					{
						key: 'roles.delete',
						label: 'roles.delete',
						description: null,
					},
					{
						key: 'roles.get',
						label: 'roles.get',
						description: null,
					},
				],
			},
		]);
	});
});

describe('buildCreateStaffRoleBody', () => {
	test('includes populated fields for the create request body', () => {
		const body = buildCreateStaffRoleBody({
			name: 'Platform admin',
			description: 'Full staff access',
			permissions: ['staff.users.read', 'staff.users.write'],
			emails: [],
		});

		expect(unwrapUntyped(body.name)).toBe('Platform admin');
		expect(unwrapUntyped(body.description)).toBe('Full staff access');
		expect(unwrapUntyped(body.permissions)).toEqual([
			'staff.users.read',
			'staff.users.write',
		]);
		expect(body.emails).toBeUndefined();
	});

	test('serializes populated emails as an untyped string array', () => {
		const body = buildCreateStaffRoleBody({
			name: 'Auditor',
			permissions: [],
			emails: ['jamie@example.com', 'morgan@example.com'],
		});

		expect(unwrapUntyped(body.emails)).toEqual([
			'jamie@example.com',
			'morgan@example.com',
		]);
	});

	test('omits optional description, permissions, and emails when empty', () => {
		const body = buildCreateStaffRoleBody({
			name: 'Auditor',
			description: undefined,
			permissions: [],
			emails: [],
		});

		expect(unwrapUntyped(body.name)).toBe('Auditor');
		expect(body.description).toBeUndefined();
		expect(body.permissions).toBeUndefined();
		expect(body.emails).toBeUndefined();
	});

	test('#980: serializes a chosen icon and tone onto the create body', () => {
		const body = buildCreateStaffRoleBody({
			name: 'Styled role',
			permissions: [],
			icon: 'star',
			tone: '6',
		});

		expect(unwrapUntyped(body.icon)).toBe('star');
		expect(unwrapUntyped(body.tone)).toBe('6');
	});

	test('#980: omits icon and tone from the create body when none was chosen', () => {
		const body = buildCreateStaffRoleBody({
			name: 'Bare role',
			permissions: [],
			icon: null,
			tone: null,
		});

		expect(body.icon).toBeUndefined();
		expect(body.tone).toBeUndefined();
	});
});
