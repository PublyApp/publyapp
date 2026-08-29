import {
	accessSync,
	constants,
	readdirSync,
	readFileSync,
	statSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { brotliDecompressSync } from 'node:zlib';

const DEFAULT_DIST = resolve(process.cwd(), 'dist');
const DEFAULT_LOCALES_DIR = resolve(process.cwd(), 'src/i18n/locales');
const DEFAULT_FONTS_DIR = 'client/fonts/geist';
const WOFF2_SIGNATURE = 0x774f4632;

// Codepoints above 0xFF that carry no ink: a font that omits them renders advance
// width or nothing at all, never a .notdef box, so requiring a glyph for them says
// nothing about whether the text is legible. French copy legitimately uses U+202F
// (narrow no-break space) before high punctuation — ? ! ; : » — and that must not
// force the subset to grow.
//
// This list is deliberately explicit and closed. Do NOT relax it into a general
// "skip anything that looks like a space" test: U+1680 OGHAM SPACE MARK is a
// whitespace character that DOES draw a visible line, and a category-based rule
// would silently stop requiring it. Any codepoint not named here still needs a
// glyph.
const INKLESS_CODEPOINTS = new Set([
	0x2000,
	0x2001,
	0x2002,
	0x2003,
	0x2004,
	0x2005,
	0x2006,
	0x2007,
	0x2008,
	0x2009,
	0x200a, // EN QUAD .. HAIR SPACE
	0x200b, // ZERO WIDTH SPACE
	0x200c, // ZERO WIDTH NON-JOINER
	0x200d, // ZERO WIDTH JOINER
	0x2028, // LINE SEPARATOR
	0x2029, // PARAGRAPH SEPARATOR
	0x202f, // NARROW NO-BREAK SPACE
	0x205f, // MEDIUM MATHEMATICAL SPACE
	0x2060, // WORD JOINER
	0x3000, // IDEOGRAPHIC SPACE
	0xfeff, // ZERO WIDTH NO-BREAK SPACE (BOM)
]);

/** Known sfnt table tags indexed by table-version index (0..62); unknown
 * indexes fall back to `tag-${index}` at the read site. */
const KNOWN_TABLE_TAGS = [
	'cmap',
	'head',
	'hhea',
	'hmtx',
	'maxp',
	'name',
	'OS/2',
	'post',
	'cvt ',
	'fpgm',
	'glyf',
	'loca',
	'prep',
	'CFF ',
	'VORG',
	'EBDT',
	'EBLC',
	'gasp',
	'hdmx',
	'kern',
	'LTSH',
	'PCLT',
	'VDMX',
	'vhea',
	'vmtx',
	'BASE',
	'GDEF',
	'GPOS',
	'GSUB',
	'EBSC',
	'JSTF',
	'MATH',
	'CBDT',
	'CBDC',
	'COLR',
	'CPAL',
	'SVG',
	'sbix',
	'acnt',
	'avar',
	'bdat',
	'bloc',
	'bsln',
	'cvar',
	'fdsc',
	'feat',
	'fmtx',
	'fvar',
	'gvar',
	'hsty',
	'just',
	'lcar',
	'mort',
	'morx',
	'opbd',
	'prop',
	'trak',
	'Zapf',
	'Silf',
	'Glat',
	'Gloc',
	'Feat',
	'Sill',
];

const args = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
	const arg = argv[i];
	if (!arg.startsWith('--')) {
		continue;
	}
	if (arg.includes('=')) {
		const [key, value] = arg.split('=', 2);
		args.set(key, value);
		continue;
	}
	const next = argv[i + 1];
	if (next && !next.startsWith('--')) {
		args.set(arg, next);
		i += 1;
		continue;
	}
	args.set(arg, 'true');
}

const distDir = args.get('--dist')
	? resolve(process.cwd(), args.get('--dist'))
	: DEFAULT_DIST;
const localesDir = args.get('--locales-dir')
	? resolve(process.cwd(), args.get('--locales-dir'))
	: DEFAULT_LOCALES_DIR;
const fontOutDir = resolve(
	distDir,
	args.get('--fonts-dir') ?? DEFAULT_FONTS_DIR,
);

