import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Supply-chain guard: fails when any `uses:` in .github/workflows/** or
// .github/actions/**/action.yml is not pinned to an immutable reference:
//   - `owner/repo@<ref>` must carry a full 40-hex-char commit SHA;
//     a value with NO `@ref` at all is unparseable/unpinnable input and
//     fails closed rather than being skipped.
//   - `docker://image[:tag][@digest]` container references must be pinned
//     by content digest (`@sha256:<64-hex>`); a tag-only or digest-less
//     image is mutable and fails.
// Local actions (starting with `./`) are exempt — they live in the repo,
// and their own `uses:` steps are scanned directly by the
// .github/actions/**/action.yml pass below. (The drift guard hashes only
// workflow step content; it does not parse composite action bodies.)
//
// This prevents the exact class of issue found in round-1 review of
// PR #1248: workflow files using bare moving tags (v4, v7, etc.) instead
// of the commit SHA they actually resolve to.
//
// Paired proof: unpin one line → red naming file+line; revert → green.

const workflowsDir = '.github/workflows';
const actionsDir = '.github/actions';
const shaPattern = /^[0-9a-f]{40}$/;
const dockerDigestPattern = /^sha256:[0-9a-f]{64}$/;

/**
 * Judges one physical line of a workflow or composite-action file.
 * Returns a finding when the line's `uses:` is not pinned to an immutable
 * reference, or null when the line is fine (including non-`uses:` lines and
 * commented-out ones).
 *
 * YAML comments are stripped BEFORE matching: `uses: owner/repo@v1 # <sha>`
 * must be judged by the mutable `@v1` ref, never by the 40-hex SHA that
 * merely sits in the comment. That stripping is load-bearing and pinned by
 * the trailing-comment test in check-actions-pinned.test.mjs.
 */
const findLineFinding = (line) => {
	// Strip YAML comments (# preceded by whitespace or at line start)
	// before matching, so commented-out uses: lines are not flagged.
	const code = line.replace(/#.*/, '');

	// Match `uses:` — YAML indentation-insensitive
	const match = code.match(/uses:\s*(\S+)/);
	if (!match) return null;

	const uses = match[1];

	// Skip local actions (./path)
	if (uses.startsWith('./')) return null;

	// Container references (docker://…): only a content digest pin is
	// immutable. Tag-only or digest-less images fail.
	if (uses.startsWith('docker://')) {
		const digestIdx = uses.lastIndexOf('@');
		const digest = digestIdx === -1 ? '' : uses.slice(digestIdx + 1);

		return dockerDigestPattern.test(digest) ? null : { uses };
	}

	// Fail-closed on input without a `@ref` at all: it cannot be
	// decided, so it never passes silently.
	const atIdx = uses.lastIndexOf('@');
	if (atIdx === -1) return { uses };

	// Accept only a full 40-hex SHA
	return shaPattern.test(uses.slice(atIdx + 1)) ? null : { uses };
};

/**
 * Deterministic lexicographic ordering for reported file paths.
 */
const comparePosixPath = (a, b) => {
	if (a === b) return 0;

	return a < b ? -1 : 1;
};

/**
 * Walks `dir` recursively and yields every *.yml/*.yaml file path
 * (repo-relative POSIX, e.g. .github/actions/group/deploy/action.yml).
 */
const listYamlFiles = async (dir, rootDir) => {
	const files = [];

	const walk = async (current) => {
		const entries = await readdir(current, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) {
				continue;
			}

			files.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
		}
	};

	await walk(dir);

	files.sort(comparePosixPath);

	return files;
};

/**
 * Scans every *.yml/*.yaml under one directory (recursive) and returns an
 * array of { file, line, uses } findings (repo-relative `file`).
 */
const scanDirFindings = async ({ dir, rootDir }) => {
	const findings = [];
	const files = await listYamlFiles(path.join(rootDir, dir), rootDir);

	for (const file of files) {
		const content = await readFile(path.join(rootDir, file), 'utf8');
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const finding = findLineFinding(lines[i]);

			if (finding !== null) {
				findings.push({ file, line: i + 1, uses: finding.uses });
			}
		}
	}

	return findings;
};

/**
 * Scans .github/workflows/** plus everything under .github/actions/…
 * (recursive), and returns an array of { file, line, uses } objects for every
 * non-local `uses:` that is not pinned to an immutable reference (40-char hex
 * SHA for actions, content digest for `docker://` images), including
 * undecidable input such as a missing `@ref`. `file` is repo-relative so
 * findings name the path a human edits from the repo root.
 *
 * Failure semantics are asymmetric on purpose:
 *   - A MISSING .github/workflows is fatal. It almost always means the guard
 *     was started from the wrong working directory, and a silent pass would
 *     certify nothing; the error names the missing path.
 *   - A MISSING .github/actions is tolerated: a repository can legitimately
 *     have zero composite actions.
 */
export const findUnpinnedActions = async ({ rootDir = '.' } = {}) => {
	// Mandatory half: see the failure-semantics note above.
	let workflowFindings;
	try {
		workflowFindings = await scanDirFindings({ dir: workflowsDir, rootDir });
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw new Error(
				`actions-pin guard: ${workflowsDir}/ does not exist under '${rootDir}'. The workflows half of the scan certified nothing, so this fails instead of passing. Run the guard from the repository root.`,
				{ cause: error },
			);
		}

		throw error;
	}

	// Tolerated half: no composite actions yet.
	let actionFindings;
	try {
		actionFindings = await scanDirFindings({ dir: actionsDir, rootDir });
	} catch (error) {
		if (error?.code !== 'ENOENT') {
			throw error;
		}
	}

	return [...workflowFindings, ...(actionFindings ?? [])];
};

// --- CLI entry point ---
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	const findings = await findUnpinnedActions();

	if (findings.length > 0) {
		console.error(
			`::error::${findings.length} uses: reference(s) in .github/workflows or .github/actions are not pinned to an immutable ref (full SHA / docker digest):`,
		);
		for (const f of findings) {
			console.error(`  ${f.file}:${f.line}: ${f.uses}`);
		}
		process.exit(1);
	}

	console.log(
		'All uses: references in .github/workflows and .github/actions are pinned to immutable refs (full SHAs / docker digests).',
	);
}
