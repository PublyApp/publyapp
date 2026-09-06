export type CsvValue = string | number | null | undefined;

const neutralizeFormula = (value: string): string => {
	const prefix = value.replace(/^[\u0000-\u001f\s]+/g, '')[0];
	if (prefix === '=' || prefix === '+' || prefix === '-' || prefix === '@') {
		return `'${value}`;
	}

	return value;
};

const escapeCsvField = (value: CsvValue): string => {
	const safeValue = neutralizeFormula(value == null ? '' : String(value));
	if (/[",\r\n]/.test(safeValue)) {
		return `"${safeValue.replaceAll('"', '""')}"`;
	}

	return safeValue;
};

export const buildCsv = (rows: readonly (readonly CsvValue[])[]): string =>
	rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