const assetDirs = [
	resolve(distDir, 'client/assets'),
	resolve(distDir, 'server/assets'),
];

const violations: string[] = [];

const isAccessible = (path: string): boolean => {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
};

/** Any value JSON text can produce; locale catalogs are plain data. */
type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const parseLocaleJson = (filePath: string): JsonValue => {
	const content = readFileSync(filePath, 'utf8');
	try {
		return JSON.parse(content) as JsonValue;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Locale file ${filePath} is not valid JSON: ${message}.`);
	}
};

const parseLocaleCodepoints = () => {
	const walk = (dir: string, out: Set<number>): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path, out);
				continue;
			}
			if (!entry.name.endsWith('.json')) {
				continue;
			}
			const value = parseLocaleJson(path);
			collectFromValue(value, out);
		}
	};

	const collectFromValue = (value: unknown, out: Set<number>): void => {
		if (typeof value === 'string') {
			for (const rune of value) {
				const cp = rune.codePointAt(0);
				if (cp !== undefined && cp > 0xff && !INKLESS_CODEPOINTS.has(cp)) {
					out.add(cp);
				}
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				collectFromValue(item, out);
			}
			return;
		}
		if (typeof value === 'object' && value !== null) {
			for (const nested of Object.values(value)) {
				collectFromValue(nested, out);
			}
		}
	};

	const locales = new Set<number>();
	walk(localesDir, locales);
	return [...locales].sort((a: number, b: number): number => a - b);
};

interface UnicodeRange {
	start: number;
	end: number;
}

const parseUnicodeRanges = (value: string): UnicodeRange[] => {
	const ranges: UnicodeRange[] = [];
	for (const token of value.split(',').map((entry) => entry.trim())) {
		const match = /^U\+([0-9A-F]{2,6})(?:-([0-9A-F]{2,6}))?$/i.exec(token);
		if (!match) {
			continue;
		}
		const start = Number.parseInt(match[1], 16);
		const end = match[2] ? Number.parseInt(match[2], 16) : start;
		ranges.push({ start, end });
	}
	return ranges;
};

const formatUnicode = (cp: number): string =>
	`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

const addRangeCodepoints = (
	start: number,
	end: number,
	callback: (cp: number) => void,
): void => {
	for (let cp = start; cp <= end; cp += 1) {
		callback(cp);
	}
};

const readUIntBase128 = (
	buffer: Buffer,
	state: { offset: number },
	file: string,
): number => {
	let value = 0;
	for (let i = 0; i < 5; i += 1) {
		if (state.offset >= buffer.length) {
			throw new Error(
				`Font file ${file} WOFF2 table directory truncated while reading base-128 length.`,
			);
		}
		const byte = buffer[state.offset];
		state.offset += 1;
		if (i === 0 && byte === 0x80) {
			throw new Error(
				`Font file ${file} WOFF2 base-128 length has invalid leading zero.`,
			);
		}
		value = value * 128 + (byte & 0x7f);
		if ((byte & 0x80) === 0) {
			return value;
		}
	}
	throw new Error(`Font file ${file} WOFF2 base-128 length is too long.`);
};

const parseCmapSubtable = (subtable: Buffer): Set<number> => {
	const codepoints = new Set<number>();
	if (subtable.length < 6) {
		return codepoints;
	}
	const format = subtable.readUInt16BE(0);
	const length = subtable.readUInt16BE(2);
	if (length < 6 || length > subtable.length) {
		return codepoints;
	}

	if (format === 0) {
		if (subtable.length < 262) {
			return codepoints;
		}
		for (let i = 0; i < 256; i += 1) {
			if (subtable.readUInt8(6 + i) !== 0) {
				codepoints.add(i);
			}
		}
		return codepoints;
	}

	if (format === 4) {
		if (subtable.length < 16) {
			return codepoints;
		}
		const segCount = subtable.readUInt16BE(6) / 2;
		const endCodesOffset = 14;
		const startCodesOffset = endCodesOffset + segCount * 2 + 2;
		const idDeltaOffset = startCodesOffset + segCount * 2;
		const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
		const glyphIndexBase = idRangeOffsetOffset + segCount * 2;
		const glyphIndexLimit = subtable.length - 2;

		for (let i = 0; i < segCount; i += 1) {
			const end = subtable.readUInt16BE(endCodesOffset + i * 2);
			const start = subtable.readUInt16BE(startCodesOffset + i * 2);
			const idDelta = subtable.readInt16BE(idDeltaOffset + i * 2);
			const idRangeOffset = subtable.readUInt16BE(idRangeOffsetOffset + i * 2);
			if (start > end) {
				continue;
			}
			for (let cp = start; cp <= end; cp += 1) {
				if (cp === 0xffff && start === 0xffff && end === 0xffff) {
					continue;
				}
				let glyphId = 0;
				if (idRangeOffset === 0) {
					glyphId = (cp + idDelta) & 0xffff;
				} else {
					const glyphOffset =
						idRangeOffsetOffset + i * 2 + idRangeOffset + (cp - start) * 2;
					if (
						glyphOffset + 1 >= glyphIndexLimit ||
						glyphOffset < glyphIndexBase
					) {
						continue;
					}
					glyphId = subtable.readUInt16BE(glyphOffset);
					if (glyphId !== 0) {
						glyphId = (glyphId + idDelta) & 0xffff;
					}
				}
				if (glyphId !== 0) {
					codepoints.add(cp);
				}
			}
		}
		return codepoints;
	}

	if (format === 6) {
		if (subtable.length < 10) {
			return codepoints;
		}
		const firstCode = subtable.readUInt16BE(6);
		const entryCount = subtable.readUInt16BE(8);
		for (let i = 0; i < entryCount; i += 1) {
			const glyphIndex = subtable.readUInt16BE(10 + i * 2);
			if (glyphIndex !== 0) {
				codepoints.add(firstCode + i);
			}
		}
		return codepoints;
	}

	if (format === 12 || format === 13) {
		if (subtable.length < 16) {
			return codepoints;
		}
		const groupCount = subtable.readUInt32BE(12);
		let groupOffset = 16;
		for (let i = 0; i < groupCount; i += 1) {
			if (groupOffset + 12 > subtable.length) {
				break;
			}
			const start = subtable.readUInt32BE(groupOffset);
			const end = subtable.readUInt32BE(groupOffset + 4);
			const glyphId = subtable.readUInt32BE(groupOffset + 8);
			groupOffset += 12;
			if (glyphId === 0) {
				continue;
			}
			addRangeCodepoints(start, end, (cp) => {
				codepoints.add(cp);
			});
		}
		return codepoints;
	}

	return codepoints;
};

const parseCmapTable = (tableData: Buffer): Set<number> => {
	const codepoints = new Set<number>();
	if (tableData.length < 4) {
		return codepoints;
	}
	if (tableData.readUInt16BE(0) > 1) {
		return codepoints;
	}
	const count = tableData.readUInt16BE(2);
	let recordsOffset = 4;
	const records = [];
	for (let i = 0; i < count; i += 1) {
		if (recordsOffset + 8 > tableData.length) {
			return codepoints;
		}
		const offset = tableData.readUInt32BE(recordsOffset + 4);
		records.push(offset);
		recordsOffset += 8;
	}
	for (const offset of records) {
		if (offset >= tableData.length) {
			continue;
		}
		const subtable = tableData.subarray(offset);
		for (const cp of parseCmapSubtable(subtable)) {
			codepoints.add(cp);
		}
	}
	return codepoints;
};

interface Woff2TableEntry {
	tag: string;
	transform: number;
	tagNeedsTransformLength: boolean;
	origLength: number;
	transformLength?: number;
}

const parseWoff2CmapCodepoints = (file: string): Set<number> => {
	const buffer = readFileSync(file);
	if (buffer.length < 48) {
		throw new Error(`Font file ${file} is too small to be valid WOFF2.`);
	}
	if (buffer.readUInt32BE(0) !== WOFF2_SIGNATURE) {
		throw new Error(`Font file ${file} is not WOFF2.`);
	}
	const flavor = buffer.readUInt32BE(4);
	if (flavor === 0x74746366) {
		throw new Error(
			`Font file ${file} is a font collection, which this guard does not support.`,
		);
	}
	const totalLength = buffer.readUInt32BE(8);
	const totalCompressedSize = buffer.readUInt32BE(20);
	if (totalLength > buffer.length) {
		throw new Error(`Font file ${file} truncates WOFF2 payload.`);
	}
	const numTables = buffer.readUInt16BE(12);
	const reserved = buffer.readUInt16BE(14);
	if (reserved !== 0) {
		violations.push(`WOFF2 reserved header field is not zero for ${file}.`);
	}
	let cursor = 48;
	const entries: Woff2TableEntry[] = [];
	for (let i = 0; i < numTables; i += 1) {
		const flags = buffer[cursor];
		cursor += 1;
		const tagIndex = flags & 0x3f;
		const transform = (flags & 0xc0) >>> 6;
		let tag;
		if (tagIndex === 63) {
			if (cursor + 4 > buffer.length) {
				throw new Error(`Font file ${file} has malformed table tag.`);
			}
			tag = buffer.subarray(cursor, cursor + 4).toString('ascii');
			cursor += 4;
		} else {
			tag = KNOWN_TABLE_TAGS[tagIndex] ?? `tag-${String(tagIndex)}`;
		}

		const lengthState = { offset: cursor };
		const origLength = readUIntBase128(buffer, lengthState, file);
		cursor = lengthState.offset;

		const tagNeedsTransformLength =
			transform !== 0 ||
			(transform === 0 && (tag === 'glyf' || tag === 'loca'));
		let transformLength: number | undefined;
		if (tagNeedsTransformLength) {
			const transformState = { offset: cursor };
			transformLength = readUIntBase128(buffer, transformState, file);
			cursor = transformState.offset;
		}

		entries.push({
			tag,
			transform,
			tagNeedsTransformLength,
			origLength,
			transformLength,
		});
	}

	const compressedEnd = cursor + totalCompressedSize;
	if (compressedEnd < cursor) {
		throw new Error(`Font file ${file} has invalid compressed data offsets.`);
	}
	if (compressedEnd > totalLength) {
		throw new Error(
			`Font file ${file} declares compressed data longer than file length.`,
		);
	}
	const compressedData = buffer.subarray(cursor, compressedEnd);
	const decompressed = brotliDecompressSync(compressedData);
	let expectedLength = 0;
	for (const entry of entries) {
		if (entry.tagNeedsTransformLength) {
			if (entry.transformLength === undefined) {
				throw new Error(
					`Font file ${file} table ${entry.tag} declares a transformed layout but carries no transformLength.`,
				);
			}
			expectedLength += entry.transformLength;
		} else {
			expectedLength += entry.origLength;
		}
	}
	if (decompressed.length !== expectedLength) {
		throw new Error(
			`Font file ${file} compressed payload length does not match table directory.`,
		);
	}

	let tableCursor = 0;
	for (const entry of entries) {
		const segmentLength: number = entry.tagNeedsTransformLength
			? (entry.transformLength as number)
			: entry.origLength;
		if (tableCursor + segmentLength > decompressed.length) {
			throw new Error(`Font file ${file} truncates WOFF2 table payload.`);
		}
		const tableData = decompressed.subarray(
			tableCursor,
			tableCursor + segmentLength,
		);
		tableCursor += segmentLength;

		if (entry.tag !== 'cmap') {
			continue;
		}
		if (entry.transform !== 0) {
			throw new Error(
				`Font file ${file} declares transformed cmap (version ${entry.transform}).`,
			);
		}
		return parseCmapTable(tableData);
	}

	return new Set();
};

interface FontFaceDeclaration {
	file: string;
	ranges: UnicodeRange[];
}

const parseFontFaceDeclarations = (
	cssFile: string,
): FontFaceDeclaration[] => {
	const declarations: FontFaceDeclaration[] = [];
	const cssText = readFileSync(cssFile, 'utf8');
	const faceRegex = /@font-face\s*{([^}]*)}/gs;
	let match;
	while ((match = faceRegex.exec(cssText)) !== null) {
		const block = match[1];
		const urlMatch = /url\((?:'|")?(\/[^'")]+\.woff2)(?:'|")?\)/i.exec(block);
		if (!urlMatch) {
			continue;
		}
		const unicodeMatch = /unicode-range:\s*([^;}]*)/i.exec(block);
		if (!unicodeMatch) {
			continue;
		}
		declarations.push({
			file: basename(urlMatch[1]),
			ranges: parseUnicodeRanges(unicodeMatch[1]),
		});
	}
	return declarations;
};

