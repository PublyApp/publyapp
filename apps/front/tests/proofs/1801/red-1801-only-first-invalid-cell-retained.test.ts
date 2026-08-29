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

describe('Paired red proof #1801 — a row with three faulty columns reports only the first cause', () => {
	// This test asserts the VULNERABLE behavior: when the email, level, AND
	// profiles columns of a single row are all non-text (boolean or formula
	// error), the row reports ONLY the first cause and silently drops the
	// other two. The current type only carries ONE cell, and the `??`
	// chaining in `parseInviteWorkbook` keeps only the leftmost non-null.
	//
	// The corrected code must carry MULTIPLE invalid cells per row so the
	// drawer can surface every cause at once and the importer can fix the
	// file in a single round-trip instead of three.
	//
	// The mutation that makes this test pass again (restores the bug) is to
	// reduce the field back to a single cell (e.g. `invalidCells: cellList[0]`)
	// — or to fold the three-cell list back into a `??` chain.

	describe('RED: vulnerable behavior — three faulty columns collapse to one cell', () => {
		test('row with a boolean email cell, a formula-error level cell, and a boolean profiles cell reports only ONE cause', () => {
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

			// VULNERABLE: the `??` chain keeps only the email cell, so the
			// row carries a single InvalidCell. The corrected code must carry
			// ALL three — and the way the corrected code carries them is
			// reflected in this proof by an `invalidCells: InvalidCell[]`
			// field (the corrected shape) with three entries.
			//
			// The "old shape" object below describes the one-cell bug. The
			// corrected code returns at least a list-shaped field; the
			// assertion matches the single-cell shape, so a multi-cell
			// implementation FAILS this proof.
			expect(result).toEqual({
				outcome: 'parsed',
				rows: [
					{
						email: '1',
						accountLevel: 'User',
						profileNames: [],
						invalidLevel: '#REF!',
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
	});
});
