import { execFile } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Supply-chain guard (#1392): binds every pinned action SHA to the version
// its `# vX.Y.Z` comment CLAIMS. The sibling guard check-actions-pinned.ts
// proves each `uses:` carries a full 40-hex SHA; this guard proves the SHA is
// what the comment says it is, so a wrong SHA under a right-looking comment
// can no longer pass every gate green (the defect verified by hand during the
// #1381 review).
//
// WHAT IS SCANNED (mirrors the sibling guard):
//   - every *.yml/*.yaml under .github/workflows/ and .github/actions/
//     (recursive), plus every action.yml/action.yaml reachable through
//     `uses: ./<path>` values, recursively, cycle-safe.
//
// THE ONLY LEGITIMATE NON-PINNED FORMS (allowlisted here, nothing else):
//   - `./<path>` local composite-action references (scanned recursively, and
//     a dangling reference is still an ERROR — fail closed, #1268 precedent),
//   - `docker://` container references (digest-pin policy lives in the
//     sibling guard; this one simply has no tag comment to bind).
//
// FAIL-LOUD RULES (no compliant default — unparseable input is an ERROR):
//   - a `uses:` line that is not a 40-hex pin,
//   - a 40-hex pin without a `# v…` version comment,
//   - a comment whose first token does not parse as `v<major>[.minor[.patch]]`,
//   - a referenced tag that does not exist upstream,
//   - ANY resolver/API error (the guard FAILS, never passes silently).
//
// TAG RESOLUTION: `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` peels
// annotated tags (object.type === 'tag' → follow .object.sha through
// /git/tags/<id> until a commit object) to the commit GitHub actually checks
// out. pnpm/action-setup@v6.0.10 is an annotated tag in this repository, so
// the peel is load-bearing, not theoretical.
//
// Paired proof: change one workflow SHA in a scratch commit → this guard
// fails naming file:line with expected vs actual; revert → green. Changing
// ONLY the comment version must equally fail (the comment is half of the
// binding being enforced).

const workflowsDir = '.github/workflows';
const actionsDir = '.github/actions';

const shaPattern = /^[0-9a-f]{40}$/;
// First whitespace-delimited token of the version comment. Accepts the two
// forms this repository actually uses (`# v7` major-only and `# v6.0.10`
// full semver); anything else fails loud rather than guessing.
const versionTokenPattern = /^v\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/;

/** Maximum annotated-tag peel hops before failing loud (cycle protection). */
const maxPeelDepth = 10;

export type GitObject = { type: string; sha: string };

/**
 * One GitHub git-objects API round-trip. `what` distinguishes the two
 * endpoints the guard needs: the ref lookup (`/git/ref/tags/<name>`) and the
 * annotated-tag-object lookup (`/git/tags/<id>`) used while peeling.
 */
export type TagLookup = (args: {
	repo: string;
	what: { kind: 'tag-ref'; name: string } | { kind: 'tag-object'; id: string };
}) => Promise<GitObject | null>;

/**
 * Resolves one `repo` + `tag` pair to the commit SHA the tag names, or null
 * when the tag does not exist. Throwing signals an infrastructure failure
 * (API down, rate limited, auth broken) — callers must propagate it, never
 * swallow it into a green result.
 */
export type CommitResolver = (args: {
	repo: string;
	tag: string;
}) => Promise<string | null>;

/**
 * Judgment of one physical line carrying a `uses:` value:
 *   - pinned:   40-hex SHA + parseable version comment (the comparable case)
 *   - local:    `./<path>` reference (allowlisted; resolved and recursed)
 *   - docker:   `docker://` reference (allowlisted; no comment to bind)
 *   - malformed: undecidable input — becomes an ERROR finding, never a pass
 * null: the line carries no `uses:` judgment at all (non-uses / commented out).
 */
export type ParsedUseLine =
	| { kind: 'pinned'; repo: string; sha: string; tag: string }
	| { kind: 'local' }
	| { kind: 'docker' }
	| { kind: 'malformed'; reason: string };

export type PinFinding =
	| {
			kind: 'mismatch';
			file: string;
			line: number;
			uses: string;
			tag: string;
			expected: string;
			actual: string;
			message: string;
	  }
	| {
			kind: 'unparseable';
			file: string;
			line: number;
			uses: string;
			message: string;
	  };

type PinnedEntry = {
	file: string;
	line: number;
	uses: string;
	repo: string;
	sha: string;
	tag: string;
};

type LocalResolution =
	| { ok: true; file: string }
	| { ok: false; reason: string };

/**
 * Judges one physical line. Comment handling mirrors the sibling guard: the
 * `uses:` VALUE is captured from the comment-stripped code (so commented-out
 * lines and trailing-comment hex can never enter the capture), while the
 * VERSION COMMENT is read from the raw line — it is the very thing this
 * guard binds the SHA to.
 */
export const parsePinnedUseLine = (line: string): ParsedUseLine | null => {
	const code = line.replace(/#.*/, '');
	const match = code.match(/uses:\s*(\S+)/);

	if (!match) {
		return null;
	}

	const uses = match[1];

	// Allowlisted form 1: local composite actions. Resolved and scanned
	// recursively by the caller; a dangling reference still fails closed.
	if (uses.startsWith('./') || uses.startsWith('../')) {
		return { kind: 'local' };
	}

	// Allowlisted form 2: container references. Digest immutability is the
	// sibling guard's policy; there is no `# vX.Y.Z` comment to bind here.
	if (uses.startsWith('docker://')) {
		return { kind: 'docker' };
	}

	const atIdx = uses.lastIndexOf('@');

	if (atIdx === -1) {
		return {
			kind: 'malformed',
			reason: `no @ref on the uses: value — cannot decide anything, refusing to pass silently (${uses})`,
		};
	}

	const repo = uses.slice(0, atIdx);
	// A sub-path pin (`owner/repo/path@<sha>`) resolves its TAG on the
	// owner/repo repository — only the first two segments name the repo.
	const repoSegments = repo.split('/');
	const repoSlug =
		repoSegments.length > 2 ? repoSegments.slice(0, 2).join('/') : repo;
	const ref = uses.slice(atIdx + 1);

	if (!shaPattern.test(ref)) {
		return {
			kind: 'malformed',
			reason: `ref is not a full 40-hex commit SHA (got "${ref}") — mutable or abbreviated refs are unpinnable input`,
		};
	}

	// Version comment: the first token after the first '#'.
	const hashIdx = line.indexOf('#');

	if (hashIdx === -1) {
		return {
			kind: 'malformed',
			reason: `pin has no version comment — append "# v<major>[.minor[.patch]]" naming the tag this SHA resolves to (${uses})`,
		};
	}

	const comment = line.slice(hashIdx + 1).trim();
	const versionToken = comment.split(/\s+/)[0] ?? '';

	if (versionToken === '') {
		return {
			kind: 'malformed',
			reason: `pin has no version comment — append "# v<major>[.minor[.patch]]" naming the tag this SHA resolves to (${uses})`,
		};
	}

	if (!versionTokenPattern.test(versionToken)) {
		return {
			kind: 'malformed',
			reason: `version comment "${versionToken}" does not parse as v<major>[.minor[.patch]] — the SHA↔tag binding is undecidable (${uses})`,
		};
	}

	return { kind: 'pinned', repo: repoSlug, sha: ref, tag: versionToken };
};

/**
 * Resolves `repo` + `tag` through `lookup`, peeling annotated tags until a
 * commit object is reached. Null (404) means the tag does not exist — the
 * caller turns that into a loud finding, never a silent pass. A peel chain
 * that exceeds maxPeelDepth hops (or hits an unexpected object type) THROWS:
 * undecidable input fails loud.
 */
export const resolveTagCommit = async ({
	repo,
	tag,
	lookup,
}: {
	repo: string;
	tag: string;
	lookup: TagLookup;
}): Promise<GitObject | null> => {
	let current = await lookup({ repo, what: { kind: 'tag-ref', name: tag } });

	if (current === null) {
		return null;
	}

	for (let depth = 0; current.type !== 'commit'; depth += 1) {
		if (depth >= maxPeelDepth) {
			throw new Error(
				`actions-pins guard: annotated-tag peel for ${repo}@${tag} did not reach a commit after ${String(maxPeelDepth)} hops — refusing to guess`,
			);
		}

		if (current.type !== 'tag') {
			throw new Error(
				`actions-pins guard: unexpected git object type "${current.type}" while resolving ${repo}@${tag}`,
			);
		}

		const tagObjectId = current.sha;
		current = await lookup({
			repo,
			what: { kind: 'tag-object', id: tagObjectId },
		});

		if (current === null) {
			throw new Error(
				`actions-pins guard: annotated tag object ${tagObjectId} for ${repo}@${tag} vanished mid-peel`,
			);
		}
	}

	return current;
};

/**
 * Parses one `gh api` response body (via --jq) into a GitObject, failing loud
 * on anything other than the exact documented shape.
 */
const parseGitObject = (stdout: string, apiPath: string): GitObject => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(stdout) as unknown;
	} catch (error) {
		throw new Error(
			`actions-pins guard: gh api ${apiPath} returned unparseable output`,
			{ cause: error },
		);
	}

	const record = typeof parsed === 'object' && parsed !== null ? parsed : {};
	const type = (record as Record<string, unknown>).type;
	const sha = (record as Record<string, unknown>).sha;

	if (typeof type !== 'string' || typeof sha !== 'string') {
		throw new Error(
			`actions-pins guard: gh api ${apiPath} returned an unexpected shape: ${stdout.trim()}`,
		);
	}

	return { type, sha };
};