const gatherCssFiles = (): string[] => {
	const files: string[] = [];
	for (const dir of assetDirs) {
		if (!isAccessible(dir)) {
			continue;
		}
		for (const entry of readdirSync(dir)) {
			if (!entry.endsWith('.css')) {
				continue;
			}
			files.push(resolve(dir, entry));
		}
	}
	return files.sort();
};

const localeCodepoints: number[] = parseLocaleCodepoints();

if (!isAccessible(fontOutDir)) {
	violations.push(`No built font directory found at ${fontOutDir}.`);
} else if (!statSync(fontOutDir).isDirectory()) {
	violations.push(`Built font path is not a directory: ${fontOutDir}.`);
}

const cssFiles = gatherCssFiles();
if (cssFiles.length === 0) {
	violations.push(
		`No built CSS files found in ${assetDirs.join(', ')} (pass --dist if build output is elsewhere).`,
	);
}

const declarations = cssFiles.flatMap(parseFontFaceDeclarations);
const declaredFiles = new Set(declarations.map((entry) => entry.file));

if (cssFiles.length > 0 && declarations.length === 0) {
	violations.push(
		`No @font-face declarations with woff2 sources found in built CSS files.`,
	);
}

if (isAccessible(fontOutDir) && statSync(fontOutDir).isDirectory()) {
	const builtFiles = readdirSync(fontOutDir)
		.filter((name) => name.endsWith('.woff2'))
		.map((name) => basename(name));

	for (const file of builtFiles) {
		if (!declaredFiles.has(file)) {
			violations.push(`Built CSS does not reference ${file}.`);
		}
	}

	for (const declaration of declarations) {
		if (!builtFiles.includes(declaration.file)) {
			violations.push(
				`Built font is missing required file: ${declaration.file}.`,
			);
		}
	}
}

