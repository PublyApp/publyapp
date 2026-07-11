import type { CsvParsedRow } from './tenants-new-helpers';

const toCellString = (value: unknown): string => {
	if (typeof value === 'string' || typeof value === 'number') {
		return String(value);
	}

	return '';
};

/** Parses the first sheet of an uploaded `.xlsx`/`.xls` workbook into the same
 * `{ email, role }` row shape the CSV parser produces. `xlsx` (SheetJS) is
 * dynamically imported here only, so it never lands in the main bundle. */
export const parseXlsxFile = async (file: File): Promise<CsvParsedRow[]> => {
	const XLSX = await import('xlsx');
	const buffer = await file.arrayBuffer();
	const workbook = XLSX.read(buffer, { type: 'array' });

	const firstSheetName = workbook.SheetNames[0];
	if (!firstSheetName) {
		return [];
	}

	const sheet = workbook.Sheets[firstSheetName];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		defval: '',
	});

	return rows.map((row) => {
		const record: CsvParsedRow = {};
		for (const [key, value] of Object.entries(row)) {
			record[key.trim().toLowerCase()] = toCellString(value).trim();
		}
		return record;
	});
};
