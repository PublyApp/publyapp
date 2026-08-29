import { strFromU8, unzipSync } from 'fflate';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';

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
	/** Non-null when the file carried a level that is neither admin/owner nor
	 * blank: the row is in error and blocks Send until the value is fixed.
	 * Carries the exact raw value so the user sees which line/value is wrong. */
	invalidLevel: string | null;
	/** Non-null when the email on the row does not match the email format.
	 * Carries the raw email value so the drawer can surface a per-row error
	 * naming the offending address instead of a silent disabled button. */
	invalidEmail: string | null;
	/** Non-null when a cell in the row is a boolean (t="b") or formula error
	 * (t="e"): not user-entered data, so the cell is rejected, not imported.
	 * Carries the cell reference, raw value, and kind so the drawer can name
	 * the offending cell and value in plain words. */
	invalidCell: InvalidCell | null;
};

/** A non-text cell (boolean or formula error) that was rejected.
 * The drawer renders this into a human-readable message naming the cell
 * and value so the importer knows what to fix in their file. */
export type InvalidCell = {
	/** Cell reference, e.g. "B2". Empty for CSV cells without a reference. */
	cell?: string;
	/** Raw cell value, e.g. "1" or a formula error code. */
	value: string;
	/** What kind of non-text cell was found. */
	kind: 'boolean' | 'formula-error';
};