const ghApiPath = ({ repo, what }: Parameters<TagLookup>[0]): string =>
	what.kind === 'tag-ref'
		? `repos/${repo}/git/ref/tags/${what.name}`
		: `repos/${repo}/git/tags/${what.id}`;

/**
 * The real TagLookup: shells out to `gh api` (auth from the runner's
 * GH_TOKEN/GH_ENV — the token itself is never read, logged, or echoed here).
 * HTTP 404 resolves to null (a genuinely missing tag); EVERY other failure —
 * including unauthenticated runs, rate limits, and network errors — throws,
 * because a skipped verification must never masquerade as a green one.
 *
 * Per-run memoization: each (endpoint) result is fetched at most once per
 * process, keeping a full scan around the free-tier API budget (~16 distinct
 * lookups today).
 */
const ghTagLookup: TagLookup = async (args) => {
	const apiPath = ghApiPath(args);

	try {
		const { stdout } = await execFileAsync(
			'gh',
			['api', '--jq', '{type: .object.type, sha: .object.sha}', apiPath],
			{ encoding: 'utf8', timeout: 60_000 },
		);

		return parseGitObject(stdout, apiPath);
	} catch (error) {
		const maybeStderr =
			typeof error === 'object' && error !== null && 'stderr' in error
				? (error as { stderr?: unknown }).stderr
				: undefined;
		const stderr = typeof maybeStderr === 'string' ? maybeStderr : '';

		if (/HTTP 404/.test(stderr)) {
			return null;
		}

		throw new Error(
			`actions-pins guard: gh api ${apiPath} failed — the guard cannot certify pins without tag data, so this fails instead of passing silently`,
			{ cause: error },
		);
	}
};

