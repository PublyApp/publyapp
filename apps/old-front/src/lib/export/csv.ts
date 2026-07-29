// CWE-1236 / spreadsheet formula injection: cells starting with one of these
// characters are interpreted as formulas by Excel and Google Sheets, which can
// execute attacker-controlled HYPERLINK / WEBSERVICE calls when the export is
// opened. Prefixing with a single quote neutralizes them.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

const neutralizeFormula = (raw: string) =>
	raw.length > 0 && FORMULA_PREFIXES.includes(raw[0]) ? `'${raw}` : raw;

const escapeCsvCell = (value: string | number | null | undefined) => {
	const normalizedValue = value == null ? '' : String(value);
	const safe = neutralizeFormula(normalizedValue);
	return `"${safe.replaceAll('"', '""')}"`;
};

export const buildCsv = (
	rows: Array<Array<string | number | null | undefined>>,
) => {
	// Quote every field so exports stay valid even when values contain commas,
	// quotes, or line breaks from user-entered text / formatted dates.
	return rows
		.map((row) => row.map((value) => escapeCsvCell(value)).join(','))
		.join('\n');
};
