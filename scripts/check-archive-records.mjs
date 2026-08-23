import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const toPosix = (value) => value.split(path.sep).join('/');
const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n');
const hash = (value) =>
	createHash('sha256').update(normalizeNewlines(value)).digest('hex');

const runGit = (rootDir, args, options = {}) => {
	const result = spawnSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		...options,
	});

	return result;
};

const getArchiveRecordsFromHistory = (rootDir) => {
	const result = runGit(rootDir, [
		'log',
		'--reverse',
		'--pretty=format:',
		'--name-only',
		'--diff-filter=A',
		'--',
		'docs/archive',
	]);

	if (result.status !== 0) {
		return [];
	}

	const records = result.stdout
		.split('\n')
		.map((entry) => entry.trim())
		.filter((entry) => entry.endsWith('.md'));

	return [...new Set(records)].sort((left, right) => left.localeCompare(right));
};

const getArchiveRecordsFromWorkingTree = (directory, prefix) => {
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	const records = [];

	for (const entry of entries) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			records.push(
				...getArchiveRecordsFromWorkingTree(
					absolutePath,
					path.join(prefix, entry.name),
				),
			);
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.md')) {
			records.push(path.join(prefix, entry.name));
		}
	}

	return records;
};

const getArchiveAddCommit = (rootDir, relativeFile) => {
	const result = runGit(rootDir, [
		'log',
		'--format=%H',
		'--reverse',
		'--diff-filter=A',
		'--',
		relativeFile,
	]);

	if (result.status !== 0) {
		return null;
	}

	const commits = result.stdout
		.split('\n')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return commits.length > 0 ? commits[0] : null;
};

const getMergeBase = (rootDir) => {
	const result = runGit(rootDir, ['merge-base', 'origin/develop', 'HEAD']);

	if (result.status !== 0 || !result.stdout.trim()) {
		return null;
	}

	return result.stdout.trim();
};

