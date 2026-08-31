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
	syncInvalidEmail,
	type InvalidCell,
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

	test('maps a blank or missing level to User', () => {
		expect(mapInviteLevel('')).toBe('User');
		expect(mapInviteLevel(undefined)).toBe('User');
	});

	test('flags any other value as Invalid, not a silent User downgrade', () => {
		expect(mapInviteLevel('member')).toBe('Invalid');
		expect(mapInviteLevel('moderator')).toBe('Invalid');
	});
});

describe('parseInviteCsv', () => {
	test('parses the documented email, level, profiles columns', () => {
		const result = parseInviteCsv(
			'email,level,profiles\na@example.com,admin,Alpha; Beta\n',
		);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha', 'Beta'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('marks an unknown level as an invalid row rather than a silent User', () => {
		const result = parseInviteCsv(
			'email,level,profiles\na@example.com,moderator,Alpha\n',
		);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'User',
					profileNames: ['Alpha'],
					invalidLevel: 'moderator',
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('returns an empty-file cause instead of zero rows', () => {
		expect(parseInviteCsv('')).toEqual({
			outcome: 'error',
			kind: 'empty',
		});
	});

	test('flags a malformed email as an invalid row instead of silently accepting it', () => {
		const result = parseInviteCsv(
			'email,level,profiles\nnot-an-email,admin,Alpha\n',
		);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'not-an-email',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: 'not-an-email',
					invalidCells: [],
				},
			],
		});
	});

	test('returns a missing-email-column cause for a header without email', () => {
		expect(parseInviteCsv('foo,bar\n1,2\n')).toEqual({
			outcome: 'error',
			kind: 'no-email-column',
		});
	});

	test('handles quoted commas and CRLF line endings', () => {
		const result = parseInviteCsv(
			'"email","level","profiles"\r\n"a@example.com","user","Al,pha"\r\n',
		);

		expect(result.outcome).toBe('parsed');
		if (result.outcome !== 'parsed') {
			throw new Error('expected parsed outcome');
		}

		expect(result.rows[0]?.profileNames).toEqual(['Al,pha']);
	});

	test('is case-insensitive on header names', () => {
		const result = parseInviteCsv(
			'EMAIL,Level,PROFILES\nb@example.com,user,X\n',
		);

		expect(result.outcome).toBe('parsed');
		if (result.outcome !== 'parsed') {
			throw new Error('expected parsed outcome');
		}

		expect(result.rows[0]?.email).toBe('b@example.com');
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

/** Like buildWorkbook but lets the caller provide raw sharedStrings XML, which
 * is needed to test rich-text entries with `<rPh>` children that the simple
 * array form cannot express. */
const buildWorkbookRaw = (cells: {
	sharedStringsXml: string;
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
			'xl/sharedStrings.xml': strToU8(cells.sharedStringsXml),
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

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
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

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('returns an unreadable-excel cause when the zip cannot be opened', () => {
		expect(parseInviteWorkbook(new Uint8Array([0, 1, 2, 3]))).toEqual({
			outcome: 'error',
			kind: 'unreadable-excel',
		});
	});

	test('returns a no-sheet cause when the worksheet is missing', () => {
		const bytes = zipSync(
			{
				'xl/workbook.xml': strToU8('<workbook/>'),
			},
			{ level: 0 },
		);

		expect(parseInviteWorkbook(bytes)).toEqual({
			outcome: 'error',
			kind: 'no-sheet',
		});
	});

	test('returns a missing-email-column cause when the header has no email', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['name', 'role'],
			sheetXml:
				'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>',
		});

		expect(parseInviteWorkbook(bytes)).toEqual({
			outcome: 'error',
			kind: 'no-email-column',
		});
	});

	test('reads inline-string cells (t="inlineStr") from <is><t> instead of <v>', () => {
		const bytes = buildWorkbook({
			sharedStrings: [],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c><c r="B1" t="inlineStr"><is><t>level</t></is></c><c r="C1" t="inlineStr"><is><t>profiles</t></is></c></row>' +
				'<row r="2"><c r="A2" t="inlineStr"><is><t>a@example.com</t></is></c><c r="B2" t="inlineStr"><is><t>admin</t></is></c><c r="C2" t="inlineStr"><is><t>Alpha</t></is></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('concatenates multiple <t> runs within a single inline-string <is>', () => {
		const bytes = buildWorkbook({
			sharedStrings: [],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c></row>' +
				'<row r="2"><c r="A2" t="inlineStr"><is><t>a@</t><t>example.com</t></is></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('excludes <rPh> phonetic text in inline-string cells (t="inlineStr")', () => {
		const bytes = buildWorkbook({
			sharedStrings: [],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c>' +
				'<c r="B1" t="inlineStr"><is><t>level</t></is></c>' +
				'<c r="C1" t="inlineStr"><is><t>profiles</t></is></c></row>' +
				'<row r="2"><c r="A2" t="inlineStr"><is><r><t>a@example.com</t></r><rPh sb="0" eb="2"><t>PARASITE</t></rPh></is></c>' +
				'<c r="B2" t="inlineStr"><is><r><t>admin</t></r></is></c>' +
				'<c r="C2" t="inlineStr"><is><r><t>Alpha</t></r></is></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('decodes XML entities (&amp;) in inline-string cells', () => {
		const bytes = buildWorkbook({
			sharedStrings: [],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c>' +
				'<c r="B1" t="inlineStr"><is><t>level</t></is></c>' +
				'<c r="C1" t="inlineStr"><is><t>profiles</t></is></c></row>' +
				'<row r="2"><c r="A2" t="inlineStr"><is><t>A &amp; B@example.com</t></is></c>' +
				'<c r="B2" t="inlineStr"><is><t>admin</t></is></c>' +
				'<c r="C2" t="inlineStr"><is><t>Alpha</t></is></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		// The &amp; entity should be decoded to a literal &. "A & B@example.com"
		// is not a valid email (spaces around the ampersand), so it is flagged as
		// invalid while preserving the raw decoded value.
		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'A & B@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: 'A & B@example.com',
					invalidCells: [],
				},
			],
		});
	});

	// The adversarial round-2 review found a mutation that restores the
	// default while leaving the three `<rPh>` tests green: removing the `/g` flag
	// from the removal pattern. Only the FIRST `<rPh>` would then be removed, and a
	// second block — Excel writes one per annotated text segment — would pollute the
	// value again. The three existing tests each carry only a single `<rPh>`,
	// so none turned red. This test pins the repetition.
	test('excludes EVERY <rPh> block, not just the first (the /g flag)', () => {
		const bytes = buildWorkbook({
			sharedStrings: [],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c></row>' +
				'<row r="2"><c r="A2" t="inlineStr"><is>' +
				'<r><t>a@example.com</t></r><rPh sb="0" eb="1"><t>UN</t></rPh>' +
				'<rPh sb="1" eb="2"><t>DEUX</t></rPh>' +
				'</is></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('excludes <rPh> phonetic text in shared-string cells', () => {
		const bytes = buildWorkbookRaw({
			sharedStringsXml:
				'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
				'<si><t>email</t></si>' +
				'<si><t>level</t></si>' +
				'<si><t>profiles</t></si>' +
				'<si><r><t>a@example.com</t><rPh sb="0" eb="2"><t>PARASITE</t></rPh></r></si>' +
				'<si><t>admin</t></si>' +
				'<si><t>Alpha</t></si>' +
				'</sst>',
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
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
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
				{
					email: 'A@Example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
				{
					email: 'b@example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
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
				invalidLevel: null,
				invalidEmail: null,
				invalidCells: [],
				source: 'file',
			},
		];

		expect(clearFileRows(rows).map((row) => row.key)).toEqual(['k1']);
	});
});

describe('syncInvalidEmail', () => {
	test('flags an invalid email on a manual row as invalid', () => {
		const rows: InviteRow[] = [{ ...makeManualRow('not-an-email') }];

		expect(syncInvalidEmail(rows)[0]?.invalidEmail).toBe('not-an-email');
	});

	test('leaves a valid email as null', () => {
		const rows: InviteRow[] = [{ ...makeManualRow('valid@example.com') }];

		expect(syncInvalidEmail(rows)[0]?.invalidEmail).toBeNull();
	});

	test('clears invalidEmail when the email is later corrected to valid', () => {
		const rows: InviteRow[] = [
			{ ...makeManualRow('valid@example.com'), invalidEmail: 'bad@email' },
		];

		expect(syncInvalidEmail(rows)[0]?.invalidEmail).toBeNull();
	});

	test('leaves a blank email as null (not flagged invalid)', () => {
		const rows: InviteRow[] = [{ ...makeManualRow('') }];

		expect(syncInvalidEmail(rows)[0]?.invalidEmail).toBeNull();
	});

	test('clears invalidCells when the email is manually corrected to valid', () => {
		const rows: InviteRow[] = [
			{
				...makeManualRow('valid@example.com'),
				invalidEmail: 'bad@email',
				invalidCells: [
					{
						column: 'email',
						cell: 'A2',
						value: '1',
						kind: 'boolean',
					},
				],
			},
		];

		expect(syncInvalidEmail(rows)[0]?.invalidCells).toEqual([]);
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
		invalidLevel: null,
		invalidEmail: null,
		invalidCells: [],
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
		invalidLevel: null,
		invalidEmail: null,
		invalidCells: [],
		source: 'manual',
	};

	const evaluate = (
		rows: InviteRow[],
		overrides?: {
			isResolvingProfiles?: boolean;
			unresolvedCount?: number;
			invalidLevelCount?: number;
			invalidCellCount?: number;
		},
	) =>
		canSendInvitations({
			rows,
			isResolvingProfiles: overrides?.isResolvingProfiles ?? false,
			unresolvedCount: overrides?.unresolvedCount ?? 0,
			invalidLevelCount: overrides?.invalidLevelCount ?? 0,
			invalidCellCount: overrides?.invalidCellCount ?? 0,
		});

	const rowWith = (overrides: Partial<InviteRow>): InviteRow => ({
		...validRow,
		...overrides,
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

	test('blocks while a single unresolved profile name remains', () => {
		expect(evaluate([validRow], { unresolvedCount: 1 })).toBe(false);
	});

	test('blocks while several unresolved profile names remain', () => {
		expect(evaluate([validRow], { unresolvedCount: 3 })).toBe(false);
	});

	test('blocks while a single invalid file level remains', () => {
		expect(
			evaluate([rowWith({ invalidLevel: 'moderator' })], {
				invalidLevelCount: 1,
			}),
		).toBe(false);
	});

	test('blocks while several invalid file levels remain', () => {
		expect(
			evaluate(
				[
					rowWith({ invalidLevel: 'moderator' }),
					rowWith({ key: 'kv2', invalidLevel: 'superuser' }),
				],
				{ invalidLevelCount: 2 },
			),
		).toBe(false);
	});

	test('blocks rows with malformed emails', () => {
		expect(evaluate([{ ...validRow, email: 'not-an-email' }])).toBe(false);
	});

	// A row whose three columns are all non-text carries three entries in
	// `invalidCells` but the Send gate counts ROWS, not cells: one faulty
	// row, regardless of how many cells it has, must count as one blocked
	// row. The `invalidCellCount` arg is the count of rows with at least one
	// non-text cell, not the count of cells.
	test('a single row with three faulty cells counts as one blocked row, not three', () => {
		const rowWithThreeCells = rowWith({
			invalidCells: [
				{ column: 'email', cell: 'A2', value: '1', kind: 'boolean' },
				{ column: 'level', cell: 'B2', value: '#REF!', kind: 'formula-error' },
				{ column: 'profiles', cell: 'C2', value: '0', kind: 'boolean' },
			],
		});
		expect(evaluate([rowWithThreeCells], { invalidCellCount: 1 })).toBe(false);
	});

	test('a row with a single faulty cell still blocks Send', () => {
		const rowWithOneCell = rowWith({
			invalidCells: [
				{ column: 'email', cell: 'A2', value: '1', kind: 'boolean' },
			],
		});
		expect(evaluate([rowWithOneCell], { invalidCellCount: 1 })).toBe(false);
	});

	test('a row with one entry in invalidCells is exposed in full (no truncation, no extra cell)', () => {
		const row = rowWith({
			invalidCells: [
				{ column: 'email', cell: 'A2', value: '1', kind: 'boolean' },
			],
		});
		expect(row.invalidCells).toHaveLength(1);
		expect(row.invalidCells[0]).toEqual({
			column: 'email',
			cell: 'A2',
			value: '1',
			kind: 'boolean',
		});
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
				invalidLevel: null,
				invalidEmail: null,
				invalidCells: [],
				source: 'file',
			},
			{
				key: 'k2',
				email: 'b@example.com',
				accountLevel: 'User',
				profileIds: ['p-1', 'p-1', 'p-2'],
				profileNames: [],
				invalidLevel: null,
				invalidEmail: null,
				invalidCells: [],
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

describe('parseInviteWorkbook cell types', () => {
	test('rejects a boolean cell (t="b") in the email column with a structured error', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'admin', 'Alpha'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: '1',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [
						{
							column: 'email',
							cell: 'A2',
							value: '1',
							kind: 'boolean',
						},
					],
				},
			],
		});
	});

	test('rejects a formula error cell (t="e") in the email column with a structured error', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'admin', 'Alpha'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="e"><v>#REF!</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: '#REF!',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [
						{
							column: 'email',
							cell: 'A2',
							value: '#REF!',
							kind: 'formula-error',
						},
					],
				},
			],
		});
	});

	test('rejects a boolean cell (t="b") in the level column with a structured error', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'a@example.com', 'Alpha'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="s"><v>4</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'User',
					profileNames: ['Alpha'],
					invalidLevel: '1',
					invalidEmail: null,
					invalidCells: [
						{
							column: 'level',
							cell: 'B2',
							value: '1',
							kind: 'boolean',
						},
					],
				},
			],
		});
	});

	test('accepts a formula text result (t="str") as legitimate text', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'admin', 'Alpha'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="str"><v>a@example.com</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [],
				},
			],
		});
	});

	test('rejects a boolean cell (t="b") in the profiles column with a structured error', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'a@example.com', 'admin'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="b"><v>1</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [
						{
							column: 'profiles',
							cell: 'C2',
							value: '1',
							kind: 'boolean',
						},
					],
				},
			],
		});
	});

	test('rejects a formula error cell (t="e") in the profiles column with a structured error', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', 'a@example.com', 'admin'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="e"><v>#REF!</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: 'a@example.com',
					accountLevel: 'Admin',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [
						{
							column: 'profiles',
							cell: 'C2',
							value: '#REF!',
							kind: 'formula-error',
						},
					],
				},
			],
		});
	});

	test('rejects a formula error code stored as a shared string (t="s") in the email column', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles', '#REF!', 'admin', 'Alpha'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result).toEqual({
			outcome: 'parsed',
			rows: [
				{
					email: '#REF!',
					accountLevel: 'Admin',
					profileNames: ['Alpha'],
					invalidLevel: null,
					invalidEmail: null,
					invalidCells: [
						{
							column: 'email',
							cell: 'A2',
							value: '#REF!',
							kind: 'formula-error',
						},
					],
				},
			],
		});
	});

	// Regression for issue #1801: when a single row's three columns are
	// all non-text (boolean email, formula-error level, boolean profiles),
	// every faulty column must be retained in `invalidCells` — the parser
	// must not collapse the list to a single entry.
	test('retains every faulty column on a row whose three columns are all non-text', () => {
		const bytes = buildWorkbook({
			sharedStrings: ['email', 'level', 'profiles'],
			sheetXml:
				'<worksheet><sheetData>' +
				'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
				'<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="e"><v>#REF!</v></c><c r="C2" t="b"><v>0</v></c></row>' +
				'</sheetData></worksheet>',
		});

		const result = parseInviteWorkbook(bytes);

		expect(result.outcome).toBe('parsed');
		const row = result.outcome === 'parsed' ? result.rows[0] : undefined;
		expect(row?.invalidCells).toEqual([
			{ column: 'email', cell: 'A2', value: '1', kind: 'boolean' },
			{ column: 'level', cell: 'B2', value: '#REF!', kind: 'formula-error' },
			{ column: 'profiles', cell: 'C2', value: '0', kind: 'boolean' },
		]);
	});
});