export type ProfileNameResolution = {
	name: string;
	profileId: string | null;
	reason: 'not-found' | 'ambiguous' | null;
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `;` or `|` between profile names — documented in the downloadable template. */
export const splitProfileNames = (raw: string): string[] =>
	raw
		.split(/[;|]/)
		.map((piece) => piece.trim())
		.filter(Boolean);

/** Maps a raw `level` cell to a recognised account level.
 *
 * - `admin` / `owner` (case-insensitive) → `Admin`
 * - `user` / blank / missing → `User` (the safe default)
 * - anything else → `Invalid`: the row is a row-level error, not a silent
 *   downgrade to `User`. The caller surfaces the raw value and blocks Send. */
export type InviteLevel = 'Admin' | 'User' | 'Invalid';

export const mapInviteLevel = (
	rawLevel: string | undefined | null,
): InviteLevel => {
	const normalized = (rawLevel ?? '').trim().toLowerCase();
	if (normalized === 'admin' || normalized === 'owner') {
		return 'Admin';
	}

	if (normalized === 'user' || normalized.length === 0) {
		return 'User';
	}

	return 'Invalid';
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
	/** Set when the file's `level` value was not admin/owner and not blank.
	 * The row is in error; the drawer blocks Send and shows the raw value. */
	invalidLevel: string | null;
	/** Set when the email on the row does not match the email format.
	 * The row is in error; the drawer blocks Send and shows the raw value. */
	invalidEmail: string | null;
	/** Set when a cell in the row is a boolean (t="b") or formula error (t="e").
	 * Carries the cell reference, raw value, and kind so the drawer can name
	 * the offending cell and value in plain words. */
	invalidCell: InvalidCell | null;
};

/** Why a file parse produced no usable rows. Each cause has its own i18n key
 * so the drawer can name the problem in plain words instead of a generic
 * "could not read file" message. */
type ParseInviteFailureKind =
	| 'empty'
	| 'no-email-column'
	| 'unreadable-excel'
	| 'no-sheet';

type ParseInviteSuccess = {
	outcome: 'parsed';
	rows: ParsedInviteRow[];
};

type ParseInviteFailure = {
	outcome: 'error';
	kind: ParseInviteFailureKind;
};

export type ParseInviteResult = ParseInviteSuccess | ParseInviteFailure;

/** A raw cell extracted from the workbook: its text value, XLSX type, and
 * reference. The type drives how the cell is interpreted — `t="b"` (boolean)
 * and `t="e"` (formula error) are rejected as non-text; `t="str"` (formula
 * text result) is accepted as legitimate text. */
export type RawCell = {
	value: string;
	type?: 'str' | 'b' | 'e' | 's' | 'inlineStr';
	ref?: string;
};

/** Parsed-row level fields: a recognised level, or the raw invalid value. */
type RowLevelFields = {
	accountLevel: 'Admin' | 'User';
	invalidLevel: string | null;
	invalidCell: InvalidCell | null;
};

/** Maps a raw `level` cell (already extracted) to its parsed row fields.
 * Boolean (t="b") and formula error (t="e") cells are rejected with a
 * structured error naming the cell and value; other invalid values are
 * flagged as before. */
const mapLevelToRowFields = (rawCell: RawCell | undefined) => {
	if (rawCell?.type === 'b' || rawCell?.type === 'e') {
		return {
			accountLevel: 'User',
			invalidLevel: rawCell.value,
			invalidCell: {
				cell: rawCell.ref,
				value: rawCell.value,
				kind: rawCell.type === 'b' ? 'boolean' : 'formula-error',
			},
		} satisfies RowLevelFields;
	}

	const level = mapInviteLevel(rawCell?.value);
	if (level === 'Invalid') {
		return {
			accountLevel: 'User',
			invalidLevel: (rawCell?.value ?? '').trim(),
			invalidCell: null,
		} satisfies RowLevelFields;
	}

	return {
		accountLevel: level,
		invalidLevel: null,
		invalidCell: null,
	} satisfies RowLevelFields;
};

type EmailRowField = {
	email: string;
	invalidEmail: string | null;
	invalidCell: InvalidCell | null;
};

/** Maps a raw email cell to its parsed row field: the trimmed email if valid,
 * or the raw trimmed value flagged as invalid. Boolean/error cells are
 * rejected with a structured error naming the cell. */
const mapEmailToRowField = (rawCell: RawCell | undefined): EmailRowField => {
	if (rawCell?.type === 'b' || rawCell?.type === 'e') {
		return {
			email: rawCell.value,
			invalidEmail: null,
			invalidCell: {
				cell: rawCell.ref,
				value: rawCell.value,
				kind: rawCell.type === 'b' ? 'boolean' : 'formula-error',
			},
		};
	}

	const email = (rawCell?.value ?? '').trim();
	if (email === '' || EMAIL_REGEX.test(email)) {
		return { email, invalidEmail: null, invalidCell: null };
	}

	return { email, invalidEmail: email, invalidCell: null };
};

/** CSV → invite rows via the documented header: `email, level, profiles`. */
export const parseInviteCsv = (text: string): ParseInviteResult => {
	const rawRows = parseCsvRows(text);
	if (rawRows.length === 0) {
		return { outcome: 'error', kind: 'empty' };
	}

	const [headerRow, ...dataRows] = rawRows;
	const headers = headerRow!.map((header) => header.trim().toLowerCase());
	const indexOfEmail = headers.indexOf('email');
	const indexOfLevel = headers.indexOf('level');
	const indexOfProfiles = headers.indexOf('profiles');

	if (indexOfEmail === -1) {
		return { outcome: 'error', kind: 'no-email-column' };
	}

	const parsed: ParsedInviteRow[] = [];
	for (const row of dataRows) {
		const hasContent = row.some((cell) => cell.trim().length > 0);
		if (!hasContent) {
			continue;
		}

		const levelFields = mapLevelToRowFields({
			value: row[indexOfLevel] ?? '',
		});
		const emailFields = mapEmailToRowField({
			value: row[indexOfEmail] ?? '',
		});
		parsed.push({
			...emailFields,
			...levelFields,
			profileNames: splitProfileNames(row[indexOfProfiles] ?? ''),
		});
	}

	return { outcome: 'parsed', rows: parsed };
};

/** Column letter(s) (`A`, `B`, … `AA`) → zero-based index. */
const columnIndexFromRef = (letters: string): number => {
	let index = 0;
	for (let i = 0; i < letters.length; i += 1) {
		index = index * 26 + (letters.charCodeAt(i) - 64);
	}

	return index - 1;
};

const XML_ENTITY_MAP = {
	'&lt;': '<',
	'&gt;': '>',
	'&amp;': '&',
} as const;

const decodeXmlEntities = (value: string): string =>
	value.replace(/&(?:lt|gt|amp);/g, (entity) => {
		// The regex above only yields keys of XML_ENTITY_MAP.
		const decoded = XML_ENTITY_MAP[entity as keyof typeof XML_ENTITY_MAP];
		return decoded ?? entity;
	});

/** Extract text contents of `<tag>` elements, excluding any `<t>` elements that
 * are nested inside `<rPh>` (phonetic rubi/furigana) elements. The `<rPh>` block
 * carries a phonetic reading of the preceding `<t>` run and must not be merged
 * into the cell value — Excel writes it for any CJK input, so this is plain XLSX
 * rather than exotic XML. */
const textContents = (xml: string, tag: string): string[] => {
	const results: string[] = [];
	let source = xml;

	if (tag === 't') {
		// Strip `<rPh>...</rPh>` blocks (and their `<t>` children) before scanning
		// for `<t>`, so phonetic readings never pollute the real cell text.
		source = source.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, '');
	}

	const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
	let match = pattern.exec(source);
	while (match) {
		results.push(match[1] ?? '');
		match = pattern.exec(source);
	}

	return results;
};

