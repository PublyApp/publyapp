const escapeCsvCell = (value: string | number | null | undefined) => {
	const normalizedValue = value == null ? '' : String(value);
	return `"${normalizedValue.replaceAll('"', '""')}"`;
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
