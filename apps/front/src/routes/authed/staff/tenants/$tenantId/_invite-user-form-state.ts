import { strFromU8, unzipSync } from 'fflate';

/**
 * Invite-drawer row state: one invited person, whether they came from the
 * dropped CSV/Excel file or a manual row, and the profile names the file
 * carried (manual rows never have names — only ids picked in the UI).
 */
export type InviteRow = {
	/** Stable per-row identity for React keys and unresolved-name lookups. */
	key: string;
	email: string;
	accountLevel: 'Admin' | 'User';
	profileIds: string[];
	/** Raw names as parsed from the file; empty for manual rows. */
	profileNames: string[];
	source: 'file' | 'manual';
};

export type ProfileNameResolution = {
	name: string;
	profileId: string | null;
	reason: 'not-found' | 'ambiguous' | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `;` or `|` between profile names — documented in the downloadable template. */
export const splitProfileNames = (raw: string): string[] =>
	raw
		.split(/[;|]/)
		.map((piece) => piece.trim())
		.filter(Boolean);

export const mapInviteLevel = (
	rawLevel: string | undefined | null,
): 'Admin' | 'User' => {
	const normalized = (rawLevel ?? '').trim().toLowerCase();
	return normalized === 'admin' || normalized === 'owner' ? 'Admin' : 'User';
};

/** Splits pasted emails on commas, whitespace, and newlines; dedupes
 * case-insensitively while keeping first-seen casing. */
export const parseInviteeEmails = (value: string): string[] => {
	const emails: string[] = [];
	const seen = new Set<string>();

	for (const candidate of value.split(/[\s,]+/)) {
		const email = candidate.trim();
		const identity = email.toLowerCase();
		if (!email || seen.has(identity)) {
			continue;
		}

		emails.push(email);
		seen.add(identity);
	}

	return emails;
};

/** Character-scanning CSV parser: quoted fields with embedded commas and
 * escaped quotes, CRLF + LF endings, blank trailing lines dropped. */
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

export type ParsedInviteRow = {
	email: string;
	accountLevel: 'Admin' | 'User';
	profileNames: string[];
};

/** CSV → invite rows via the documented header: `email, level, profiles`. */
export const parseInviteCsv = (text: string): ParsedInviteRow[] => {
	const rawRows = parseCsvRows(text);
	if (rawRows.length === 0) {
		return [];
	}

	const [headerRow, ...dataRows] = rawRows;
	const headers = headerRow!.map((header) => header.trim().toLowerCase());
	const indexOfEmail = headers.indexOf('email');
	const indexOfLevel = headers.indexOf('level');
	const indexOfProfiles = headers.indexOf('profiles');

	return dataRows
		.filter((row) => row.some((cell) => cell.trim().length > 0))
		.map((row) => ({
			email: (row[indexOfEmail] ?? '').trim(),
			accountLevel: mapInviteLevel(row[indexOfLevel]),
			profileNames: splitProfileNames(row[indexOfProfiles] ?? ''),
		}));
};

/** Column letter(s) (`A`, `B`, … `AA`) → zero-based index. */
const columnIndexFromRef = (letters: string): number => {
	let index = 0;
	for (let i = 0; i < letters.length; i += 1) {
		index = index * 26 + (letters.charCodeAt(i) - 64);
	}

	return index - 1;
};

const XML_ENTITY_MAP: Record<string, string> = {
	'&lt;': '<',
	'&gt;': '>',
	'&amp;': '&',
};

const decodeXmlEntities = (value: string): string =>
	value.replace(
		/&(?:lt|gt|amp);/g,
		(entity) => XML_ENTITY_MAP[entity] ?? entity,
	);

const textContents = (xml: string, tag: string): string[] => {
	const results: string[] = [];
	const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
	let match = pattern.exec(xml);
	while (match) {
		results.push(match[1] ?? '');
		match = pattern.exec(xml);
	}

	return results;
};

/** Minimal xlsx reader over fflate: shared strings + first worksheet only.
 * SheetJS was dropped repo-wide for unfixed CVEs (round-1 review shell-F1);
 * this covers exactly what an invite sheet needs: shared-string cells read
 * positionally by their `r` reference so sparse gaps stay aligned. */
export const parseInviteWorkbook = (bytes: Uint8Array): ParsedInviteRow[] => {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes);
	} catch {
		return [];
	}

	const sheetXmlBytes = files['xl/worksheets/sheet1.xml'];
	if (!sheetXmlBytes) {
		return [];
	}

	const sheetXml = strFromU8(sheetXmlBytes);
	const sharedStringsXml = files['xl/sharedStrings.xml']
		? strFromU8(files['xl/sharedStrings.xml'])
		: '';
	// Each <si> may hold one or more <t> runs; concatenate them.
	const sharedStrings = textContents(sharedStringsXml, 'si').map((entry) =>
		decodeXmlEntities(textContents(entry, 't').join('')),
	);

	const rows: ParsedInviteRow[] = [];
	const rawRecords: Array<Record<number, string>> = [];
	for (const rowXml of textContents(sheetXml, 'row')) {
		const cells: Record<number, string> = {};
		const cellPattern = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
		let cellMatch = cellPattern.exec(rowXml);
		while (cellMatch) {
			const attrs = cellMatch[1] ?? '';
			const body = cellMatch[2] ?? '';
			const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
			const refIndex = refMatch ? columnIndexFromRef(refMatch[1]!) : -1;

			let value = '';
			if (/t="s"/.test(attrs)) {
				const sharedIndex = Number.parseInt(
					textContents(body, 'v')[0] ?? '',
					10,
				);
				value = Number.isInteger(sharedIndex)
					? (sharedStrings[sharedIndex] ?? '')
					: '';
			} else {
				value = decodeXmlEntities(textContents(body, 'v')[0] ?? '');
			}

			if (refIndex >= 0) {
				cells[refIndex] = value.trim();
			}

			cellMatch = cellPattern.exec(rowXml);
		}

		if (Object.keys(cells).length === 0) {
			continue;
		}

		rawRecords.push(cells);
	}

	// Columns are located through the header row's own positions so sparse
	// sheets (blank columns between email/level/profiles) stay aligned.
	const headerRecord = rawRecords.find((record) =>
		Object.values(record).some(
			(value) => value.trim().toLowerCase() === 'email',
		),
	);
	if (!headerRecord) {
		return [];
	}

	const columnIndexOf = (headerName: string): number => {
		for (const [key, value] of Object.entries(headerRecord)) {
			if (value.trim().toLowerCase() === headerName) {
				return Number(key);
			}
		}

		return -1;
	};
	const emailColumn = columnIndexOf('email');
	const levelColumn = columnIndexOf('level');
	const profilesColumn = columnIndexOf('profiles');

	for (const record of rawRecords) {
		if (record === headerRecord) {
			continue;
		}

		const email = (record[emailColumn] ?? '').trim();
		if (!email) {
			continue;
		}

		rows.push({
			email,
			accountLevel: mapInviteLevel(record[levelColumn]),
			profileNames: splitProfileNames(record[profilesColumn] ?? ''),
		});
	}

	return rows;
};