const fileExistsInCommit = (rootDir, ref, repoPath) => {
	const target = `${ref}:${toPosix(repoPath)}`;
	const result = runGit(rootDir, ['cat-file', '-e', target], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return result.status === 0;
};

const pathExistsInCommit = (rootDir, ref, repoPath) => {
	if (fileExistsInCommit(rootDir, ref, repoPath)) {
		return true;
	}

	const result = runGit(rootDir, [
		'ls-tree',
		'-d',
		'--name-only',
		ref,
		'--',
		toPosix(repoPath),
	]);

	return result.status === 0 && result.stdout.trim().length > 0;
};

const getCommitFile = (rootDir, ref, repoPath) => {
	const target = `${ref}:${toPosix(repoPath)}`;
	const result = runGit(rootDir, ['show', target], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		throw new Error(`Unable to read ${toPosix(repoPath)} from ${ref}`);
	}

	return result.stdout;
};

const parseHeader = (content, relativeFile) => {
	const lines = normalizeNewlines(content).split('\n');
	const errors = [];
	const supersededBy = /^Superseded by:\s+(.+)$/.exec(lines[3]);

	if (lines.length < 5) {
		errors.push({
			file: relativeFile,
			message:
				'Expected at least 5 lines for a four-line header plus a blank separator line',
		});
		return { errors, originalLocation: null };
	}

	if (!/^Status:\s+/.test(lines[0])) {
		errors.push({ file: relativeFile, message: 'Line 1 is missing `Status:`' });
	}

	const originalMatch = /^Original location:\s+(.+)$/.exec(lines[1]);
	if (!originalMatch) {
		errors.push({
			file: relativeFile,
			message: 'Line 2 is missing `Original location:`',
		});
	}

	if (!/^Archive reason:\s+/.test(lines[2])) {
		errors.push({
			file: relativeFile,
			message: 'Line 3 is missing `Archive reason:`',
		});
	}

	if (!/^Superseded by:\s+/.test(lines[3])) {
		errors.push({
			file: relativeFile,
			message: 'Line 4 is missing `Superseded by:`',
		});
	}

	if (lines[4].trim() !== '') {
		errors.push({
			file: relativeFile,
			message: 'Expected line 5 to be blank before the archived body',
		});
	}

	return {
		errors,
		originalLocation: originalMatch?.[1] ?? null,
		supersededBy: supersededBy?.[1] ?? null,
	};
};

const splitToSupersededReferences = (value) => {
	const normalized = value.replace(/`([^`]+)`/g, ' $1 ');
	const pathLike = new Set();
	const slashRefs = new Set();
	const slashBasenames = new Set();

	const normalizeCandidate = (raw) => {
		const candidate = raw
			.replace(/^[`'"\s.,;:)\]}]+/, '')
			.replace(/[`'"\s.,;:([{)]+$/, '')
			.trim();

		if (!candidate) {
			return null;
		}

		const isLikelyReference =
			candidate.includes('/') ||
			candidate.includes('\\') ||
			/^[A-Za-z][A-Za-z0-9._-]*\.[A-Za-z][A-Za-z0-9._-]*$/i.test(candidate);

		if (isLikelyReference && !/^[a-z]+:\/\//i.test(candidate)) {
			return candidate;
		}

		return null;
	};

	const slashPattern =
		/(?:\.\/|\.\.\/)?[A-Za-z0-9_$][A-Za-z0-9._$-]*(?:\/[A-Za-z0-9_$][A-Za-z0-9._$-]*)+[A-Za-z0-9._$-]*/g;
	const dotPattern = /\b[A-Za-z][A-Za-z0-9._-]*\.[A-Za-z][A-Za-z0-9._-]*\b/g;

	for (const token of normalized.split(/\band\b|,|;/i)) {
		for (const match of token.matchAll(slashPattern)) {
			const candidate = normalizeCandidate(match[0]);
			if (!candidate) {
				continue;
			}

			pathLike.add(candidate);
			slashRefs.add(candidate.toLowerCase());
			slashBasenames.add(path.basename(candidate).toLowerCase());
		}

		for (const match of token.matchAll(dotPattern)) {
			const candidate = normalizeCandidate(match[0]);
			if (!candidate) {
				continue;
			}
			const lower = candidate.toLowerCase();
			if (
				!candidate.includes('/') &&
				!slashRefs.has(lower) &&
				!slashBasenames.has(lower)
			) {
				pathLike.add(candidate);
			}
		}
	}

	return [...pathLike];
};

const resolveSupersededReference = (rootDir, sourceFile, candidate) => {
	if (candidate.startsWith('/')) {
		return path.resolve(rootDir, candidate.slice(1));
	}

	if (/^[A-Za-z]:[\\/]/.test(candidate)) {
		return candidate;
	}

	if (candidate.startsWith('./') || candidate.startsWith('../')) {
		return path.resolve(rootDir, path.dirname(sourceFile), candidate);
	}

	return path.resolve(rootDir, candidate);
};

export const runCheck = async (rootDir) => {
	const archiveDir = path.join(rootDir, 'docs', 'archive');
	const archiveFiles = [
		...new Set([
			...getArchiveRecordsFromHistory(rootDir),
			...getArchiveRecordsFromWorkingTree(archiveDir, 'docs/archive'),
		]),
	];
	const counts = {
		recordTotal: 0,
		missingRecords: 0,
		headerTotal: 0,
		headerFail: 0,
		hashTotal: 0,
		hashFail: 0,
		supersededByTotal: 0,
		supersededByMissing: 0,
	};
	const findings = {
		fatal: [],
		warning: [],
	};
	const mergeBase = getMergeBase(rootDir);

	if (mergeBase === null) {
		findings.fatal.push({
			file: 'docs/archive',
			type: 'merge-base',
			message:
				'Unable to resolve merge base for origin/develop and HEAD. Configure origin/develop and retry.',
		});
	}

	counts.recordTotal = archiveFiles.length;
	const files = [];
	for (const relativeFile of archiveFiles.sort((left, right) =>
		left.localeCompare(right),
	)) {
		const absoluteFile = path.join(
			archiveDir,
			path.relative('docs/archive', relativeFile),
		);
		try {
			readFileSync(absoluteFile, 'utf8');
		} catch {
			counts.missingRecords += 1;
			counts.headerFail += 1;
			findings.fatal.push({
				file: relativeFile,
				type: 'archive-record-missing',
				message: `Expected archive record is missing from working tree: ${relativeFile}`,
			});
			continue;
		}

		files.push(absoluteFile);
	}

	counts.headerTotal = counts.recordTotal;

	for (const file of files) {
		const relativeFile = toPosix(path.relative(rootDir, file));
		const content = readFileSync(file, 'utf8');
		const normalized = normalizeNewlines(content);

		const header = parseHeader(normalized, relativeFile);
		header.errors.forEach((failure) => {
			findings.fatal.push(failure);
			counts.headerFail += 1;
		});

		const isPresentAtMergeBase =
			mergeBase !== null
				? fileExistsInCommit(rootDir, mergeBase, relativeFile)
				: false;
		const archiveCommit = getArchiveAddCommit(rootDir, relativeFile);
		counts.hashTotal += 1;

		if (!archiveCommit && !isPresentAtMergeBase) {
			continue;
		}

		const recordedBody = normalized.split('\n').slice(5).join('\n');

		let archivedBodyAtCommit;
		let baselineSource;
		let bodyMismatchMessage;

		try {
			if (isPresentAtMergeBase) {
				archivedBodyAtCommit = getCommitFile(rootDir, mergeBase, relativeFile);
				baselineSource = `merge base ${mergeBase}`;
				bodyMismatchMessage = `Body changed after archive compared with merge base ${mergeBase}`;
			} else if (archiveCommit) {
				archivedBodyAtCommit = getCommitFile(
					rootDir,
					archiveCommit,
					relativeFile,
				);
				baselineSource = `archive add commit ${archiveCommit}`;
				bodyMismatchMessage =
					`Body differs from archived add-commit snapshot ${archiveCommit}. ` +
					`This record changed after it was archived within this change; verify this is a repair and not a rewrite.`;
			} else {
				counts.hashFail += 1;
				findings.fatal.push({
					file: relativeFile,
					type: 'archive-body',
					message: `Unable to locate archived add commit baseline for ${relativeFile}`,
				});
				continue;
			}
		} catch {
			counts.hashFail += 1;
			findings.fatal.push({
				file: relativeFile,
				type: 'archive-body',
				message: `Unable to read archived body at ${baselineSource}:${relativeFile}`,
			});
			continue;
		}

		const baselineBody = normalizeNewlines(archivedBodyAtCommit)
			.split('\n')
			.slice(5)
			.join('\n');
		const bodyHash = hash(recordedBody);
		const baselineHash = hash(baselineBody);

		if (bodyHash !== baselineHash) {
			if (isPresentAtMergeBase) {
				counts.hashFail += 1;
				findings.fatal.push({
					file: relativeFile,
					type: 'body-hash',
					message: `${bodyMismatchMessage}: ${relativeFile} vs ${baselineSource}`,
				});
			} else {
				findings.warning.push({
					file: relativeFile,
					type: 'body-hash',
					message: bodyMismatchMessage,
				});
			}
		}

		if (header.supersededBy) {
			const supersededTargets = splitToSupersededReferences(
				header.supersededBy,
			);
			counts.supersededByTotal += supersededTargets.length;

			for (const rawTarget of supersededTargets) {
				const candidatePath = resolveSupersededReference(
					rootDir,
					relativeFile,
					rawTarget,
				);
				const candidateRepoPath = path.relative(rootDir, candidatePath);
				const resolved =
					!candidateRepoPath.startsWith('..' + path.sep) &&
					!path.isAbsolute(candidateRepoPath) &&
					pathExistsInCommit(rootDir, archiveCommit, candidateRepoPath);

				if (!resolved) {
					counts.supersededByMissing += 1;
					findings.fatal.push({
						file: relativeFile,
						type: 'superseded-by',
						message: `Superseded-by reference does not resolve: ${rawTarget}`,
					});
				}
			}
		}
	}

	return { findings, counts };
};

const report = ({ findings, counts }) => {
	console.log('=== [docs/archive] check-a: header checks ===');
	console.log(
		`Checked ${counts.headerTotal} headers. Passed: ${
			counts.headerTotal - counts.headerFail
		}, Failed: ${counts.headerFail}`,
	);
	console.log(
		`Tracked records in repo history: ${counts.recordTotal}, Missing in working tree: ${counts.missingRecords}`,
	);

	console.log('');
	console.log('=== [docs/archive] check-b: body hash checks ===');
	console.log(
		`Checked ${counts.hashTotal} files. Passed: ${counts.hashTotal - counts.hashFail}, Failed: ${
			counts.hashFail
		}`,
	);
	console.log(`Warnings: ${findings.warning.length}`);
	console.log(
		`Superseded-by references: ${counts.supersededByMissing} unresolved, ${
			counts.supersededByTotal - counts.supersededByMissing
		} resolved or omitted`,
	);

	console.log('');
	console.log('=== [docs/archive] check-c: link checks ===');
	console.log('Link checks were skipped for archived records by design.');

	if (findings.warning.length > 0) {
		console.log('');
		console.log('=== [docs/archive] check-w: body hash warnings ===');
		for (const finding of findings.warning) {
			console.error(
				`- ${finding.file}${finding.line ? `:${finding.line}` : ''} (${finding.type ?? 'header'}) ${finding.message}`,
			);
		}
	}

	if (findings.fatal.length === 0) {
		console.log('docs/archive guard passed with historical exceptions.');
		return 0;
	}

	console.error('docs/archive guard failed:');
	for (const finding of findings.fatal) {
		console.error(
			`- ${finding.file}${finding.line ? `:${finding.line}` : ''} (${finding.type ?? 'header'}) ${finding.message}`,
		);
	}
	return 1;
};

const run = async () => {
	const result = await runCheck(process.cwd());
	process.exit(report(result));
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
