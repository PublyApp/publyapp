import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';

import {
	applyProfileResolutions,
	buildImportedInvites,
	buildSubmitInvitations,
	canSendInvitations,
	clearFileRows,
	makeManualRow,
	mapInviteLevel,
	parseInviteCsv,
	parseInviteeEmails,
	parseInviteWorkbook,
	splitProfileNames,
	type InviteRow,
	type ProfileNameResolution,
} from './_invite-user-form-state';

describe('splitProfileNames', () => {
	test('splits on semicolons and pipes and trims pieces', () => {
		expect(splitProfileNames('Alpha; Beta| Gamma ;')).toEqual([
			'Alpha',
			'Beta',
			'Gamma',
		]);
	});

	test('returns an empty list for blank cells', () => {
		expect(splitProfileNames('')).toEqual([]);
	});
});

describe('mapInviteLevel', () => {
	test('maps admin and owner case-insensitively to Admin', () => {
		expect(mapInviteLevel('ADMIN')).toBe('Admin');
		expect(mapInviteLevel('owner')).toBe('Admin');
	});

	test('maps anything else to User', () => {
		expect(mapInviteLevel('member')).toBe('User');
		expect(mapInviteLevel(undefined)).toBe('User');
	});
});

describe('parseInviteCsv', () => {
	test('parses the documented email, level, profiles columns', () => {
		const rows = parseInviteCsv(
			'email,level,profiles\na@example.com,admin,Alpha; Beta\n',
		);

		expect(rows).toEqual([
			{
				email: 'a@example.com',
				accountLevel: 'Admin',
				profileNames: ['Alpha', 'Beta'],
			},
		]);
	});

	test('handles quoted commas and CRLF line endings', () => {
		const rows = parseInviteCsv(
			'"email","level","profiles"\r\n"a@example.com","user","Al,pha"\r\n',
		);

		expect(rows[0]?.profileNames).toEqual(['Al,pha']);
	});

	test('is case-insensitive on header names', () => {
		const rows = parseInviteCsv('EMAIL,Level,PROFILES\nb@example.com,user,X\n');

		expect(rows[0]?.email).toBe('b@example.com');
	});
});

const buildWorkbook = (cells: {
	sharedStrings: string[];
	sheetXml: string;
}): Uint8Array =>
	zipSync(
		{
			'xl/workbook.xml': strToU8(
				'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
			),
			'xl/_rels/workbook.xml.rels': strToU8(
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
			),
			'xl/sharedStrings.xml': strToU8(
				`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cells.sharedStrings
					.map((text) => `<si><t>${text}</t></si>`)
					.join('')}</sst>`,
			),
			'xl/worksheets/sheet1.xml': strToU8(cells.sheetXml),
		},
		{ level: 0 },
	);

describe('parseInviteWorkbook', () => {
	test('reads shared-string cells through the first worksheet', () => {
		const bytes = buildWorkbook({
			sharedStrings: [
				'email',
				'level',
				'profiles',
				'a@example.com',
				'admin',
				'Alpha',
			],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const rows = parseInviteWorkbook(bytes);

		expect(rows).toEqual([
			{
				email: 'a@example.com',
				accountLevel: 'Admin',
				profileNames: ['Alpha'],
			},
		]);
	});

	test('skips sparse gaps by column letter, not cell order', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'a@example.com', 'user'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const rows = parseInviteWorkbook(bytes);

		expect(rows).toEqual([
			{ email: 'a@example.com', accountLevel: 'User', profileNames: [] },
		]);
	});
});

describe('buildImportedInvites', () => {
	test('keeps provenance on file rows and dedupes within the file and against known emails', () => {
		const outcome = buildImportedInvites({
			parsedRows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
				},
				{ email: 'A@Example.com', accountLevel: 'User', profileNames: [] },
				{ email: 'b@example.com', accountLevel: 'User', profileNames: [] },
			],
			existingEmails: ['b@example.com'],
			source: 'file',
		});

		expect(outcome.rows).toHaveLength(1);
		expect(outcome.rows[0]).toMatchObject({
			email: 'a@example.com',
			accountLevel: 'Admin',
			source: 'file',
		});
		expect(outcome.duplicateCount).toBe(2);
		expect(outcome.detectedCount).toBe(3);
	});
});

