import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Shared scan core of the two GitHub-Actions supply-chain guards:
//   - check-actions-pinned.ts  every `uses:` must carry an immutable ref,
//   - check-actions-pins.ts    every pinned SHA must match its `# vX.Y.Z`.
//
// Both must judge EXACTLY the same file set with EXACTLY the same `uses:`
// classification — a guard that certifies a different tree than its sibling is
// how a mutable ref slips through. One implementation here makes that
// structural. What each guard decides ABOUT a reference (SHA pinning vs
// version-comment binding) deliberately stays in the guard: those are different
// policies, not two copies of one.

export const workflowsDir = '.github/workflows';
export const actionsDir = '.github/actions';

/**
 * The class of one physical line's `uses:` value:
 *   - local:  `./<path>` (or an escaping `../<path>`) composite action
 *   - docker: `docker://` container reference
 *   - action: an owner/repo reference whose ref the guard must judge
 * null (see `parseUsesLine`) means the line carries no `uses:` at all.
 */
export type UsesLine =
	| { kind: 'local'; uses: string }
	| { kind: 'docker'; uses: string }
	| { kind: 'action'; uses: string };

/**
 * Judges one physical line of a workflow or composite-action file.
 * Returns the `uses:` value and its class, or null for lines that carry none
 * (non-`uses:` lines and commented-out ones).
 *
 * The YAML comment is stripped (# preceded by whitespace or at line start)
 * before matching, so commented-out `uses:` lines are never judged. The pin
 * judgment itself never needs the strip — `/uses:\s*(\S+)/` stops at
 * whitespace, so a trailing `# <40-hex>` comment can never enter the captured
 * ref. Stripping exists to keep DEAD lines out of the findings, i.e. it
 * prevents false positives, and is pinned by the commented-out-lines tests.
 *
 * The comment is NOT stripped from the returned line: each guard reads the
 * version comment (`# v7`) from the raw line, which is the whole point of the
 * pins guard. Callers that only need the value use `uses`.
 */
export const parseUsesLine = (line: string): UsesLine | null => {
	// Strip YAML comments before matching, so commented-out uses: lines are
	// not flagged.
	const code = line.replace(/#.*/, '');

	// Match `uses:` — YAML indentation-insensitive
	const match = code.match(/uses:\s*(\S+)/);
	if (!match) {
		return null;
	}

	const uses = match[1];

	// Local actions (./path, or an escaping ../path): NOT exempt. The caller
	// resolves each one to its action manifest and scans that recursively; a
	// dangling or escaping reference is a finding, never a silent skip
	// (#1268).
	if (uses.startsWith('./') || uses.startsWith('../')) {
		return { kind: 'local', uses };
	}

	// Container references (docker://…): the pinning policy (content digest)
	// lives in check-actions-pinned.ts; the pins guard has no version comment
	// to bind on them.
	if (uses.startsWith('docker://')) {
		return { kind: 'docker', uses };
	}

	return { kind: 'action', uses };
};

/**
 * Deterministic lexicographic ordering for reported file paths.
 */
const comparePosixPath = (a: string, b: string): number => {
	if (a === b) {
		return 0;
	}

	if (a < b) {
		return -1;
	}
	return 1;
};

/**
 * Walks `dir` recursively and yields every *.yml/*.yaml file path
 * (repo-relative POSIX, e.g. .github/actions/group/deploy/action.yml).
 */
const listYamlFiles = async (
	dir: string,
	rootDir: string,
): Promise<string[]> => {
	const files: string[] = [];

	const walk = async (current: string): Promise<void> => {
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
 * Lists the files both actions guards scan, with the SAME asymmetric failure
 * semantics:
 *   - A MISSING .github/workflows is fatal. It almost always means the guard
 *     was started from the wrong working directory, and a silent pass would
 *     certify nothing; the error names the missing path. `missingWorkflowsMessage`
 *     is supplied by the caller so each guard keeps its own wording.
 *   - A MISSING .github/actions is tolerated: a repository can legitimately
 *     have zero composite actions.
 *
 * `workflowFiles` and `actionFiles` are repo-relative POSIX paths, sorted.
 */
export const discoverScanFiles = async (
	rootDir: string,
	missingWorkflowsMessage: string,
): Promise<{ workflowFiles: string[]; actionFiles: string[] }> => {
	// Mandatory half: see the failure-semantics note above.
	let workflowFiles: string[];
	try {
		workflowFiles = await listYamlFiles(
			path.join(rootDir, workflowsDir),
			rootDir,
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
			throw new Error(missingWorkflowsMessage, { cause: error });
		}

		throw error;
	}

	// Tolerated half: no composite actions yet.
	let actionFiles: string[] = [];
	try {
		actionFiles = await listYamlFiles(path.join(rootDir, actionsDir), rootDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			throw error;
		}
	}

	return { actionFiles, workflowFiles };
};
