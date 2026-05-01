import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ignoredSegments = new Set([
	'.git',
	'.react-router',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);

const ignoredRelativeRoots = [
	'apps/api/Generated',
	'apps/api/Migrations',
	'apps/api/bin',
	'apps/api/obj',
	'apps/api/openapi',
	'docs/superpowers/plans',
	'packages/client-ts',
];

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

const allowedCoreRules = new Set([
	'default-param-last',
	'no-await-in-loop',
	'no-else-return',
	'no-nested-ternary',
	'no-param-reassign',
	'no-unused-vars',
]);

const bannedReasonPatterns = [
	/<explanation>/i,
	/\bfor now\b/i,
	/\bsafe to use any here\b/i,
	/\bcode from template leave as is for now\b/i,
];

const cwd = process.cwd();
const disableToken = 'oxlint' + '-disable';
const disablePattern = new RegExp(
	`${disableToken}(?:-next-line|-line)?\\s+(.+?)\\s+--\\s+(.+)`,
);

const toPosixPath = (value) => value.split(path.sep).join('/');

const getRelativePath = (filePath) => toPosixPath(path.relative(cwd, filePath));

const isIgnoredPath = (relativePath) =>
	ignoredRelativeRoots.some((ignoredRoot) => {
		return (
			relativePath === ignoredRoot || relativePath.startsWith(`${ignoredRoot}/`)
		);
	});

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