describe('clearFileRows', () => {
	test('removes only file-sourced rows and keeps manual rows', () => {
		const rows: InviteRow[] = [
			{ ...makeManualRow('keep@example.com'), key: 'k1' },
			{
				key: 'k2',
				email: 'drop@example.com',
				accountLevel: 'User',
				profileIds: [],
				profileNames: [],
				source: 'file',
			},
		];

		expect(clearFileRows(rows).map((row) => row.key)).toEqual(['k1']);
	});
});

describe('applyProfileResolutions', () => {
	const resolutions: ProfileNameResolution[] = [
		{ name: 'alpha', profileId: 'p-1', reason: null },
		{ name: 'ghost', profileId: null, reason: 'not-found' },
	];

	const baseRow = (overrides: Partial<InviteRow>): InviteRow => ({
		key: 'k1',
		email: 'a@example.com',
		accountLevel: 'User',
		profileIds: [],
		profileNames: ['alpha', 'ghost'],
		source: 'file',
		...overrides,
	});

	test('fills ids from case-insensitive matches and flags unresolved names per row', () => {
		const result = applyProfileResolutions([baseRow({})], resolutions);

		expect(result.rows[0]?.profileIds).toEqual(['p-1']);
		expect(result.unresolvedByRowKey.k1?.map((item) => item.name)).toEqual([
			'ghost',
		]);
	});

	test('admins never surface unresolved profile names', () => {
		const result = applyProfileResolutions(
			[baseRow({ accountLevel: 'Admin' })],
			resolutions,
		);

		expect(result.rows[0]?.profileIds).toEqual(['p-1']);
		expect(result.unresolvedByRowKey.k1 ?? []).toEqual([]);
	});
});

describe('canSendInvitations', () => {
	const validRow: InviteRow = {
		key: 'kv',
		email: 'v@example.com',
		accountLevel: 'User',
		profileIds: [],
		profileNames: [],
		source: 'manual',
	};

	const evaluate = (
		rows: InviteRow[],
		overrides?: { isResolvingProfiles?: boolean; unresolvedCount?: number },
	) =>
		canSendInvitations({
			rows,
			isResolvingProfiles: overrides?.isResolvingProfiles ?? false,
			unresolvedCount: overrides?.unresolvedCount ?? 0,
		});

	test('allows a valid non-empty batch', () => {
		expect(evaluate([validRow])).toBe(true);
	});

	test('blocks an empty batch', () => {
		expect(evaluate([])).toBe(false);
	});

	test('blocks while profile resolution is in flight', () => {
		expect(evaluate([validRow], { isResolvingProfiles: true })).toBe(false);
	});

	test('blocks while unresolved profile names remain', () => {
		expect(evaluate([validRow], { unresolvedCount: 1 })).toBe(false);
	});

	test('blocks rows with malformed emails', () => {
		expect(evaluate([{ ...validRow, email: 'not-an-email' }])).toBe(false);
	});
});

describe('buildSubmitInvitations', () => {
	test('maps rows to the bulk payload dropping bookkeeping and suppressing admin profiles', () => {
		const rows: InviteRow[] = [
			{
				key: 'k1',
				email: 'a@example.com',
				accountLevel: 'Admin',
				profileIds: ['p-9'],
				profileNames: ['x'],
				source: 'file',
			},
			{
				key: 'k2',
				email: 'b@example.com',
				accountLevel: 'User',
				profileIds: ['p-1', 'p-1', 'p-2'],
				profileNames: [],
				source: 'manual',
			},
		];

		expect(buildSubmitInvitations(rows)).toEqual([
			{ email: 'a@example.com', accountLevel: 'Admin', profileIds: [] },
			{
				email: 'b@example.com',
				accountLevel: 'User',
				profileIds: ['p-1', 'p-2'],
			},
		]);
	});
});

describe('parseInviteeEmails', () => {
	test('splits pasted emails on commas, spaces, and newlines, deduped case-insensitively', () => {
		expect(
			parseInviteeEmails('a@Example.com, b@example.com\nc@example.com'),
		).toEqual(['a@Example.com', 'b@example.com', 'c@example.com']);
	});
});