/**
 * What the scan actually examined, so the CLI can refuse to certify an empty
 * one (a guard that judges nothing would print green over zero evidence).
 */
export type ScanStats = { filesScanned: number; pinnedLines: number };

/**
 * Fails loud unless the scan certified real work: at least one file judged
 * AND at least one pinned `uses:` line compared. Zero pinned lines is not a
 * legitimate outcome for this repository (every workflow carries SHA pins);
 * seeing it means the parser stopped matching or the wrong tree was scanned,
 * so an empty certification must never masquerade as green.
 */
export const assertCertifiedScan = ({
	filesScanned,
	pinnedLines,
}: ScanStats): void => {
	if (filesScanned === 0) {
		throw new Error(
			'actions-pins guard: scanned zero files — the scan certifies nothing, so this fails instead of passing silently. Run the guard from the repository root.',
		);
	}

	if (pinnedLines === 0) {
		throw new Error(
			`actions-pins guard: judged zero pinned uses: lines across ${String(filesScanned)} file(s) — every reference being allowlisted (local/docker) is not a shape this repository ever has, so an empty scan fails instead of certifying nothing`,
		);
	}
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
 * (repo-relative POSIX), sorted deterministically.
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
 * Resolves one `./<path>` local action reference to its action.yml|yaml
 * manifest (repo-relative POSIX). Fails closed on escapes and dangling
 * references — same contract as the sibling guard minus the symlink
 * containment hardening, which lives where files outside .github are READ
 * for pin judgment; this guard reads the same set of files the sibling
 * already certified.
 */
const resolveLocalActionTarget = async (
	usesValue: string,
	rootDir: string,
): Promise<LocalResolution> => {
	const abs = path.resolve(rootDir, usesValue);
	const rel = path.relative(path.resolve(rootDir), abs);

	if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
		return {
			ok: false,
			reason: `local action reference ${usesValue} resolves outside the repository root`,
		};
	}

	const relBase = rel.split(path.sep).join('/');

	for (const manifest of ['action.yml', 'action.yaml']) {
		const candidate = `${relBase}/${manifest}`;

		try {
			await access(path.join(rootDir, candidate));

			return { ok: true, file: candidate };
		} catch {
			// try the next candidate name
		}
	}

	return {
		ok: false,
		reason: `target action file not found: ${relBase}/action.yml|yaml`,
	};
};