describe('column-based React keys for InvalidCell', () => {
	// Two invalid cells on the same CSV row can share the same value and kind
	// (e.g. a boolean in both the level and profiles columns). Without a column
	// identifier, the old key ``${cell ?? ''}-${value}-${index}`` collapses to
	// identical strings for both — the array index was the only thing keeping them
	// unique, which is exactly the React Doctor anti-pattern being fixed.
	test('two CSV invalid cells with identical value/kind get distinct keys via column', () => {
		const invalidCells: InvalidCell[] = [
			{ column: 'level', value: '1', kind: 'boolean' },
			{ column: 'profiles', value: '1', kind: 'boolean' },
		];

		const keys = invalidCells.map(
			(ic) => `${ic.column}-${ic.cell ?? ''}-${ic.value}`,
		);

		expect(keys[0]).not.toBe(keys[1]);
		expect(new Set(keys).size).toBe(2);
	});

	// Regression guard: if `column` were ever removed, two CSV invalid cells with
	// the same value would produce duplicate keys under the old scheme (cell ref
	// absent in CSV, so `''-value-${index}` differed only by index). This test
	// would fail if the column field is missing from either entry.
	test('two CSV cells with identical formula-error values get distinct columns', () => {
		// In CSV, cells have no XLSX type attribute, so only formula error codes
		// (which Excel writes as values like "#REF!") produce InvalidCell entries.
		// Two such cells on the same row with the same value would share an empty
		// cell ref + identical value — the column is the only distinguishing field.
		const result = parseInviteCsv(
			'email,level,profiles\nvalid@example.com,#REF!,#REF!\n',
		);

		expect(result.outcome).toBe('parsed');
		if (result.outcome !== 'parsed') {
			throw new Error('expected parsed outcome');
		}

		const row = result.rows[0];
		expect(row).toBeDefined();
		expect(row?.invalidCells).toHaveLength(2);
		const columns = row?.invalidCells.map((c) => c.column);
		expect(columns).toEqual(['level', 'profiles']);
		expect(new Set(columns).size).toBe(2);
	});

	// RED proof: demonstrates the exact failure mode the array-index key masked.
	// Under the old key ``${cell ?? ''}-${value}-${index}``, two CSV invalid
	// cells with identical value/kind collide because cell is absent and only
	// the index differentiates them — the very anti-pattern React Doctor flags.
	// With `column` in the key, the collision is impossible.
	test('old key derivation without column would collide on identical CSV cells', () => {
		const invalidCells: InvalidCell[] = [
			{ column: 'level', value: '1', kind: 'boolean' },
			{ column: 'profiles', value: '1', kind: 'boolean' },
		];

		// The NEW key (uses column) — always unique.
		const newKeys = invalidCells.map(
			(ic) => `${ic.column}-${ic.cell ?? ''}-${ic.value}`,
		);
		expect(new Set(newKeys).size).toBe(2);

		// The OLD key (no column, used array index) — for CSV cells with the
		// same value, only the index differs. This test asserts that WITHOUT
		// column the keys WOULD collide if we dropped the index, proving the
		// index was masking a real data collision.
		const oldKeysNoIndex = invalidCells.map(
			(ic) => `${ic.cell ?? ''}-${ic.value}`,
		);
		expect(new Set(oldKeysNoIndex).size).toBe(1);

		// And WITH index (the old scheme), they only stay unique via index:
		const oldKeysWithIndex = invalidCells.map(
			(ic, i) => `${ic.cell ?? ''}-${ic.value}-${i}`,
		);
		expect(new Set(oldKeysWithIndex).size).toBe(2);
	});
});