const declarationsByFile = new Map<
	string,
	{ file: string; ranges: UnicodeRange[] }
>();
for (const declaration of declarations) {
	const existing = declarationsByFile.get(declaration.file);
	if (!existing) {
		declarationsByFile.set(declaration.file, {
			file: declaration.file,
			ranges: [...declaration.ranges],
		});
		continue;
	}
	existing.ranges.push(...declaration.ranges);
}

const fontCodepointsByFile = new Map<string, Set<number>>();
for (const declaration of declarationsByFile.values()) {
	const filePath = resolve(fontOutDir, declaration.file);
	if (!isAccessible(filePath)) {
		continue;
	}
	try {
		fontCodepointsByFile.set(
			declaration.file,
			parseWoff2CmapCodepoints(filePath),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		violations.push(message);
	}
}

for (const declaration of declarationsByFile.values()) {
	const coverage = fontCodepointsByFile.get(declaration.file);
	if (!coverage) {
		continue;
	}
	const localeMissing: string[] = [];
	for (const cp of localeCodepoints) {
		if (!coverage.has(cp)) {
			localeMissing.push(formatUnicode(cp));
		}
	}
	if (localeMissing.length > 0) {
		violations.push(
			`Font ${declaration.file} does not contain all locale-required codepoints: ${localeMissing.join(', ')}.`,
		);
	}

	const declaredMissing: string[] = [];
	for (const range of declaration.ranges) {
		addRangeCodepoints(range.start, range.end, (cp) => {
			if (!coverage.has(cp)) {
				declaredMissing.push(formatUnicode(cp));
			}
		});
	}
	if (declaredMissing.length > 0) {
		violations.push(
			`Font ${declaration.file} declares unicode-range values not present in the file: ${declaredMissing.join(', ')}.`,
		);
	}
}

if (violations.length > 0) {
	console.error('front font bundle guard failed:');
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exit(1);
}

console.log('front font bundle guard passed.');
