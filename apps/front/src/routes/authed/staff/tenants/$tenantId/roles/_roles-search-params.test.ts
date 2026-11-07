import { describe, expect, it } from 'vitest';

import {
	parseStaffTenantRoleEditId,
	parseStaffTenantRolesSearchParams,
	parseStaffTenantRolesViewMode,
	parseStaffTenantRoleTypeFilter,
	resolveStaffTenantRoleDrawerFlags,
	serializeStaffTenantRolesSearchParams,
	toStaffTenantRoleTypeFilterString,
} from './_roles-search-params';

const ROLE_ID = '22222222-2222-2222-2222-222222222222';

describe('parseStaffTenantRoleTypeFilter', () => {
	it('should keep a real boolean unchanged', () => {
		expect(parseStaffTenantRoleTypeFilter(true)).toBe(true);
		expect(parseStaffTenantRoleTypeFilter(false)).toBe(false);
	});

	it('should parse the string forms case-insensitively', () => {
		expect(parseStaffTenantRoleTypeFilter(' TRUE ')).toBe(true);
		expect(parseStaffTenantRoleTypeFilter('False')).toBe(false);
	});

	it('should drop values that are not a type filter', () => {
		expect(parseStaffTenantRoleTypeFilter('maybe')).toBeUndefined();
		expect(parseStaffTenantRoleTypeFilter('')).toBeUndefined();
		expect(parseStaffTenantRoleTypeFilter(1)).toBeUndefined();
	});
});

describe('toStaffTenantRoleTypeFilterString', () => {
	it('should round-trip the boolean filter to its wire value', () => {
		expect(toStaffTenantRoleTypeFilterString(true)).toBe('true');
		expect(toStaffTenantRoleTypeFilterString(false)).toBe('false');
		expect(toStaffTenantRoleTypeFilterString(undefined)).toBeUndefined();
	});
});

describe('parseStaffTenantRoleEditId', () => {
	it('should keep a trimmed non-empty string', () => {
		expect(parseStaffTenantRoleEditId(` ${ROLE_ID} `)).toBe(ROLE_ID);
	});

	it('should drop anything that is not an id string', () => {
		expect(parseStaffTenantRoleEditId('   ')).toBeUndefined();
		expect(parseStaffTenantRoleEditId(42)).toBeUndefined();
		expect(parseStaffTenantRoleEditId(true)).toBeUndefined();
	});
});

describe('parseStaffTenantRolesViewMode', () => {
	it('should default to cards for anything but table', () => {
		expect(parseStaffTenantRolesViewMode('table')).toBe('table');
		expect(parseStaffTenantRolesViewMode('TABLE')).toBe('table');
		expect(parseStaffTenantRolesViewMode('cards')).toBe('cards');
		expect(parseStaffTenantRolesViewMode(undefined)).toBe('cards');
	});
});

describe('resolveStaffTenantRoleDrawerFlags', () => {
	it('should let edit win when both drawer flags are present', () => {
		expect(resolveStaffTenantRoleDrawerFlags(true, ROLE_ID)).toEqual({
			new: undefined,
			edit: ROLE_ID,
		});
	});

	it('should keep the create flag when no edit id is present', () => {
		expect(resolveStaffTenantRoleDrawerFlags(true, undefined)).toEqual({
			new: 1,
			edit: undefined,
		});
	});

	it('should leave both closed when neither flag is set', () => {
		expect(resolveStaffTenantRoleDrawerFlags(false, undefined)).toEqual({
			new: undefined,
			edit: undefined,
		});
	});
});

describe('parseStaffTenantRolesSearchParams', () => {
	it('should accept the create flag as the number or the string form', () => {
		expect(parseStaffTenantRolesSearchParams({ new: 1 }).new).toBe(1);
		expect(parseStaffTenantRolesSearchParams({ new: ' 1 ' }).new).toBe(1);
		expect(parseStaffTenantRolesSearchParams({ new: 2 }).new).toBeUndefined();
	});

	it('should canonicalize a both-drawers URL in favour of edit', () => {
		const parsed = parseStaffTenantRolesSearchParams({
			new: 1,
			edit: ROLE_ID,
		});

		expect(parsed.new).toBeUndefined();
		expect(parsed.edit).toBe(ROLE_ID);
	});

	it('should drop a cards view rather than pin it in the URL', () => {
		expect(parseStaffTenantRolesSearchParams({ view: 'cards' }).view).toBe(
			undefined,
		);
		expect(parseStaffTenantRolesSearchParams({ view: 'table' }).view).toBe(
			'table',
		);
	});
});

describe('serializeStaffTenantRolesSearchParams', () => {
	it('should round-trip a parsed search state unchanged', () => {
		const parsed = parseStaffTenantRolesSearchParams({
			edit: ROLE_ID,
			is_full_access: 'true',
			view: 'table',
		});

		expect(serializeStaffTenantRolesSearchParams(parsed)).toMatchObject({
			edit: ROLE_ID,
			is_full_access: true,
			view: 'table',
			new: undefined,
		});
	});
});