/** Minimal xlsx reader over fflate: shared strings + first worksheet only.
 * SheetJS was dropped repo-wide for unfixed CVEs (round-1 review shell-F1);
 * this covers exactly what an invite sheet needs: shared-string cells read
 * positionally by their `r` reference so sparse gaps stay aligned. */
export const parseInviteWorkbook = (bytes: Uint8Array): ParseInviteResult => {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes);
	} catch {
		return { outcome: 'error', kind: 'unreadable-excel' };
	}

	const sheetXmlBytes = files['xl/worksheets/sheet1.xml'];
	if (!sheetXmlBytes) {
		return { outcome: 'error', kind: 'no-sheet' };
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
	const rawRecords: Array<Record<number, RawCell>> = [];
	for (const rowXml of textContents(sheetXml, 'row')) {
		const cells: Record<number, RawCell> = {};
		const cellPattern = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
		let cellMatch = cellPattern.exec(rowXml);
		while (cellMatch) {
			const attrs = cellMatch[1] ?? '';
			const body = cellMatch[2] ?? '';
			const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs);
			const cellRef = refMatch?.[1] ?? '';
			const letters = cellRef.replace(/\d+$/, '');
			const refIndex = letters ? columnIndexFromRef(letters) : -1;

			let value = '';
			let cellType: RawCell['type'] | undefined;
			if (/t="s"/.test(attrs)) {
				cellType = 's';
				const sharedIndex = Number.parseInt(
					textContents(body, 'v')[0] ?? '',
					10,
				);
				value = Number.isInteger(sharedIndex)
					? (sharedStrings[sharedIndex] ?? '')
					: '';
			} else if (/t="inlineStr"/.test(attrs)) {
				cellType = 'inlineStr';
				// Inline strings store text in <is><t> (one or more <t> runs for
				// rich-text fragments); concatenate them with the same XML-entity
				// decoding as shared strings and <v> cells.
				const tRuns = textContents(body, 't');
				value = decodeXmlEntities(tRuns.join(''));
			} else if (/t="str"/.test(attrs)) {
				// Formula text result: legitimate text, treat as such.
				cellType = 'str';
				value = decodeXmlEntities(textContents(body, 'v')[0] ?? '');
			} else if (/t="b"/.test(attrs)) {
				cellType = 'b';
				value = decodeXmlEntities(textContents(body, 'v')[0] ?? '');
			} else if (/t="e"/.test(attrs)) {
				cellType = 'e';
				value = decodeXmlEntities(textContents(body, 'v')[0] ?? '');
			} else {
				value = decodeXmlEntities(textContents(body, 'v')[0] ?? '');
			}

			if (refIndex >= 0) {
				cells[refIndex] = {
					value: value.trim(),
					...(cellType ? { type: cellType } : {}),
					ref: cellRef,
				};
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
			(cell) => cell.value.trim().toLowerCase() === 'email',
		),
	);
	if (!headerRecord) {
		return { outcome: 'error', kind: 'no-email-column' };
	}

	const columnIndexOf = (headerName: string): number => {
		for (const [key, cell] of Object.entries(headerRecord)) {
			if (cell.value.trim().toLowerCase() === headerName) {
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

		const emailFields = mapEmailToRowField(record[emailColumn]);
		if (!emailFields.email) {
			continue;
		}

		const levelFields = mapLevelToRowFields(record[levelColumn]);
		rows.push({
			...emailFields,
			...levelFields,
			invalidCell: emailFields.invalidCell ?? levelFields.invalidCell,
			profileNames: splitProfileNames(record[profilesColumn]?.value ?? ''),
		});
	}

	return { outcome: 'parsed', rows };
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
		invalidLevel: null,
		invalidEmail: null,
		invalidCell: null,
	};
};

/** Parsed rows → InviteRows carrying provenance; dedupes case-insensitively
 * within the batch and against every email already on the form. Rows whose
 * file carried an invalid `level` keep their `invalidLevel` flag so the drawer
 * can show the bad value and block Send. */
export const buildImportedInvites = (
	{
		parsedRows,
		existingEmails,
		source,
	}: {
		parsedRows: ParsedInviteRow[];
		existingEmails: string[];
		source: 'file' | 'manual';
	} /* return shape intentionally inferred (anti-slop no-known-value-widening) */,
) => {
	const seen = new Set<string>();
	for (const email of existingEmails) {
		const normalized = email.trim().toLowerCase();
		if (normalized !== '') {
			seen.add(normalized);
		}
	}

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
			invalidLevel: parsed.invalidLevel,
			invalidEmail: parsed.invalidEmail,
			invalidCell: parsed.invalidCell,
		});
	}

	return { rows, detectedCount: parsedRows.length, duplicateCount };
};

