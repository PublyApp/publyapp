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

describe('Paired red proof #1801 — a row with three faulty columns must surface every cause', () => {
	// This test asserts the IDEAL behavior: when the email, level, AND
	// profiles columns of a single row are all non-text (boolean or formula
	// error), the row must carry ALL three causes so the drawer can name
	// each offending cell and value at once.
	//
	// Against the CURRENT (buggy) code, the `??` chain in parseInviteWorkbook
	// keeps only the first non-null InvalidCell, so the row reports ONE
	// cause and silently drops the other two. The corrected code must carry
	// a list of cells, e.g. `invalidCells: InvalidCell[]`, with three
	// entries — this proof will then pass.
	//
	// The "kept red" contract under apps/front/scripts/ci/run-preuves.mts
	// means this test is EXPECTED to fail in vitest against the corrected
	// code only if the proof has gone stale. Right now (bug present) the
	// test must fail, which the runner classifies as "OK: bug still
	// present, proof intact". After the fix, the test passes and the
	// runner reports "unexpected pass" → the proof is removed.
	//
	// The mutation that makes this test pass again while restoring the
	// default behaviour is to fold the three-cell list back into a `??`
	// chain (e.g. `invalidCells: cellList[0]`), or to keep the single-cell
	// field type. That mutation is exactly what the fix must remove.

	describe('RED: three faulty columns must all be reported on the same row', () => {
		test('row with boolean email, formula-error level, and boolean profiles carries all three cells', () => {
			// Row 2: A2 is t="b" (boolean), B2 is t="e" (formula error #REF!),
			// C2 is t="b" (boolean). All three columns carry a non-text cell.
			const bytes = buildWorkbook({
				sharedStrings: ['email', 'level', 'profiles'],
				sheetXml:
					'<worksheet><sheetData>' +
					'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
					'<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="e"><v>#REF!</v></c><c r="C2" t="b"><v>0</v></c></row>' +
					'</sheetData></worksheet>',
			});

			const result = parseInviteWorkbook(bytes);

			// IDEAL: the row must carry every cause. The corrected shape is
			// `invalidCells: InvalidCell[]` with three entries — one per
			// faulty column. The current (buggy) code collapses to a single
			// InvalidCell via the `??` chain, so this assertion does not
			// match and the test fails (red), as required by the proof.
			expect(result).toEqual({
				outcome: 'parsed',
				rows: [
					{
						email: '1',
						accountLevel: 'User',
						profileNames: [],
						invalidLevel: '#REF!',
						invalidEmail: null,
						invalidCells: [
							{ cell: 'A2', value: '1', kind: 'boolean' },
							{ cell: 'B2', value: '#REF!', kind: 'formula-error' },
							{ cell: 'C2', value: '0', kind: 'boolean' },
						],
					},
				],
			});
		});
	});
});