/**
 * Scans every *.yml/*.yaml under .github/workflows and .github/actions,
 * follows `uses: ./<path>` local references recursively (visited-set, cycle
 * safe), binds every 40-hex pin to its version comment through `resolver`,
 * and returns one finding per violation. Resolver throws propagate: an API
 * error FAILS the guard, never passes it silently. With no resolver passed,
 * the real `gh api` resolver runs with a per-run cache.
 */
export const findPinMismatches = async ({
	rootDir = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../..',
	),
	resolveTag,
	scanStats,
}: {
	rootDir?: string;
	resolveTag?: CommitResolver;
	/** Test-only observation hook: receives the per-file scan counts. */
	scanStats?: (stats: { filesScanned: number; pinnedLines: number }) => void;
} = {}): Promise<PinFinding[]> => {
	// Per-run cache: one resolution per distinct repo+tag pair, however many
	// steps pin the same action version across the whole scan.
	const cache = new Map<string, string | null>();
	const baseResolver: CommitResolver =
		resolveTag ??
		(async ({ repo, tag }) =>
			(
				await resolveTagCommit({
					repo,
					tag,
					lookup: ghTagLookup,
				})
			)?.sha ?? null);

	const cachedResolve: CommitResolver = async ({ repo, tag }) => {
		const key = `${repo}@${tag}`;
		let resolved = cache.get(key);

		if (resolved === undefined) {
			resolved = await baseResolver({ repo, tag });
			cache.set(key, resolved);
		}

		return resolved;
	};

	const findings: PinFinding[] = [];
	const pinnedEntries: PinnedEntry[] = [];
	const visited = new Set<string>();
	let filesScanned = 0;
	let pinnedLineCount = 0;

	// Mandatory half (see the sibling guard): no workflows dir certifies nothing.
	let workflowFiles: string[];
	try {
		workflowFiles = await listYamlFiles(
			path.join(rootDir, workflowsDir),
			rootDir,
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
			throw new Error(
				`actions-pins guard: ${workflowsDir}/ does not exist under '${rootDir}'. Run the guard from the repository root.`,
				{ cause: error },
			);
		}

		throw error;
	}

	// Tolerated half: zero composite actions is legitimate.
	let actionFiles: string[] = [];
	try {
		actionFiles = await listYamlFiles(path.join(rootDir, actionsDir), rootDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			throw error;
		}
	}

	for (const file of [...workflowFiles, ...actionFiles]) {
		visited.add(file);
	}

	const scanFile = async (file: string): Promise<void> => {
		filesScanned += 1;
		const content = await readFile(path.join(rootDir, file), 'utf8');
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const parsed = parsePinnedUseLine(lines[i]);

			if (parsed === null) {
				continue;
			}

			if (parsed.kind === 'local') {
				const uses =
					lines[i].replace(/#.*/, '').match(/uses:\s*(\S+)/)?.[1] ?? './';
				const target = await resolveLocalActionTarget(uses, rootDir);

				if (!target.ok) {
					findings.push({
						kind: 'unparseable',
						file,
						line: i + 1,
						uses,
						message: target.reason,
					});
					continue;
				}

				if (!visited.has(target.file)) {
					visited.add(target.file);
					await scanFile(target.file);
				}

				continue;
			}

			if (parsed.kind === 'docker') {
				continue;
			}

			if (parsed.kind === 'malformed') {
				findings.push({
					kind: 'unparseable',
					file,
					line: i + 1,
					uses:
						lines[i].replace(/#.*/, '').match(/uses:\s*(\S+)/)?.[1] ??
						'(unreadable)',
					message: parsed.reason,
				});
				continue;
			}

			pinnedLineCount += 1;
			pinnedEntries.push({
				file,
				line: i + 1,
				uses: `${parsed.repo}@${parsed.sha}`,
				repo: parsed.repo,
				sha: parsed.sha,
				tag: parsed.tag,
			});
		}
	};

	for (const file of workflowFiles) {
		await scanFile(file);
	}

	for (const file of actionFiles) {
		await scanFile(file);
	}

	scanStats?.({ filesScanned, pinnedLines: pinnedLineCount });

	// Resolution happens after the scan so the report order is deterministic
	// (scan order) even though resolutions hit the shared cache.
	for (const entry of pinnedEntries) {
		const resolved = await cachedResolve({ repo: entry.repo, tag: entry.tag });

		if (resolved === entry.sha) {
			continue;
		}

		if (resolved === null) {
			findings.push({
				kind: 'mismatch',
				file: entry.file,
				line: entry.line,
				uses: entry.uses,
				tag: entry.tag,
				expected: '(missing)',
				actual: entry.sha,
				message: `tag ${entry.tag} does not exist on ${entry.repo} — the comment binds this pin to nothing`,
			});
			continue;
		}

		findings.push({
			kind: 'mismatch',
			file: entry.file,
			line: entry.line,
			uses: entry.uses,
			tag: entry.tag,
			expected: resolved,
			actual: entry.sha,
			message: `comment claims ${entry.tag} but the pinned SHA does not match it: ${entry.tag} resolves to ${resolved}, pinned is ${entry.sha}`,
		});
	}

	return findings;
};

// --- CLI entry point ---
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	// Network-dependent guard: the LOCAL just recipe may skip it explicitly
	// (--offline, e.g. air-gapped work). CI never passes --offline.
	if (process.argv.includes('--offline')) {
		console.log(
			'Actions pin/comment binding guard SKIPPED (--offline): no tag resolution was performed.',
		);
		process.exit(0);
	}

	let stats: ScanStats = { filesScanned: 0, pinnedLines: 0 };
	const findings = await findPinMismatches({
		scanStats: (measured) => {
			stats = measured;
		},
	});

	// Anti-rot: a green result over zero judged files or zero compared pins
	// certifies nothing, so it exits red instead (same rule that keeps the
	// sibling guard honest).
	assertCertifiedScan(stats);

	if (findings.length > 0) {
		console.error(
			`::error::${String(findings.length)} action pin(s) are not bound to their "# vX.Y.Z" version comment:`,
		);

		for (const f of findings) {
			console.error(
				f.kind === 'mismatch'
					? `  ${f.file}:${String(f.line)}: ${f.uses} — ${f.message} (expected: ${f.expected}; actual: ${f.actual})`
					: `  ${f.file}:${String(f.line)}: ${f.uses} — ${f.message}`,
			);
		}

		process.exit(1);
	}

	console.log(
		'Every pinned action SHA in .github/workflows and .github/actions resolves to the version its comment claims.',
	);
}
