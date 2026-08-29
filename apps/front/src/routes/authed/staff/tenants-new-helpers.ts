const TENANT_CODE_MIN_LENGTH = 3;
const TENANT_CODE_MAX_LENGTH = 40;

// Mirrors CreateTenantAsStaffBodyValidator.CodeFormatRegex on the backend —
// lowercase letters, digits, and single hyphens between segments.
const TENANT_CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidTenantCode = (code: string): boolean => {
	const trimmed = code.trim();

	return (
		trimmed.length >= TENANT_CODE_MIN_LENGTH &&
		trimmed.length <= TENANT_CODE_MAX_LENGTH &&
		TENANT_CODE_REGEX.test(trimmed)
	);
};

/** Preview-only fallback (never submitted) when the slug field is left blank. */
export const slugifyTenantNamePlaceholder = (name: string): string =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

export type ImportedMemberRole = 'Admin' | 'User';

export type CsvParsedRow = Record<string, string>;

export type ImportedMember = {
	email: string;
	accountLevel: ImportedMemberRole;
};

export type MemberImportOutcome = {
	detectedCount: number;
	valid: ImportedMember[];
	invalidCount: number;
	duplicateCount: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Character-scanning CSV parser: handles quoted fields (with embedded commas
 * and escaped `""` quotes) and both CRLF and LF line endings. */
const parseCsvRows = (text: string): string[][] => {
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let hasContent = false;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
		hasContent = false;
	};

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			hasContent = true;
			continue;
		}

		if (char === ',') {
			pushField();
			hasContent = true;
			continue;
		}

		if (char === '\r') {
			continue;
		}

		if (char === '\n') {
			if (hasContent || field.length > 0) {
				pushRow();
			} else {
				row = [];
			}
			continue;
		}

		field += char;
		hasContent = true;
	}

	if (hasContent || field.length > 0) {
		pushRow();
	}

	return rows;
};

/** CSV → row records keyed by lowercased header. Data rows that are entirely
 * blank are dropped. */
export const parseCsv = (text: string): CsvParsedRow[] => {
	const rows = parseCsvRows(text);
	if (rows.length === 0) {
		return [];
	}

	const [headerRow, ...dataRows] = rows;
	const headers = headerRow!.map((header) => header.trim().toLowerCase());

	const records: CsvParsedRow[] = [];
	for (const row of dataRows) {
		if (!row.some((cell) => cell.trim().length > 0)) {
			continue;
		}
		const record: CsvParsedRow = {};
		headers.forEach((header, index) => {
			record[header] = (row[index] ?? '').trim();
		});
		records.push(record);
	}
	return records;
};

export const mapImportedRoleToAccountLevel = (
	rawRole: string | undefined | null,
): ImportedMemberRole => {
	const normalized = (rawRole ?? '').trim().toLowerCase();
	if (normalized === 'admin' || normalized === 'owner') {
		return 'Admin';
	}
	return 'User';
};

/** Dedupes parsed rows against each other and against `existingEmails`
 * (owners + manual members already entered), and excludes malformed emails —
 * both silently, from `valid`. */
export const buildMemberImportOutcome = ({
	rows,
	existingEmails,
}: {
	rows: CsvParsedRow[];
	existingEmails: string[];
}): MemberImportOutcome => {
	const seen = new Set<string>();
	for (const email of existingEmails) {
		const trimmed = email.trim().toLowerCase();
		if (trimmed) {
			seen.add(trimmed);
		}
	}

	let invalidCount = 0;
	let duplicateCount = 0;
	const valid: ImportedMember[] = [];

	for (const row of rows) {
		const email = (row.email ?? '').trim();
		const normalizedEmail = email.toLowerCase();

		if (!EMAIL_REGEX.test(email)) {
			invalidCount += 1;
			continue;
		}

		if (seen.has(normalizedEmail)) {
			duplicateCount += 1;
			continue;
		}

		seen.add(normalizedEmail);
		valid.push({
			email,
			accountLevel: mapImportedRoleToAccountLevel(row.role),
		});
	}

	return {
		detectedCount: rows.length,
		valid,
		invalidCount,
		duplicateCount,
	};
};

export const buildTenantMemberCsvTemplate = (): string =>
	'email,role\nuser@example.com,member\n';

/** Merges owners (always Admin) + parsed CSV/Excel members + manual member
 * slots into the `initialUsers` submit payload, owners first, deduped
 * case-insensitively across all three sources. */
export const mergeInitialUsers = ({
	owners,
	parsedMembers,
	manualMembers,
}: {
	owners: Array<{ email: string }>;
	parsedMembers: ImportedMember[];
	manualMembers: ImportedMember[];
}): ImportedMember[] => {
	const seen = new Set<string>();
	const merged: ImportedMember[] = [];

	const pushUnique = (email: string, accountLevel: ImportedMemberRole) => {
		const trimmed = email.trim();
		if (!trimmed) {
			return;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		merged.push({ email: trimmed, accountLevel });
	};

	owners.forEach((owner) => {
		pushUnique(owner.email, 'Admin');
	});
	parsedMembers.forEach((member) => {
		pushUnique(member.email, member.accountLevel);
	});
	manualMembers.forEach((member) => {
		pushUnique(member.email, member.accountLevel);
	});

	return merged;
};