/** Clear-file action: drops file-sourced rows only; manual rows survive. */
export const clearFileRows = (rows: InviteRow[]): InviteRow[] =>
	rows.filter((row) => row.source !== 'file');

/** Re-derives `invalidEmail` for each row from its current email value.
 * Called on every row change so that manual edits (typing, paste) keep
 * the per-row error flag in sync with the field value. */
export const syncInvalidEmail = (rows: InviteRow[]): InviteRow[] =>
	rows.map((row) => ({
		...row,
		invalidEmail:
			row.email === '' || EMAIL_REGEX.test(row.email) ? null : row.email,
	}));

type ProfileResolutionOutcome = {
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
) => {
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

	return {
		rows: nextRows,
		unresolvedByRowKey,
		unresolvedCount,
	} satisfies ProfileResolutionOutcome;
};

/** The Send gate: non-empty batch, no in-flight resolution, zero unresolved
 * profile flags, no row carrying an invalid file `level`, no row carrying a
 * boolean/error cell, and every row carrying a syntactically valid email. */
export const canSendInvitations = ({
	rows,
	isResolvingProfiles,
	unresolvedCount,
	invalidLevelCount,
	invalidCellCount,
}: {
	rows: InviteRow[];
	isResolvingProfiles: boolean;
	unresolvedCount: number;
	invalidLevelCount: number;
	invalidCellCount: number;
}): boolean => {
	if (
		rows.length === 0 ||
		isResolvingProfiles ||
		unresolvedCount > 0 ||
		invalidLevelCount > 0 ||
		invalidCellCount > 0
	) {
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

/** Renders an `InvalidCell` into a human-readable message naming the cell and
 * value so the importer knows what to fix in their file. */
export const renderInvalidCellMessage = (
	invalidCell: InvalidCell,
	t: (key: string, options?: Record<string, unknown>) => string,
): string =>
	invalidCell.kind === 'boolean'
		? t('invite-invalid-cell-boolean', {
				cell: invalidCell.cell,
				value: invalidCell.value,
			})
		: t('invite-invalid-cell-error', {
				cell: invalidCell.cell,
				value: invalidCell.value,
			});

/** Shape of the invite drawer's react-hook-form state. Mouthful but it is the
 * one contract the drawer's form, the host navigation blocker, and the submit
 * handler all share. */
export type InviteFormValues = {
	pasteEmails: string;
	sharedAccountLevel: 'Admin' | 'User';
	sharedProfileIds: string[];
	rows: InviteRow[];
};

const DEFAULT_VALUES: InviteFormValues = {
	pasteEmails: '',
	sharedAccountLevel: 'User',
	sharedProfileIds: [],
	rows: [makeManualRow()],
};

/** Owns the invite form instance. Language-keyed resolver so validation
 * messages stay localized; the host calls this so it can read
 * `methods.formState.isDirty` for the unsaved-changes navigation blocker. */
export const useInviteForm = (): UseFormReturn<InviteFormValues> => {
	const resolver = useLanguageKeyedZodResolver<InviteFormValues>(() =>
		z.object({
			pasteEmails: z.string().optional(),
			sharedAccountLevel: z.enum(['Admin', 'User']),
			sharedProfileIds: z.array(z.string()),
			rows: z.array(
				z.object({
					email: z.string(),
					accountLevel: z.enum(['Admin', 'User']),
					profileIds: z.array(z.string()),
					profileNames: z.array(z.string()),
					source: z.enum(['file', 'manual']),
					key: z.string(),
				}),
			),
		}),
	);
	return useForm<InviteFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});
};
