import { describe, expect, it } from 'vitest';

import {
	parseStaffTenantProfileEditId,
	parseStaffTenantProfilesSearchParams,
	parseStaffTenantProfilesViewMode,
	parseStaffTenantProfileTypeFilter,
	resolveStaffTenantProfileDrawerFlags,
	serializeStaffTenantProfilesSearchParams,
	toStaffTenantProfileTypeFilterString,
} from './_profiles-search-params';

const PROFILE_ID = '22222222-2222-2222-2222-222222222222';

describe('parseStaffTenantProfileTypeFilter', () => {
	it('should keep a real boolean unchanged', () => {
		expect(parseStaffTenantProfileTypeFilter(true)).toBe(true);
		expect(parseStaffTenantProfileTypeFilter(false)).toBe(false);
	});

	it('should parse the string forms case-insensitively', () => {
		expect(parseStaffTenantProfileTypeFilter(' TRUE ')).toBe(true);
		expect(parseStaffTenantProfileTypeFilter('False')).toBe(false);
	});

	it('should drop values that are not a type filter', () => {
		expect(parseStaffTenantProfileTypeFilter('maybe')).toBeUndefined();
		expect(parseStaffTenantProfileTypeFilter('')).toBeUndefined();
		expect(parseStaffTenantProfileTypeFilter(1)).toBeUndefined();
	});
});

describe('toStaffTenantProfileTypeFilterString', () => {
	it('should round-trip the boolean filter to its wire value', () => {
		expect(toStaffTenantProfileTypeFilterString(true)).toBe('true');
		expect(toStaffTenantProfileTypeFilterString(false)).toBe('false');
		expect(toStaffTenantProfileTypeFilterString(undefined)).toBeUndefined();
	});
});

describe('parseStaffTenantProfileEditId', () => {
	it('should keep a trimmed non-empty string', () => {
		expect(parseStaffTenantProfileEditId(` ${PROFILE_ID} `)).toBe(PROFILE_ID);
	});

	it('should drop anything that is not an id string', () => {
		expect(parseStaffTenantProfileEditId('   ')).toBeUndefined();
		expect(parseStaffTenantProfileEditId(42)).toBeUndefined();
		expect(parseStaffTenantProfileEditId(true)).toBeUndefined();
	});
});

describe('parseStaffTenantProfilesViewMode', () => {
	it('should default to cards for anything but table', () => {
		expect(parseStaffTenantProfilesViewMode('table')).toBe('table');
		expect(parseStaffTenantProfilesViewMode('TABLE')).toBe('table');
		expect(parseStaffTenantProfilesViewMode('cards')).toBe('cards');
		expect(parseStaffTenantProfilesViewMode(undefined)).toBe('cards');
	});
});

describe('resolveStaffTenantProfileDrawerFlags', () => {
	it('should let edit win when both drawer flags are present', () => {
		expect(resolveStaffTenantProfileDrawerFlags(true, PROFILE_ID)).toEqual({
			new: undefined,
			edit: PROFILE_ID,
		});
	});

	it('should keep the create flag when no edit id is present', () => {
		expect(resolveStaffTenantProfileDrawerFlags(true, undefined)).toEqual({
			new: 1,
			edit: undefined,
		});
	});

	it('should leave both closed when neither flag is set', () => {
		expect(resolveStaffTenantProfileDrawerFlags(false, undefined)).toEqual({
			new: undefined,
			edit: undefined,
		});
	});
});

describe('parseStaffTenantProfilesSearchParams', () => {
	it('should accept the create flag as the number or the string form', () => {
		expect(parseStaffTenantProfilesSearchParams({ new: 1 }).new).toBe(1);
		expect(parseStaffTenantProfilesSearchParams({ new: ' 1 ' }).new).toBe(1);
		expect(
			parseStaffTenantProfilesSearchParams({ new: 2 }).new,
		).toBeUndefined();
	});

	it('should canonicalize a both-drawers URL in favour of edit', () => {
		const parsed = parseStaffTenantProfilesSearchParams({
			new: 1,
			edit: PROFILE_ID,
		});

		expect(parsed.new).toBeUndefined();
		expect(parsed.edit).toBe(PROFILE_ID);
	});

	it('should drop a cards view rather than pin it in the URL', () => {
		expect(parseStaffTenantProfilesSearchParams({ view: 'cards' }).view).toBe(
			undefined,
		);
		expect(parseStaffTenantProfilesSearchParams({ view: 'table' }).view).toBe(
			'table',
		);
	});
});

describe('serializeStaffTenantProfilesSearchParams', () => {
	it('should round-trip a parsed search state unchanged', () => {
		const parsed = parseStaffTenantProfilesSearchParams({
			edit: PROFILE_ID,
			is_default: 'true',
			view: 'table',
		});

		expect(serializeStaffTenantProfilesSearchParams(parsed)).toMatchObject({
			edit: PROFILE_ID,
			is_default: true,
			view: 'table',
			new: undefined,
		});
	});
});
