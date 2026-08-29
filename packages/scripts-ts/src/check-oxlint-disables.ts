import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guardrail for source-owned lint suppressions.
//
// This script is intentionally stricter than oxlint itself: oxlint only needs a
// syntactically valid disable directive, while this repo also requires a
// reviewable reason so suppressions stay auditable over time.

// Directory names that should never be scanned, no matter where they appear in
// the tree. These are generated, dependency, cache, or build artifact folders.
const ignoredSegments = new Set([
	'.git',
	'.react-router',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);

// Repo-relative roots that are intentionally outside this audit. Keep this
// close to .oxlintrc.json's generated-output ignores so the guard follows the
// same source-owned boundary as normal linting.
const ignoredRelativeRoots = [
	'apps/api/.artifacts',
	'apps/api/Migrations',
	'packages/client-ts',
];

// Limit scanning to source-like text files where oxlint directives are expected
// to appear. JSON/CSS/docs are omitted so normal prose cannot trip the guard.
const scannedExtensions = new Set([
	'.cjs',
	'.cts',
	'.js',
	'.jsx',
	'.mjs',
	'.mts',
	'.ts',
	'.tsx',
]);

// Core oxlint rule names do not include a plugin prefix. Any unprefixed rule not
// listed here is treated as suspicious so typos do not silently pass review.
const allowedCoreRules = new Set([
	'default-param-last',
	'no-await-in-loop',
	'no-else-return',
	'no-nested-ternary',
	'no-param-reassign',
	'no-unused-vars',
]);

// These phrases are process smells rather than technical explanations. New
// suppressions need to say what invariant makes the rule inapplicable.
const bannedReasonPatterns = [
	/<explanation>/i,
	/\bfor now\b/i,
	/\bsafe to use any here\b/i,
	/\bcode from template leave as is for now\b/i,
];

const disableToken = 'oxlint' + '-disable';

// Accept all directive variants supported by oxlint. Rule names may be
// comma-separated, but whitespace-separated multi-rule lists are rejected later
// because oxlint's documented multi-rule syntax uses commas.
const disablePattern = new RegExp(
	`${disableToken}(?:-next-line|-line)?\\s+(.+?)\\s+--\\s+(.+)`,
);

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

// @ts-expect-error rung-0: add proper type in later rung
const getRelativePath = (filePath, rootDir) =>
	toPosixPath(path.relative(rootDir, filePath));

/**
 * Checks repo-relative paths against audit-level ignore roots.
 *
 * Segment ignores are handled while walking the tree; this function handles
 * longer repo-relative paths such as generated API/client folders.
 */
// @ts-expect-error rung-0: add proper type in later rung
const isIgnoredPath = (relativePath) =>
	ignoredRelativeRoots.some((ignoredRoot) => {
		return (
			relativePath === ignoredRoot || relativePath.startsWith(`${ignoredRoot}/`)
		);
	});

/**
 * Returns a failure reason for a single suppression line, or null when the
 * directive is specific enough to keep.
 */
// @ts-expect-error rung-0: add proper type in later rung
const getFailureReason = (line) => {
	const match = line.match(disablePattern);

	if (!match) {
		return 'missing a specific rule or reviewable reason';
	}

	const [, ruleNames, reason] = match;
	const trimmedReason = reason.trim();
	// @ts-expect-error rung-0: add proper type in later rung
	const rules = ruleNames.split(',').map((ruleName) => ruleName.trim());

	for (const ruleName of rules) {
		if (ruleName.length === 0) {
			return 'empty rule name';
		}

		if (/\s/.test(ruleName)) {
			return `rule "${ruleName}" must be comma-separated`;
		}

		if (!ruleName.includes('/') && !allowedCoreRules.has(ruleName)) {
			return `core rule "${ruleName}" is not allowed`;
		}
	}

	for (const pattern of bannedReasonPatterns) {
		if (pattern.test(trimmedReason)) {
			return `placeholder reason "${trimmedReason}"`;
		}
	}

	if (trimmedReason.length < 24) {
		return 'reason is shorter than 24 characters';
	}

	return null;
};

/**
 * Walks one source line and extracts the content of every comment whose
 * trimmed content starts with the disable token — i.e. comments that actually
 * ARE oxlint directives. Text inside string literals (fixture payloads such
 * as `'oxlint-disable func-style'`) and prose that merely mentions the token
 * (doc comments like ` * - oxlint-disable func-style — the oxlint variant`)
 * are not directives: oxlint ignores them, so the guard must ignore them too.
 * A guard that flags fixture text on sight installs a false negative — the
 * real directive planted in the same file would be drowned in noise (round-4
 * finding for #1854).
 *
 * The walker tracks string literals and multi-line block comments across
 * calls so a directive on any line is only recognized where it would actually
 * take effect: at the very start of a single-line `//` comment, of a block
 * comment opened with `/*`, or of an `<!-- -->` comment. Everything else on
 * the line is skipped.
 */
const extractDirectiveContents = (
	line: string,
	inBlockComment: boolean,
	blockCommentCloser: string,
): {
	directiveContents: string[];
	inBlockComment: boolean;
	blockCommentCloser: string;
} => {
	const directiveContents: string[] = [];
	let index = 0;
	let inString = false;
	let stringQuote = '';
	let isInBlock = inBlockComment;
	let closer = blockCommentCloser;

	while (index < line.length) {
		if (inString) {
			if (line[index] === '\\') {
				index += 2;
				continue;
			}

			if (line[index] === stringQuote) {
				inString = false;
			}

			index += 1;
			continue;
		}

		if (isInBlock) {
			if (line.startsWith(closer, index)) {
				isInBlock = false;
				index += closer.length;
				continue;
			}

			index += 1;
			continue;
		}

		const char = line[index];

		// A real directive must start a comment; anything inside a string
		// literal is fixture text, not a directive.
		if (char === "'" || char === '"' || char === '`') {
			inString = true;
			stringQuote = char;
			index += 1;
			continue;
		}

		if (line.startsWith('//', index)) {
			const content = line.slice(index + 2).trimStart();
			if (content.startsWith(disableToken)) {
				directiveContents.push(content);
			}
			break;
		}

		if (line.startsWith('/*', index)) {
			const closerIndex = line.indexOf('*/', index + 2);
			if (closerIndex === -1) {
				const content = line.slice(index + 2).trimStart();
				if (content.startsWith(disableToken)) {
					directiveContents.push(content);
				}
				isInBlock = true;
				closer = '*/';
				break;
			}

			const content = line.slice(index + 2, closerIndex).trimStart();
			if (content.startsWith(disableToken)) {
				directiveContents.push(content);
			}
			index = closerIndex + 2;
			continue;
		}

		if (line.startsWith('<!--', index)) {
			const closerIndex = line.indexOf('-->', index + 4);
			if (closerIndex === -1) {
				const content = line.slice(index + 4).trimStart();
				if (content.startsWith(disableToken)) {
					directiveContents.push(content);
				}
				isInBlock = true;
				closer = '-->';
				break;
			}

			const content = line.slice(index + 4, closerIndex).trimStart();
			if (content.startsWith(disableToken)) {
				directiveContents.push(content);
			}
			index = closerIndex + 3;
			continue;
		}

		index += 1;
	}

	return {
		directiveContents,
		inBlockComment: isInBlock,
		blockCommentCloser: closer,
	};
};

/**
 * Scans one source file and appends all low-quality disable findings. Only
 * comment content that actually starts a directive is checked — see
 * `extractDirectiveContents`.
 */
// @ts-expect-error rung-0: add proper type in later rung
const scanFile = async (filePath, failures, rootDir) => {
	const content = await readFile(filePath, 'utf8');
	const relativePath = getRelativePath(filePath, rootDir);
	const lines = content.split(/\r?\n/);

	let inBlockComment = false;
	let blockCommentCloser = '*/';

	for (const [index, line] of lines.entries()) {
		const extracted = extractDirectiveContents(
			line,
			inBlockComment,
			blockCommentCloser,
		);
		inBlockComment = extracted.inBlockComment;
		blockCommentCloser = extracted.blockCommentCloser;

		if (!line.includes(disableToken)) {
			continue;
		}

		for (const directiveContent of extracted.directiveContents) {
			const reason = getFailureReason(directiveContent);

			if (reason === null) {
				continue;
			}

			failures.push(`${relativePath}:${index + 1} - ${reason}`);
		}
	}
};

/**
 * Recursively scans a directory while pruning generated, dependency, and build
 * folders before reading their contents.
 */
// @ts-expect-error rung-0: add proper type in later rung
const scanDirectory = async (directoryPath, failures, rootDir) => {
	const entries = await readdir(directoryPath, { withFileTypes: true });

	for (const entry of entries) {
		if (ignoredSegments.has(entry.name)) {
			continue;
		}

		const entryPath = path.join(directoryPath, entry.name);
		const relativePath = getRelativePath(entryPath, rootDir);

		if (isIgnoredPath(relativePath)) {
			continue;
		}

		if (entry.isDirectory()) {
			await scanDirectory(entryPath, failures, rootDir);
			continue;
		}

		if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
			await scanFile(entryPath, failures, rootDir);
		}
	}
};

export const findOxlintDisableViolations = async (rootDir = process.cwd()) => {
	// @ts-expect-error rung-0: TS7034
	const failures = [];
	// @ts-expect-error rung-0: TS7005
	await scanDirectory(rootDir, failures, rootDir);
	// @ts-expect-error rung-0: TS7005
	return failures;
};

const run = async () => {
	const failures = await findOxlintDisableViolations(process.cwd());

	if (failures.length > 0) {
		console.error('Found low-quality oxlint disable comments:');

		for (const failure of failures) {
			console.error(failure);
		}

		process.exit(1);
	}

	console.log(
		'All oxlint disable comments include specific rules and reviewable reasons.',
	);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
