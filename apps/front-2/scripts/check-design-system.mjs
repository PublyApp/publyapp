import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const srcDir = path.join(rootDir, 'src');

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const TOKEN_LAYER_FILES = new Set(['src/styles/app.css']);

const rules = [
	{
		id: 'no-heroui-import',
		message: 'Use local Gray UI primitives instead of HeroUI.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]@heroui\/react['"]/, /import ['"]@heroui\/styles['"]/],
	},
	{
		id: 'no-lucide-import',
		message: 'Use Tabler icons from the Gray UI stack instead of Lucide.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/from ['"]lucide-react['"]/, /import ['"]lucide-react['"]/],
	},
	{
		id: 'no-heroui-color-scale',
		message:
			'Use Gray UI semantic tokens instead of legacy HeroUI numbered color scales.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [
			/\b(?:bg|text|border|ring|from|to|via)-(?:danger|success|warning|foreground|default|primary|content\d?)-\d{2,3}\b/,
		],
	},
	{
		id: 'no-raw-visual-color',
		message:
			'Use front-2 semantic tokens instead of raw hex/rgb/slate/white-alpha styling.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/routes/authed/') ||
			relativePath.startsWith('src/styles/'),
		allow: (relativePath) => TOKEN_LAYER_FILES.has(relativePath),
		patterns: [
			/["'][#][0-9a-fA-F]{3,8}["']/,
			/\b(?:bg|text|border|ring|from|to|via)-\[#(?:[0-9a-fA-F]{3,8})\]/,
			/\b(?:color|background|background-color|border-color|outline-color)\s*:\s*#[0-9a-fA-F]{3,8}\b/,
			/\b(?:bg|text|border|ring|from|to|via)-slate-\d{2,3}\b/,
			/\b(?:bg|border|text|ring)-white\/\d+\b/,
			/\b(?:bg|border|text|ring)-black\/\d+\b/,
			/['"`]\s*rgba?\(/,
			/\b(?:bg|text|border|ring|from|to|via)-\[(?:rgba?\([^\]]+\))\]/,
			/\b(?:color|background|background-color|border-color|outline-color|box-shadow)\s*:\s*rgba?\(/,
		],
	},
	{
		id: 'no-native-product-select',
		message:
			'Prefer local Select primitives on product surfaces during migration.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/table/') ||
			relativePath.startsWith('src/routes/authed/'),
		patterns: [/<select\b/],
	},
	{
		id: 'no-prototype-icons',
		message:
			'Use Tabler icon components, not emoji/punctuation/numeric icon strings.',
		appliesTo: (relativePath) => relativePath.startsWith('src/'),
		patterns: [/icon=["'](?:!|\?|401|⛔|🔎)["']/],
	},
	{
		id: 'no-native-confirm',
		message: 'Use local confirm dialog in product surfaces.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/authed/'),
		patterns: [/globalThis\.confirm\b/],
	},
	{
		id: 'no-important-foundation',
		message: 'Fix cascade through tokens/theme/wrappers, not !important.',
		appliesTo: (relativePath) =>
			relativePath.startsWith('src/components/app-shell/') ||
			relativePath.startsWith('src/components/table/'),
		patterns: [/!important/, /![a-z0-9]+-[a-z0-9][a-z0-9-]*/],
	},
	{
		id: 'no-raw-internal-anchor',
		mode: 'source',
		message: 'Use TanStack Link for internal route navigation.',
		appliesTo: (relativePath) => relativePath.startsWith('src/routes/authed/'),
		patterns: [
			/<a\b(?:(?!<a\b)[\s\S])*?href=["']\/(staff|tenant)\b(?:(?!<a\b)[\s\S])*?>/g,
		],
	},
];

const collectFiles = async (dir) => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

export const scanFront2DesignSystem = async ({
	baseDir = rootDir,
	sourceDir = srcDir,
} = {}) => {
	const files = await collectFiles(sourceDir);
	const violations = [];

	for (const absolutePath of files) {
		const relativePath = path
			.relative(baseDir, absolutePath)
			.split(path.sep)
			.join('/');
		const source = await readFile(absolutePath, 'utf8');

		for (const rule of rules) {
			if (!rule.appliesTo(relativePath) || rule.allow?.(relativePath)) {
				continue;
			}

			if (rule.mode === 'source') {
				for (const pattern of rule.patterns) {
					const matches = source.matchAll(pattern);
					for (const match of matches) {
						const line = source.slice(0, match.index).split('\n').length;
						violations.push({
							ruleId: rule.id,
							message: rule.message,
							file: relativePath,
							line,
							source: match[0].trim(),
						});
					}
				}
			} else {
				const lines = source.split('\n');
				lines.forEach((line, index) => {
					for (const pattern of rule.patterns) {
						if (pattern.test(line)) {
							violations.push({
								ruleId: rule.id,
								message: rule.message,
								file: relativePath,
								line: index + 1,
								source: line.trim(),
							});
						}
					}
				});
			}
		}
	}

	return violations;
};

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	const violations = await scanFront2DesignSystem();

	if (violations.length > 0) {
		console.error('front-2 design-system guard failed:');
		for (const violation of violations) {
			console.error(
				`${violation.file}:${violation.line} ${violation.ruleId} - ${violation.message}\n  ${violation.source}`,
			);
		}
		process.exit(1);
	}
}
