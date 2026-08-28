import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Supply-chain guard: fails when any scanned `uses:` reference is not pinned
// to an immutable reference:
//   - `owner/repo@<ref>` must carry a full 40-hex-char commit SHA;
//     a value with NO `@ref` at all is unparseable/unpinnable input and
//     fails closed rather than being skipped.
//   - `docker://image[:tag][@digest]` container references must be pinned
//     by content digest (`@sha256:<64-hex>`); a tag-only or digest-less
//     image is mutable and fails.
//   - `uses:` values starting with `./` or `../` (local references) are NOT
//     exempt: each one is resolved to `<repo-root>/<path>/action.yml|yaml`
//     and that file's body goes through the same line scan, recursively for
//     local refs found inside resolved actions (a visited set makes cycles
//     terminate). A referenced action file that does not exist — or a value
//     resolving OUTSIDE the repo root — is itself a finding: fail closed,
//     never silently skipped (#1268). Containment holds on REAL paths
//     (#1277): access()/readFile() dereference symlinks, so a committed
//     symlink whose target leaves the repository is a finding too, not a
//     license to judge files stored outside the repo.
//
// EXACTLY WHAT IS SCANNED:
//   - every *.yml/*.yaml file under .github/workflows/ (recursive), and
//   - every *.yml/*.yaml file under .github/actions/ (recursive) — not only
//     action.yml manifests, so stray YAML carrying a `uses:` there is also
//     judged, plus
//   - every action.yml/action.yaml reachable from those files through
//     `uses: ./<path>` values (any path in the repository, not just under
//     .github/). A missing .github/actions is tolerated (zero composite
//     actions is legitimate); a missing .github/workflows fails loud.
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

type UnpinnedActionFinding = {
	file: string;
	line: number;
	uses: string;
	reason?: string;
};

type LineFinding =
	| { uses: string; local: true }
	| { uses: string; local?: undefined };

type LocalActionTarget =
	| { ok: true; file: string }
	| { ok: false; reason: string };

/**
 * Judges one physical line of a workflow or composite-action file.
 * Returns a finding descriptor when the line carries a `uses:` that needs
 * judging ({ uses, local }), or null for lines that need none (non-`uses:`
 * lines and commented-out ones).
 *
 * `local` marks `./<path>` values: since #1268 they are not exempt — the
 * caller resolves them to their action manifest and scans it recursively;
 * the pin judgment itself stays out of scope for this function.
 *
 * Rationale note (corrected in the #1261 round 2): the pin judgment itself
 * never needs the comment strip — `/uses:\s*(\S+)/` stops at whitespace,
 * so a trailing `# <40-hex>` comment can never enter the captured ref.
 * Stripping exists to keep DEAD lines (commented-out `uses:`) out of the
 * findings, i.e. it prevents false positives, and is pinned by the
 * commented-out-lines test. What the trailing-comment test actually pins
 * is the opposite direction: judging a live line by a 40-hex SHA found
 * ANYWHERE on it (e.g. in its comment) must stay a FAILING mutable-ref
 * case, never a silent pass.
 */
const findLineFinding = (line: string): LineFinding | null => {
	// Strip YAML comments (# preceded by whitespace or at line start)
	// before matching, so commented-out uses: lines are not flagged.
	const code = line.replace(/#.*/, '');

	// Match `uses:` — YAML indentation-insensitive
	const match = code.match(/uses:\s*(\S+)/);
	if (!match) return null;

	const uses = match[1];

	// Local actions (./path, or an escaping ../path): reported as
	// unresolved-local here; resolution plus recursive scan happens in
	// findUnpinnedActions (#1268).
	if (uses.startsWith('./') || uses.startsWith('../')) {
		return { uses, local: true };
	}

	// Container references (docker://…): only a content digest pin is
	// immutable. Tag-only or digest-less images fail.
	if (uses.startsWith('docker://')) {
		const digestIdx = uses.lastIndexOf('@');
		const digest = digestIdx === -1 ? '' : uses.slice(digestIdx + 1);

		if (dockerDigestPattern.test(digest)) {
			return null;
		}
		return { uses };
	}

	// Fail-closed on input without a `@ref` at all: it cannot be
	// decided, so it never passes silently.
	const atIdx = uses.lastIndexOf('@');
	if (atIdx === -1) return { uses };

	// Accept only a full 40-hex SHA
	if (shaPattern.test(uses.slice(atIdx + 1))) {
		return null;
	}
	return { uses };
};

/**
 * Resolves one `uses: ./<path>` value against `rootDir` and returns the
 * repo-relative POSIX path of the target manifest ({ ok, file }), or a
 * failure reason ({ ok: false, reason }). GitHub resolves local actions to
 * <path>/action.yml first, then <path>/action.yaml; the value must stay
 * inside the repo root — one that escapes it (../) fails instead of being
 * followed (#1268).
 *
 * #1277: containment is enforced twice. The value is checked lexically
 * (path.relative), then the winning manifest is resolved with fs.realpath
 * and its REAL path must stay under the repo root's real path. A committed
 * symlink like `tools/escape -> <outside>` passes the lexical half but
 * access()/readFile() dereference it, so without the second check the guard
 * would read and judge a file outside the repository.
 */
const resolveLocalActionTarget = async (
	usesValue: string,
	rootDir: string,
): Promise<LocalActionTarget> => {
	// Both containment halves compare REAL coordinates: resolving `rootDir`
	// first keeps this correct even when the caller's cwd chain crosses a
	// symlink (e.g. a tmpdir parent), where mixing lexical and real paths
	// would reject every in-repo target.
	const realRoot = await realpath(path.resolve(rootDir));
	const joined = path.resolve(realRoot, usesValue);
	const relToRoot = path.relative(realRoot, joined);

	if (
		relToRoot.startsWith('..') ||
		path.isAbsolute(relToRoot) ||
		relToRoot === ''
	) {
		return {
			ok: false,
			reason: 'local action reference resolves outside the repository root',
		};
	}

	const relBase = relToRoot.split(path.sep).join('/');

	for (const manifest of ['action.yml', 'action.yaml']) {
		const rel = `${relBase}/${manifest}`;
		let realTarget: string;
		try {
			realTarget = await realpath(path.join(rootDir, rel));
		} catch {
			// missing manifest — try the next candidate
			continue;
		}

		const relReal = path.relative(realRoot, realTarget);

		if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
			return {
				ok: false,
				reason: `symbolic link target leaves the repository root: ${rel} points at ${realTarget}`,
			};
		}

		return { ok: true, file: rel };
	}

	return {
		ok: false,
		reason: `target action file not found: ${relBase}/action.yml|yaml`,
	};
};

