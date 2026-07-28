import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const archiveDir = path.join(rootDir, 'docs', 'archive');

const toPosix = (value) => value.split(path.sep).join('/');
const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n');
const hash = (value) =>
	createHash('sha256').update(normalizeNewlines(value)).digest('hex');

const runGit = (args, options = {}) => {
	const result = spawnSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		...options,
	});

	return result;
};

const getArchiveRecordsFromHistory = () => {
	const result = runGit([
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

const getArchiveAddCommit = (relativeFile) => {
	const result = runGit([
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

const fileExistsInCommit = (ref, repoPath) => {
	const target = `${ref}:${toPosix(repoPath)}`;
	const result = runGit(['cat-file', '-e', target], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return result.status === 0;
};

const pathExistsInCommit = (ref, repoPath) => {
	if (fileExistsInCommit(ref, repoPath)) {
		return true;
	}

	const result = runGit([
		'ls-tree',
		'-d',
		'--name-only',
		ref,
		'--',
		toPosix(repoPath),
	]);

	return result.status === 0 && result.stdout.trim().length > 0;
};

const getCommitFile = (ref, repoPath) => {
	const target = `${ref}:${toPosix(repoPath)}`;
	const result = runGit(['show', target], {
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

const isExternalOrAuxiliaryLink = (target) => {
	const lowered = target.toLowerCase();

	return (
		target.startsWith('{') ||
		target === '>' ||
		target.startsWith('#') ||
		lowered.startsWith('http://') ||
		lowered.startsWith('https://') ||
		lowered.startsWith('mailto:') ||
		lowered.startsWith('tel:') ||
		lowered.startsWith('ftp://') ||
		lowered.startsWith('news:') ||
		lowered.startsWith('javascript:') ||
		lowered.startsWith('irc:')
	);
};

const isWindowPath = (target) => /^[A-Za-z]:[\\/]/.test(target);

const normalizeTarget = (rawTarget) => {
	const trimmed = rawTarget.trim().replace(/^<|>$/g, '');
	if (!trimmed) {
		return '';
	}

	const trimmedForQueries = trimmed.split('?')[0];
	return trimmedForQueries.split('#')[0].trim();
};

const resolveLinkCandidates = (archivePath, originalLocation, target) => {
	const rebasedBase = originalLocation
		? path.dirname(originalLocation)
		: path.dirname(archivePath);

	const rebased = path.resolve(rootDir, rebasedBase, target);
	const current = target.startsWith('/')
		? path.resolve(rootDir, target.slice(1))
		: path.resolve(rootDir, path.dirname(archivePath), target);
	const coArchive = target.startsWith('/')
		? null
		: path.resolve(rootDir, path.dirname(archivePath), target);

	return { rebased, current, coArchive };
};

const extractLinks = (content) => {
	const links = [];
	const lines = normalizeNewlines(content).split('\n');
	const inlineLink = /!?\[[^\]]*?\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
	const referenceDef = /^\s*\[[^\]]+\]:\s+([^\s)]+)(?:\s+["'][^"']*["'])?\s*$/;
	let inFence = false;

	for (const [index, originalLine] of lines.entries()) {
		const trimmed = originalLine.trim();
		if (/^(```|~~~)/.test(trimmed)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const line = originalLine.replace(/`[^`]*`/g, '');
		for (const match of line.matchAll(inlineLink)) {
			links.push({
				raw: match[1],
				line: index + 1,
			});
		}

		const defMatch = referenceDef.exec(line);
		if (defMatch !== null) {
			links.push({
				raw: defMatch[1],
				line: index + 1,
			});
		}
	}

	return links;
};

const getPathKind = async (candidate) => {
	try {
		const info = await stat(candidate);

		if (info.isDirectory()) {
			return 'directory';
		}

		if (info.isFile()) {
			return 'file';
		}

		return 'other';
	} catch {
		return 'missing';
	}
};

const splitToSupersededReferences = (value) => {
	const normalized = value.replace(/`([^`]+)`/g, ' $1 ');
	const pathLike = new Set();
	const slashRefs = new Set();
	const slashBasenames = new Set();

	const normalizeCandidate = (raw) => {
		const candidate = raw
			.replace(/^[`'"\s.,;:\)\]}]+/, '')
			.replace(/[`'"\s.,;:\(\[{)]+$/, '')
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

const stripArchiveCoArchiveClause = (value) => {
	const lines = normalizeNewlines(value).split('\n');
	const cleaned = [];
	const normalizedLine = (line) =>
		line
			.trim()
			.replace(/^[>\s*`-]+/, '')
			.trim();

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();
		const normalized = normalizedLine(line);

		if (
			normalized.startsWith(
				'This cited target was archived in the same wave, so its record lives at',
			)
		) {
			const next = normalizedLine(lines[index + 1] ?? '');
			if (next && /docs\/archive\//i.test(next)) {
				index += 1;
			}
			continue;
		}

		if (
			normalized.startsWith(
				'If that cited target is archived in the same wave, use the sibling copy under',
			)
		) {
			const next = normalizedLine(lines[index + 1] ?? '');
			if (next && /docs\/archive\//i.test(next)) {
				index += 1;
			}
			continue;
		}

		cleaned.push(line);
	}

	return cleaned.join('\n');
};

const getOriginalBodySourceCommit = (archiveAddCommit, originalLocation) => {
	if (!archiveAddCommit || !originalLocation) {
		return null;
	}

	const result = runGit([
		'log',
		'--follow',
		'--format=%H',
		'--max-count=30',
		`${archiveAddCommit}^`,
		'--',
		originalLocation,
	]);

	if (result.status !== 0) {
		return null;
	}

	const candidates = result.stdout
		.split('\n')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	for (const candidate of candidates) {
		if (fileExistsInCommit(candidate, originalLocation)) {
			return candidate;
		}
	}

	return null;
};

const resolveSupersededReference = (sourceFile, candidate) => {
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

const run = async () => {
	const archiveFiles = getArchiveRecordsFromHistory();
	const counts = {
		recordTotal: 0,
		missingRecords: 0,
		headerTotal: 0,
		headerFail: 0,
		hashTotal: 0,
		hashFail: 0,
		supersededByTotal: 0,
		supersededByMissing: 0,
		rebaseFile: 0,
		rebaseDirectory: 0,
		coArchiveFile: 0,
		coArchiveDirectory: 0,
		currentFile: 0,
		currentDirectory: 0,
		newDead: 0,
	};
	const findings = {
		fatal: [],
		link: [],
	};

	counts.recordTotal = archiveFiles.length;
	const files = [];
	for (const relativeFile of archiveFiles.sort((left, right) =>
		left.localeCompare(right),
	)) {
		const absoluteFile = path.join(
			archiveDir,
			path.relative('docs/archive', relativeFile),
		);
		const kind = await getPathKind(absoluteFile);

		if (kind !== 'file') {
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

		const archiveCommit = getArchiveAddCommit(relativeFile);

		if (!archiveCommit) {
			findings.fatal.push({
				file: relativeFile,
				type: 'archive-commit',
				message: `Could not resolve archive commit for ${relativeFile}`,
			});
			counts.hashFail += 1;
			counts.hashTotal += 1;
			continue;
		}

		const originalLocation = header.originalLocation;
		if (!originalLocation) {
			counts.hashFail += 1;
			counts.hashTotal += 1;
		} else {
			const sourceCommit = getOriginalBodySourceCommit(
				archiveCommit,
				originalLocation,
			);

			counts.hashTotal += 1;

			if (!sourceCommit) {
				counts.hashFail += 1;
				findings.fatal.push({
					file: relativeFile,
					type: 'original-location',
					message: `Original location has no resolvable source on ancestry ${archiveCommit}: ${originalLocation}`,
				});
			} else {
				const recordedBody = stripArchiveCoArchiveClause(
					normalized.split('\n').slice(5).join('\n'),
				);
				let originalBody;

				try {
					originalBody = getCommitFile(sourceCommit, originalLocation);
				} catch {
					counts.hashFail += 1;
					findings.fatal.push({
						file: relativeFile,
						type: 'original-body',
						message: `Unable to read archived source body at ${sourceCommit}:${originalLocation}`,
					});
				}

				if (originalBody === undefined) {
					continue;
				}

				const sourceBody = stripArchiveCoArchiveClause(
					normalizeNewlines(originalBody),
				);
				const bodyHash = hash(recordedBody);
				const originalHash = hash(sourceBody);

				if (bodyHash !== originalHash) {
					counts.hashFail += 1;
					findings.fatal.push({
						file: relativeFile,
						type: 'body-hash',
						message: `Body hash does not match ${sourceCommit}:${originalLocation}`,
					});
				}
			}
		}

		const supersededBy = header.supersededBy;
		if (supersededBy) {
			const supersededTargets = splitToSupersededReferences(supersededBy);
			counts.supersededByTotal += supersededTargets.length;

			for (const rawTarget of supersededTargets) {
				const candidatePath = resolveSupersededReference(
					relativeFile,
					rawTarget,
				);
				const candidateRepoPath = path.relative(rootDir, candidatePath);
				const resolved =
					!candidateRepoPath.startsWith('..' + path.sep) &&
					!path.isAbsolute(candidateRepoPath) &&
					pathExistsInCommit(archiveCommit, candidateRepoPath);

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

		const links = extractLinks(normalized);
		for (const link of links) {
			const target = normalizeTarget(link.raw);
			if (!target || isExternalOrAuxiliaryLink(target)) {
				continue;
			}

			if (isWindowPath(target)) {
				counts.newDead += 1;
				findings.link.push({
					file: relativeFile,
					line: link.line,
					type: 'non-link',
					message: `Unexpected non-file path: ${target}`,
				});
				continue;
			}

			const { rebased, current, coArchive } = resolveLinkCandidates(
				file,
				originalLocation ?? '',
				target,
			);
			const rebasedKind = await getPathKind(rebased);
			const currentKind = await getPathKind(current);
			const coArchiveKind = coArchive
				? await getPathKind(coArchive)
				: 'missing';

			if (rebasedKind === 'file') {
				counts.rebaseFile += 1;
				continue;
			}

			if (rebasedKind === 'directory') {
				counts.rebaseDirectory += 1;
				continue;
			}

			if (coArchiveKind === 'file') {
				counts.coArchiveFile += 1;
				continue;
			}

			if (coArchiveKind === 'directory') {
				counts.coArchiveDirectory += 1;
				continue;
			}

			if (currentKind === 'file') {
				counts.currentFile += 1;
				continue;
			}

			if (currentKind === 'directory') {
				counts.currentDirectory += 1;
				continue;
			}

			counts.newDead += 1;
			findings.link.push({
				file: relativeFile,
				line: link.line,
				type: 'dead-link',
				message: `Unresolved link target: ${target}`,
			});
		}
	}

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
	console.log(
		`Superseded-by references: ${counts.supersededByMissing} unresolved, ${
			counts.supersededByTotal - counts.supersededByMissing
		} resolved or omitted`,
	);

	console.log('');
	console.log('=== [docs/archive] check-c: link checks ===');
	console.log(
		`Rebased (original-location) resolvable files: ${counts.rebaseFile}`,
	);
	console.log(
		`Rebased (original-location) resolvable directories: ${counts.rebaseDirectory}`,
	);
	console.log(`Co-archive resolvable files: ${counts.coArchiveFile}`);
	console.log(
		`Co-archive resolvable directories: ${counts.coArchiveDirectory}`,
	);
	console.log(`Current-tree-only resolvable files: ${counts.currentFile}`);
	console.log(
		`Current-tree-only resolvable directories: ${counts.currentDirectory}`,
	);
	console.log(`Newly unresolved references: ${counts.newDead}`);
	console.log('');

	if (counts.newDead === 0) {
		console.log('No unresolved link targets found in report.');
	}

	if (findings.link.length === 0) {
		console.log(
			'No link targets with unexpected resolution behavior in report.',
		);
	} else {
		console.log('');
		console.log('Unresolved/target class reporting:');
		for (const finding of findings.link) {
			console.log(
				`- ${finding.file}${finding.line ? `:${finding.line}` : ''} (${finding.type}) ${finding.message}`,
			);
		}
	}

	if (findings.fatal.length === 0) {
		console.log('docs/archive guard passed with historical exceptions.');
		process.exit(0);
	}

	console.error('docs/archive guard failed:');
	for (const finding of findings.fatal) {
		console.error(
			`- ${finding.file}${finding.line ? `:${finding.line}` : ''} (${finding.type ?? 'header'}) ${finding.message}`,
		);
	}
	process.exit(1);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
