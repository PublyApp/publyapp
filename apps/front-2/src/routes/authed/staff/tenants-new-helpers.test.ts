import { describe, expect, test } from 'vitest';

import {
	buildMemberImportOutcome,
	buildTenantMemberCsvTemplate,
	isValidTenantCode,
	mapImportedRoleToAccountLevel,
	mergeInitialUsers,
	parseCsv,
	slugifyTenantNamePlaceholder,
} from './tenants-new-helpers';

describe('isValidTenantCode', () => {
	test('accepts lowercase hyphenated slugs within the length bounds', () => {
		expect(isValidTenantCode('acme')).toBe(true);
		expect(isValidTenantCode('acme-corp')).toBe(true);
		expect(isValidTenantCode('acme-corp-2')).toBe(true);
	});

	test('rejects uppercase input rather than normalizing it', () => {
		expect(isValidTenantCode('Acme')).toBe(false);
		expect(isValidTenantCode('ACME-CORP')).toBe(false);
	});

	test('rejects codes shorter than 3 or longer than 40 characters', () => {
		expect(isValidTenantCode('ab')).toBe(false);
		expect(isValidTenantCode('a'.repeat(41))).toBe(false);
		expect(isValidTenantCode('a'.repeat(40))).toBe(true);
	});

	test('rejects leading, trailing, or doubled hyphens', () => {
		expect(isValidTenantCode('-acme')).toBe(false);
		expect(isValidTenantCode('acme-')).toBe(false);
		expect(isValidTenantCode('acme--corp')).toBe(false);
	});

	test('rejects non-alphanumeric characters', () => {
		expect(isValidTenantCode('acme_corp')).toBe(false);
		expect(isValidTenantCode('acme corp')).toBe(false);
		expect(isValidTenantCode('acme.corp')).toBe(false);
	});
});

describe('slugifyTenantNamePlaceholder', () => {
	test('lowercases and hyphenates non-alphanumeric runs', () => {
		expect(slugifyTenantNamePlaceholder('Acme Corporation!')).toBe(
			'acme-corporation',
		);
	});

	test('trims leading and trailing hyphens produced by punctuation', () => {
		expect(slugifyTenantNamePlaceholder('  --Acme-- ')).toBe('acme');
	});

	test('returns an empty string for blank input', () => {
		expect(slugifyTenantNamePlaceholder('   ')).toBe('');
	});
});

describe('mapImportedRoleToAccountLevel', () => {
	test('maps admin and owner (any case) to Admin', () => {
		expect(mapImportedRoleToAccountLevel('admin')).toBe('Admin');
		expect(mapImportedRoleToAccountLevel('Admin')).toBe('Admin');
		expect(mapImportedRoleToAccountLevel('OWNER')).toBe('Admin');
		expect(mapImportedRoleToAccountLevel('owner')).toBe('Admin');
	});

	test('maps user, member, empty, and unknown values to User', () => {
		expect(mapImportedRoleToAccountLevel('user')).toBe('User');
		expect(mapImportedRoleToAccountLevel('Member')).toBe('User');
		expect(mapImportedRoleToAccountLevel('')).toBe('User');
		expect(mapImportedRoleToAccountLevel(undefined)).toBe('User');
		expect(mapImportedRoleToAccountLevel(null)).toBe('User');
		expect(mapImportedRoleToAccountLevel('editor')).toBe('User');
	});
});

describe('parseCsv', () => {
	test('parses a simple comma-separated file with a header row', () => {
		const rows = parseCsv(
			'email,role\nuser1@example.com,admin\nuser2@example.com,user\n',
		);

		expect(rows).toEqual([
			{ email: 'user1@example.com', role: 'admin' },
			{ email: 'user2@example.com', role: 'user' },
		]);
	});

	test('handles CRLF line endings', () => {
		const rows = parseCsv('email,role\r\nuser1@example.com,admin\r\n');

		expect(rows).toEqual([{ email: 'user1@example.com', role: 'admin' }]);
	});

	test('supports quoted fields with embedded commas and escaped quotes', () => {
		const rows = parseCsv(
			'email,role\n"user1@example.com","admin, ""primary"""\n',
		);

		expect(rows).toEqual([
			{ email: 'user1@example.com', role: 'admin, "primary"' },
		]);
	});

	test('lowercases header names so column matching is case-insensitive', () => {
		const rows = parseCsv('Email,Role\nuser1@example.com,admin\n');

		expect(rows).toEqual([{ email: 'user1@example.com', role: 'admin' }]);
	});

	test('skips fully blank rows', () => {
		const rows = parseCsv('email,role\nuser1@example.com,admin\n\n\n');

		expect(rows).toEqual([{ email: 'user1@example.com', role: 'admin' }]);
	});

	test('returns an empty array for an empty file', () => {
		expect(parseCsv('')).toEqual([]);
	});
});