let rowKeyCounter = 0;

/** Fresh manual row with a unique key; the drawer appends these directly. */
export const makeManualRow = (email = ''): InviteRow => {
	rowKeyCounter += 1;

	return {
		key: `manual-${String(rowKeyCounter)}-${String(Date.now())}`,
		email,
		accountLevel: 'User',
		profileIds: [],
		profileNames: [],
		source: 'manual',
	};
};

/** Parsed rows → InviteRows carrying provenance; dedupes case-insensitively
 * within the batch and against every email already on the form. Invalid
 * emails are dropped silently (the submit gate re-checks validity). */
export const buildImportedInvites = ({
	parsedRows,
	existingEmails,
	source,
}: {
	parsedRows: ParsedInviteRow[];
	existingEmails: string[];
	source: 'file' | 'manual';
}): { rows: InviteRow[]; detectedCount: number; duplicateCount: number } => {
	const seen = new Set(
		existingEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
	);

	let duplicateCount = 0;
	const rows: InviteRow[] = [];

	for (const parsed of parsedRows) {
		const identity = parsed.email.toLowerCase();
		if (!identity || seen.has(identity)) {
			duplicateCount += 1;
			continue;
		}

		seen.add(identity);
		rowKeyCounter += 1;
		rows.push({
			key: `${source}-${String(rowKeyCounter)}-${String(Date.now())}`,
			email: parsed.email,
			accountLevel: parsed.accountLevel,
			profileIds: [],
			profileNames: parsed.profileNames,
			source,
		});
	}

	return { rows, detectedCount: parsedRows.length, duplicateCount };
};

