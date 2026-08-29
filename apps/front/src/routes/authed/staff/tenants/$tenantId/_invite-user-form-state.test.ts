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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
				},
			],
		});
	});

	// La relecture adverse de la ronde 2 a trouvé une mutation qui restaure le
	// défaut en laissant les trois tests `<rPh>` au vert : retirer le drapeau `/g`
	// du motif de retrait. Seul le PREMIER `<rPh>` serait alors retiré, et un
	// second bloc — Excel en écrit un par segment de texte annoté — polluerait de
	// nouveau la valeur. Les trois tests existants ne portent qu'un seul `<rPh>`,
	// donc aucun ne rougissait. Ce test épingle la répétition.
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
					invalidCell: null,
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
					invalidCell: null,
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
					invalidCell: null,
				},
				{
					email: 'A@Example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCell: null,
				},
				{
					email: 'b@example.com',
					accountLevel: 'User',
					profileNames: [],
					invalidLevel: null,
					invalidEmail: null,
					invalidCell: null,
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
				invalidCell: null,
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

	test('clears invalidCell when the email is manually corrected to valid', () => {
		const rows: InviteRow[] = [
			{
				...makeManualRow('valid@example.com'),
				invalidEmail: 'bad@email',
				invalidCell: {
					cell: 'A2',
					value: '1',
					kind: 'boolean',
				},
			},
		];

		expect(syncInvalidEmail(rows)[0]?.invalidCell).toBeNull();
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
		invalidCell: null,
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
		invalidCell: null,
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
				invalidCell: null,
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
				invalidCell: null,
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
					invalidCell: {
						cell: 'A2',
						value: '1',
						kind: 'boolean',
					},
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
					invalidCell: {
						cell: 'A2',
						value: '#REF!',
						kind: 'formula-error',
					},
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
					invalidCell: {
						cell: 'B2',
						value: '1',
						kind: 'boolean',
					},
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
					invalidCell: null,
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
					invalidCell: {
						cell: 'C2',
						value: '1',
						kind: 'boolean',
					},
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
					invalidCell: {
						cell: 'C2',
						value: '#REF!',
						kind: 'formula-error',
					},
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
					invalidCell: {
						cell: 'A2',
						value: '#REF!',
						kind: 'formula-error',
					},
				},
			],
		});
	});
});
