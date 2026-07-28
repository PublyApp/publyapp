import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const archiveDir = path.join(rootDir, 'docs', 'archive');
const archiveBaseRef = 'origin/develop';

const toPosix = (value) => value.split(path.sep).join('/');
const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n');
const hash = (value) =>
	createHash('sha256').update(normalizeNewlines(value)).digest('hex');

const knownDeadLinks = new Set([
	'docs/archive/2026/designs/2026-03-28-typescript-6-native-imports-design.md|../../../tsconfig.paths.json',
]);

const knownNonLinks = new Set([
	'docs/archive/2026/designs/2026-04-13-staff-profile-users-drawer-search-design.md|C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/components/scrollbar/scrollbar.tsx',
]);

const runGit = (args, options = {}) => {
	const result = spawnSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		...options,
	});

	return result;
};

const fileExistsInCommit = (ref, repoPath) => {
	const target = `${ref}:${toPosix(repoPath)}`;
	const result = runGit(['cat-file', '-e', target], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return result.status === 0;
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

const findArchiveFiles = async (directory = archiveDir) => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await findArchiveFiles(entryPath)));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.md')) {
			files.push(entryPath);
		}
	}

	return files.sort((left, right) => left.localeCompare(right));
};

const parseHeader = (content, relativeFile) => {
	const lines = normalizeNewlines(content).split('\n');
	const errors = [];

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

	return { errors, originalLocation: originalMatch?.[1] ?? null };
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

const exists = async (candidate) => {
	try {
		await access(candidate);
		return true;
	} catch {
		return false;
	}
};

const resolveLinkCandidates = (archivePath, originalLocation, target) => {
	const rebasedBase = originalLocation
		? path.dirname(originalLocation)
		: path.dirname(archivePath);

	const rebased = path.resolve(rootDir, rebasedBase, target);
	const current = target.startsWith('/')
		? path.resolve(rootDir, target.slice(1))
		: path.resolve(rootDir, path.dirname(archivePath), target);

	return { rebased, current };
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

const run = async () => {
	const files = await findArchiveFiles();
	const counts = {
		headerTotal: 0,
		headerFail: 0,
		hashTotal: 0,
		hashFail: 0,
		rebaseOk: 0,
		currentTreeOk: 0,
		knownDead: 0,
		knownNonLink: 0,
		newDead: 0,
	};
	const findings = [];

	for (const file of files) {
		const relativeFile = toPosix(path.relative(rootDir, file));
		const content = readFileSync(file, 'utf8');
		const normalized = normalizeNewlines(content);

		const header = parseHeader(normalized, relativeFile);
		header.errors.forEach((failure) => {
			findings.push(failure);
			counts.headerFail += 1;
		});
		counts.headerTotal += 1;

		const archiveCommit = (() => {
			const result = runGit([
				'log',
				'--format=%H',
				'--max-count=1',
				'--',
				relativeFile,
			]);
			if (result.status !== 0 || !result.stdout.trim()) {
				return null;
			}

			return result.stdout.trim();
		})();

		if (!archiveCommit) {
			findings.push({
				file: relativeFile,
				type: 'archive-commit',
				message: `Could not resolve archive commit for ${relativeFile}`,
			});
			counts.hashFail += 1;
			counts.hashTotal += 1;
		}

		const originalLocation = header.originalLocation;
		if (!originalLocation) {
			if (archiveCommit) {
				counts.hashFail += 1;
				counts.hashTotal += 1;
			}
		} else {
			counts.hashTotal += 1;

			if (!fileExistsInCommit(archiveBaseRef, originalLocation)) {
				counts.hashFail += 1;
				findings.push({
					file: relativeFile,
					type: 'original-location',
					message: `Original location does not exist at ${archiveBaseRef}: ${originalLocation}`,
				});
			} else {
				const bodyHash = hash(normalized.split('\n').slice(5).join('\n'));
				const originalBody = getCommitFile(archiveBaseRef, originalLocation);
				const originalHash = hash(originalBody);

				if (bodyHash !== originalHash) {
					counts.hashFail += 1;
					findings.push({
						file: relativeFile,
						type: 'body-hash',
						message: `Body hash does not match ${archiveBaseRef}:${originalLocation}`,
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

			const key = `${relativeFile}|${target}`;
			if (isWindowPath(target)) {
				if (knownNonLinks.has(key)) {
					counts.knownNonLink += 1;
					continue;
				}

				counts.newDead += 1;
				findings.push({
					file: relativeFile,
					line: link.line,
					type: 'non-link',
					message: `Unexpected non-file path: ${target}`,
				});
				continue;
			}

			const { rebased, current } = resolveLinkCandidates(
				file,
				originalLocation ?? '',
				target,
			);
			const rebasedExists = await exists(rebased);
			const currentExists = await exists(current);

			if (rebasedExists || currentExists) {
				if (rebasedExists) {
					counts.rebaseOk += 1;
					continue;
				}

				counts.currentTreeOk += 1;
				continue;
			}

			if (knownDeadLinks.has(key)) {
				counts.knownDead += 1;
				continue;
			}

			counts.newDead += 1;
			findings.push({
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

	console.log('');
	console.log('=== [docs/archive] check-b: body hash checks ===');
	console.log(
		`Checked ${counts.hashTotal} files. Passed: ${counts.hashTotal - counts.hashFail}, Failed: ${
			counts.hashFail
		}`,
	);

	console.log('');
	console.log('=== [docs/archive] check-c: link checks ===');
	console.log(`Rebased (original-location) resolvable: ${counts.rebaseOk}`);
	console.log(`Genuinely dead: ${counts.knownDead}`);
	console.log(`Allowed non-link references: ${counts.knownNonLink}`);
	console.log(`Newly unresolved references: ${counts.newDead}`);
	console.log(`Current-tree-only resolvable: ${counts.currentTreeOk}`);
	console.log('');

	if (findings.length === 0) {
		console.log('docs/archive guard passed with historical exceptions.');
		return;
	}

	console.error('docs/archive guard failed:');
	for (const finding of findings) {
		console.error(
			`- ${finding.file}${finding.line ? `:${finding.line}` : ''} (${finding.type ?? 'header'}) ${finding.message}`,
		);
	}
	process.exit(1);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