/** Clear-file action: drops file-sourced rows only; manual rows survive. */
export const clearFileRows = (rows: InviteRow[]): InviteRow[] =>
	rows.filter((row) => row.source !== 'file');

export type ProfileResolutionOutcome = {
	rows: InviteRow[];
	unresolvedByRowKey: Record<string, Array<{ name: string; reason: string }>>;
	unresolvedCount: number;
};

/** Applies server resolutions to rows: matched names fill ids, unresolved
 * ones are flagged per row. Admin rows suppress profile flags entirely —
 * they get full access and need no profiles. */
export const applyProfileResolutions = (
	rows: InviteRow[],
	resolutions: ProfileNameResolution[],
): ProfileResolutionOutcome => {
	const resolutionByName = new Map(
		resolutions.map((resolution) => [
			resolution.name.toLowerCase(),
			resolution,
		]),
	);
	const unresolvedByRowKey: ProfileResolutionOutcome['unresolvedByRowKey'] = {};
	let unresolvedCount = 0;

	const nextRows = rows.map((row) => {
		if (row.profileNames.length === 0) {
			return row;
		}

		const profileIds: string[] = [];
		const unresolved: Array<{ name: string; reason: string }> = [];
		for (const name of row.profileNames) {
			const resolution = resolutionByName.get(name.toLowerCase());
			if (resolution?.profileId) {
				profileIds.push(resolution.profileId);
			} else if (row.accountLevel !== 'Admin') {
				unresolved.push({
					name,
					reason: resolution?.reason ?? 'not-found',
				});
			}
		}

		if (unresolved.length > 0) {
			unresolvedByRowKey[row.key] = unresolved;
			unresolvedCount += unresolved.length;
		}

		return { ...row, profileIds };
	});

	return { rows: nextRows, unresolvedByRowKey, unresolvedCount };
};

/** The Send gate: non-empty batch, no in-flight resolution, zero unresolved
 * profile flags, and every row carrying a syntactically valid email. */
export const canSendInvitations = ({
	rows,
	isResolvingProfiles,
	unresolvedCount,
}: {
	rows: InviteRow[];
	isResolvingProfiles: boolean;
	unresolvedCount: number;
}): boolean => {
	if (rows.length === 0 || isResolvingProfiles || unresolvedCount > 0) {
		return false;
	}

	return rows.every((row) => EMAIL_REGEX.test(row.email));
};

/** Submit payload: bookkeeping dropped; admins always send empty profiles
 * (full access); user-profile ids deduped defensively. */
export const buildSubmitInvitations = (
	rows: InviteRow[],
): Array<{
	email: string;
	accountLevel: 'Admin' | 'User';
	profileIds: string[];
}> =>
	rows.map((row) => ({
		email: row.email,
		accountLevel: row.accountLevel,
		profileIds:
			row.accountLevel === 'Admin' ? [] : [...new Set(row.profileIds)],
	}));

/** Downloadable template — matches the parser's documented columns. */
export const buildInviteTemplateCsv = (): string =>
	'email,level,profiles\nuser@example.com,user,Alpha; Beta\nadmin@example.com,admin,\n';