/**
 * Deterministic lexicographic ordering for reported file paths.
 */
const comparePosixPath = (a: string, b: string): number => {
	if (a === b) return 0;

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
 * Scans ONE file's lines into `findings`. Local `uses: ./<path>` values are
 * resolved here and their target manifests are scanned recursively through
 * this same function; `visited` guarantees every file is judged exactly
 * once, which makes reference cycles terminate (#1268). The caller must
 * have added `file` to `visited` before invoking.
 */
const scanFileFindings = async ({
	file,
	rootDir,
	visited,
	findings,
}: {
	file: string;
	rootDir: string;
	visited: Set<string>;
	findings: UnpinnedActionFinding[];
}): Promise<void> => {
	const content = await readFile(path.join(rootDir, file), 'utf8');
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const finding = findLineFinding(lines[i]);

		if (finding === null) continue;

		if (finding.local) {
			// #1268: resolve the ./ target, fail closed when it does not exist
			// or escapes the repo root, otherwise follow it recursively.
			const target = await resolveLocalActionTarget(finding.uses, rootDir);

			if (!target.ok) {
				findings.push({
					file,
					line: i + 1,
					uses: finding.uses,
					reason: target.reason,
				});
				continue;
			}

			if (!visited.has(target.file)) {
				visited.add(target.file);
				await scanFileFindings({
					file: target.file,
					rootDir,
					visited,
					findings,
				});
			}

			continue;
		}

		findings.push({ file, line: i + 1, uses: finding.uses });
	}
};

/**
 * Scans .github/workflows/** plus everything under .github/actions/…
 * (recursive), follows every `uses: ./<path>` reference to its
 * action.yml/action.yaml (anywhere in the repository, recursively, cycle-
 * safe), and returns an array of { file, line, uses, reason? } objects for
 * every `uses:` that is not pinned to an immutable reference (40-char hex
 * SHA for actions, content digest for `docker://` images), including
 * undecidable input such as a missing `@ref`; unresolved local references
 * carry an extra human-readable `reason` naming why they failed closed.
 * `file` is repo-relative so findings name the path a human edits from the
 * repo root.
 *
 * Failure semantics are asymmetric on purpose:
 *   - A MISSING .github/workflows is fatal. It almost always means the guard
 *     was started from the wrong working directory, and a silent pass would
 *     certify nothing; the error names the missing path.
 *   - A MISSING .github/actions is tolerated: a repository can legitimately
 *     have zero composite actions.
 */
export const findUnpinnedActions = async ({
	rootDir = '.',
}: {
	rootDir?: string;
} = {}): Promise<UnpinnedActionFinding[]> => {
	const findings: UnpinnedActionFinding[] = [];
	const visited = new Set<string>();

	// Mandatory half: see the failure-semantics note above.
	let workflowFiles: string[];
	try {
		workflowFiles = await listYamlFiles(
			path.join(rootDir, workflowsDir),
			rootDir,
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
			throw new Error(
				`actions-pin guard: ${workflowsDir}/ does not exist under '${rootDir}'. The workflows half of the scan certified nothing, so this fails instead of passing. Run the guard from the repository root.`,
				{ cause: error },
			);
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

	// Every file discovered up front counts as visited so a local reference
	// back into either directory never rescans it.
	for (const file of [...workflowFiles, ...actionFiles]) {
		visited.add(file);
	}

	for (const file of workflowFiles) {
		await scanFileFindings({ file, rootDir, visited, findings });
	}

	for (const file of actionFiles) {
		await scanFileFindings({ file, rootDir, visited, findings });
	}

	return findings;
};

// --- CLI entry point ---
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	const findings = await findUnpinnedActions();

	if (findings.length > 0) {
		console.error(
			`::error::${String(findings.length)} uses: reference(s) in .github/workflows, .github/actions, or the local actions they resolve to are not pinned to an immutable ref (full SHA / docker digest):`,
		);
		for (const f of findings) {
			console.error(
				`  ${f.file}:${String(f.line)}: ${f.uses}${f.reason ? ` — ${f.reason}` : ''}`,
			);
		}
		process.exit(1);
	}

	console.log(
		'All uses: references in .github/workflows, .github/actions, and every local action they resolve to are pinned to immutable refs (full SHAs / docker digests).',
	);
}
