import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

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
	'apps/api/Generated',
	'apps/api/Migrations',
	'apps/api/bin',
	'apps/api/obj',
	'apps/api/openapi',
	'docs/superpowers/plans',
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

const cwd = process.cwd();
const disableToken = 'oxlint' + '-disable';

// Accept all directive variants supported by oxlint. Rule names may be
// comma-separated, but whitespace-separated multi-rule lists are rejected later
// because oxlint's documented multi-rule syntax uses commas.
const disablePattern = new RegExp(
	`${disableToken}(?:-next-line|-line)?\\s+(.+?)\\s+--\\s+(.+)`,
);

const toPosixPath = (value) => value.split(path.sep).join('/');

const getRelativePath = (filePath) => toPosixPath(path.relative(cwd, filePath));

/**
 * Checks repo-relative paths against audit-level ignore roots.
 *
 * Segment ignores are handled while walking the tree; this function handles
 * longer repo-relative paths such as generated API/client folders.
 */
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
const getFailureReason = (line) => {
	const match = line.match(disablePattern);

	if (!match) {
		return 'missing a specific rule or reviewable reason';
	}

	const [, ruleNames, reason] = match;
	const trimmedReason = reason.trim();
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
 * Scans one source file and appends all low-quality disable findings.
 */
const scanFile = async (filePath, failures) => {
	const content = await readFile(filePath, 'utf8');
	const relativePath = getRelativePath(filePath);
	const lines = content.split(/\r?\n/);

	for (const [index, line] of lines.entries()) {
		if (!line.includes(disableToken)) {
			continue;
		}

		const reason = getFailureReason(line);

		if (reason === null) {
			continue;
		}

		failures.push(`${relativePath}:${index + 1} - ${reason}`);
	}
};

/**
 * Recursively scans a directory while pruning generated, dependency, and build
 * folders before reading their contents.
 */
const scanDirectory = async (directoryPath, failures) => {
	const entries = await readdir(directoryPath, { withFileTypes: true });

	for (const entry of entries) {
		if (ignoredSegments.has(entry.name)) {
			continue;
		}

		const entryPath = path.join(directoryPath, entry.name);
		const relativePath = getRelativePath(entryPath);

		if (isIgnoredPath(relativePath)) {
			continue;
		}

		if (entry.isDirectory()) {
			await scanDirectory(entryPath, failures);
			continue;
		}

		if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
			await scanFile(entryPath, failures);
		}
	}
};

const failures = [];

await scanDirectory(cwd, failures);

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
