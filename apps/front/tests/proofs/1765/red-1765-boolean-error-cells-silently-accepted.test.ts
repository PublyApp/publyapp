import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';

import { parseInviteWorkbook } from '../../../src/routes/authed/staff/tenants/$tenantId/_invite-user-form-state';

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

describe('Paired red proof #1765 — boolean/error cells silently accepted as email', () => {
	// This test asserts the VULNERABLE behavior: a boolean cell (t="b") in the
	// email column is treated as plain text, passes through email validation,
	// and is flagged only as an invalid email (because "1" fails EMAIL_REGEX).
	// The vulnerable code has NO cell-type check, so no `invalidCell` is set.
	// Against the corrected code, this test must FAIL (red) because the cell is
	// now rejected with a structured `invalidCell` error before email validation,
	// so `invalidEmail` stays null.
	//
	// The mutation that makes this test pass again (restores the bug) is to
	// remove the type check in mapEmailToRowField so t="b"/t="e" cells are
	// treated as plain text.
	describe('RED: vulnerable behavior — boolean/error cells treated as text', () => {
		test('boolean cell (t="b") in email column is silently accepted as text and flagged only as invalid email', () => {
			const bytes = buildWorkbook({
				sharedStrings: ['email', 'level', 'profiles', 'admin', 'Alpha'],
				sheetXml:
					'<worksheet><sheetData>' +
					'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
					'<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
					'</sheetData></worksheet>',
			});

			const result = parseInviteWorkbook(bytes);

			// VULNERABLE: the boolean value "1" is treated as plain text, fails
			// EMAIL_REGEX, and is flagged as invalidEmail — but no `invalidCell`
			// names the offending cell. The corrected code must produce
			// `invalidEmail: null` + `invalidCell: { cell: 'A2', value: '1', kind: 'boolean' }`,
			// which will NOT match this expectation.
			expect(result).toEqual({
				outcome: 'parsed',
				rows: [
					{
						email: '1',
						accountLevel: 'Admin',
						profileNames: ['Alpha'],
						invalidLevel: null,
						invalidEmail: '1',
					},
				],
			});
		});

		test('formula error cell (t="e") in email column is silently accepted as text and flagged only as invalid email', () => {
			const bytes = buildWorkbook({
				sharedStrings: ['email', 'level', 'profiles', 'admin', 'Alpha'],
				sheetXml:
					'<worksheet><sheetData>' +
					'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
					'<row r="2"><c r="A2" t="e"><v>#REF!</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
					'</sheetData></worksheet>',
			});

			const result = parseInviteWorkbook(bytes);

			// VULNERABLE: the error value "#REF!" is treated as plain text, fails
			// EMAIL_REGEX, and is flagged as invalidEmail — but no `invalidCell`
			// names the offending cell. The corrected code must produce
			// `invalidEmail: null` + `invalidCell: { cell: 'A2', value: '#REF!', kind: 'formula-error' }`,
			// which will NOT match this expectation.
			expect(result).toEqual({
				outcome: 'parsed',
				rows: [
					{
						email: '#REF!',
						accountLevel: 'Admin',
						profileNames: ['Alpha'],
						invalidLevel: null,
						invalidEmail: '#REF!',
					},
				],
			});
		});
	});
});
