import {
	accessSync,
	constants,
	readdirSync,
	readFileSync,
	statSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_DIST = resolve(process.cwd(), 'dist');
const DEFAULT_LOCALES_DIR = resolve(process.cwd(), 'src/i18n/locales');
const DEFAULT_FONTS_DIR = 'client/fonts/geist';

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

const violations = [];

const isAccessible = (path) => {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
};

const parseLocaleCodepoints = () => {
	const walk = (dir, out) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path, out);
				continue;
			}
			if (!entry.name.endsWith('.json')) {
				continue;
			}
			const value = JSON.parse(readFileSync(path, 'utf8'));
			collectFromValue(value, out);
		}
	};

	const collectFromValue = (value, out) => {
		if (typeof value === 'string') {
			for (const rune of value) {
				const cp = rune.codePointAt(0);
				if (cp !== undefined && cp > 0xff) {
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

	const locales = new Set();
	walk(localesDir, locales);
	return [...locales].sort((a, b) => a - b);
};

const parseUnicodeRanges = (value) => {
	const ranges = [];
	for (const token of value.split(',').map((entry) => entry.trim())) {
		const match = /^U\+([0-9A-F]{2,6})(?:-([0-9A-F]{2,6}))?$/i.exec(token);
		if (!match) continue;
		const start = Number.parseInt(match[1], 16);
		const end = match[2] ? Number.parseInt(match[2], 16) : start;
		ranges.push([start, end]);
	}
	return ranges;
};

const formatUnicode = (cp) =>
	`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

const includesCodePoint = (ranges, cp) =>
	ranges.some(([start, end]) => cp >= start && cp <= end);

const parseFontFaceDeclarations = (cssFile) => {
	const declarations = [];
	const cssText = readFileSync(cssFile, 'utf8');
	const faceRegex = /@font-face\s*{([^}]*)}/gs;
	let match;
	while ((match = faceRegex.exec(cssText)) !== null) {
		const block = match[1];
		const urlMatch = /url\((?:'|")?(\/[^'"\)]+\.woff2)(?:'|")?\)/i.exec(block);
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

const gatherCssFiles = () => {
	const files = [];
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

const localeCodepoints = parseLocaleCodepoints();
const localeSet = new Set(localeCodepoints);

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

for (const declaration of declarations) {
	const missing = [];
	for (const cp of localeCodepoints) {
		if (!includesCodePoint(declaration.ranges, cp)) {
			missing.push(formatUnicode(cp));
		}
	}
	if (missing.length > 0) {
		violations.push(
			`Font ${declaration.file} does not cover locale-required codepoints: ${missing.join(', ')}.`,
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