describe('buildMemberImportOutcome', () => {
	test('marks rows with invalid email addresses as invalid and excludes them from valid', () => {
		const outcome = buildMemberImportOutcome({
			rows: [
				{ email: 'not-an-email', role: 'user' },
				{ email: 'ok@example.com', role: 'admin' },
			],
			existingEmails: [],
		});

		expect(outcome.detectedCount).toBe(2);
		expect(outcome.invalidCount).toBe(1);
		expect(outcome.valid).toEqual([
			{ email: 'ok@example.com', accountLevel: 'Admin' },
		]);
	});

	test('dedupes rows against existing owner/manual emails case-insensitively', () => {
		const outcome = buildMemberImportOutcome({
			rows: [
				{ email: 'Owner@Example.com', role: 'user' },
				{ email: 'new@example.com', role: 'user' },
			],
			existingEmails: ['owner@example.com'],
		});

		expect(outcome.detectedCount).toBe(2);
		expect(outcome.duplicateCount).toBe(1);
		expect(outcome.valid).toEqual([
			{ email: 'new@example.com', accountLevel: 'User' },
		]);
	});

	test('dedupes repeated emails within the parsed rows themselves', () => {
		const outcome = buildMemberImportOutcome({
			rows: [
				{ email: 'dup@example.com', role: 'user' },
				{ email: 'DUP@example.com', role: 'admin' },
			],
			existingEmails: [],
		});

		expect(outcome.detectedCount).toBe(2);
		expect(outcome.duplicateCount).toBe(1);
		expect(outcome.valid).toEqual([
			{ email: 'dup@example.com', accountLevel: 'User' },
		]);
	});

	test('returns zeroed counts for an empty row set', () => {
		expect(buildMemberImportOutcome({ rows: [], existingEmails: [] })).toEqual({
			detectedCount: 0,
			invalidCount: 0,
			duplicateCount: 0,
			valid: [],
		});
	});
});

describe('buildTenantMemberCsvTemplate', () => {
	test('generates a header plus one example row', () => {
		expect(buildTenantMemberCsvTemplate()).toBe(
			'email,role\nuser@example.com,member\n',
		);
	});
});

describe('mergeInitialUsers', () => {
	test('orders owners first, then parsed members, then manual members', () => {
		const merged = mergeInitialUsers({
			owners: [{ email: 'owner@example.com' }],
			parsedMembers: [{ email: 'csv@example.com', accountLevel: 'User' }],
			manualMembers: [{ email: 'manual@example.com', accountLevel: 'Admin' }],
		});

		expect(merged).toEqual([
			{ email: 'owner@example.com', accountLevel: 'Admin' },
			{ email: 'csv@example.com', accountLevel: 'User' },
			{ email: 'manual@example.com', accountLevel: 'Admin' },
		]);
	});

	test('dedupes across all three sources case-insensitively, keeping the first occurrence', () => {
		const merged = mergeInitialUsers({
			owners: [{ email: 'shared@example.com' }],
			parsedMembers: [{ email: 'Shared@Example.com', accountLevel: 'User' }],
			manualMembers: [{ email: 'SHARED@EXAMPLE.COM', accountLevel: 'User' }],
		});

		expect(merged).toEqual([
			{ email: 'shared@example.com', accountLevel: 'Admin' },
		]);
	});

	test('drops blank emails', () => {
		const merged = mergeInitialUsers({
			owners: [{ email: '   ' }],
			parsedMembers: [],
			manualMembers: [{ email: 'member@example.com', accountLevel: 'User' }],
		});

		expect(merged).toEqual([
			{ email: 'member@example.com', accountLevel: 'User' },
		]);
	});
});
