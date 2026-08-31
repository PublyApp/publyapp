#!/usr/bin/env node
/*
 * run-preuves.mts — executes kept-red proof tests declared by the current pull
 * request under apps/front/tests/proofs/.
 *
 * Each proof test in this repo is EXPECTED TO FAIL. It proves a bug is present
 * by asserting the ideal behavior against the corrected code — the corrected
 * code does NOT satisfy the ideal, so the test fails, and that failure IS the
 * proof.
 *
 * ## Classification — structural signals, not display text (issue #1784)
 *
 * The runner classifies a proof's failure mode using the STRUCTURAL report
 * from vitest's `--reporter=json` output, never by regex on the human-readable
 * stdout/stderr stream. This matters because the question we must answer is
 * binary and precise: did this proof fail on an ASSERTION, or did it fail on
 * a THROWN ERROR? Both produce "Tests 1 failed" and exit code 1, but they
 * mean different things:
 *
 * - Assertion failure → the proof measured and the ideal is not met
 *   (kept-red, the expected state) → success.
 * - Thrown Error (MESURE IMPOSSIBLE, harness crash, extraction failure) →
 *   the proof could NOT measure. This is NOT the expected kept-red state —
 *   it is a broken measurement, and it must FAIL THE STEP LOUD rather than
 *   be reported as "failed as expected".
 *
 * A text regex like `/AssertionError/.test(output)` is fragile: any thrown
 * Error whose message happens to contain the words "AssertionError" (e.g. a
 * harness error wrapping one) is misclassified as a kept-red success, and
 * the regression is SILENT — a undesired green, the worst failure class.
 *
 * The JSON report gives us, per test, its `status` ("passed" / "failed") and
 * the failure type as the first token of `failureMessages[0]`:
 * "AssertionError: ..." for assertion failures, "Error: ..." for thrown
 * errors. We classify on that structural signal.
 *
 * ### Unreadable reports — fail loud, name the cause
 *
 * A report the script cannot parse (missing file, empty, invalid JSON, wrong
 * shape) MUST fail loud naming the cause — never fall back to text heuristics
 * nor to a compliant default. This is the dominant defect class of this
 * repo: substituting a defect of correct appearance for an unreadable input.
 * `readProofReport()` enforces this with one error per failure case.
 *
 * ### Per-test expectation manifests are REQUIRED (issue #1806, ronde 11)
 *
 * Every declared paired red proof MUST carry a per-test expectation manifest
 * named `<proof-file>.expected-red.json` (see the reference shape next to
 * tests/proofs/1457/). The manifest declares which test(s) are expected to
 * stay red, so a declared kept-red test that goes green is reported as a
 * STALE PROOF. When a declared proof has NO manifest, the runner FAILS LOUD
 * naming the missing file and the expected action — it NEVER falls back to
 * the global classifier, which by construction cannot see a declared-red
 * test turn green. A missing manifest is an unanalysable input, and an
 * unanalysable input is a loud failure, never a silenced fallback.
 *
 * ## Option (b) — declaration-scoped replay (issue #1659, ronde 6)
 *
 * A pull request DECLARES a paired red proof by adding or modifying a proof
 * test file under apps/front/tests/proofs/<issue>/. That directory is versionné
 * (committed to the repo), so CI can always see the files — unlike .dump/,
 * which is git-ignored and absent on a clean CI checkout.
 *
 * The script answers two questions:
 *
 * 1. Has THIS PR declared any proofs?
 *    Uses `git diff --name-only <base> HEAD` to find files under tests/proofs/
 *    that were added or modified by this PR. If none, the step is an explicit
 *    no-op: it prints a clear "no proofs declared" message and exits 0. This
 *    is NOT a silent green — it states exactly what was checked and why the
 *    step did not run. PRs that do not claim a paired red proof are simply out
 *    of scope, and the step says so.
 *
 * 2. Was a declared proof actually replayed?
 *    If a PR declares proofs, this script replays them with inverted semantics:
 *    - If a proof test FAILS  → success (bug still present, proof intact).
 *    - If a proof test PASSES → FAILURE (bug changed form or fixed; rebuild).
 *    - If a proof file is corrupt → FAILURE (naming the file).
 *
 * ## Design — inverting the burden of proof (r6)
 *
 * Previous versions discovered "all proof files" with a regex filter and then
 * intersected with the PR's diff. The filter was a mutable point of failure:
 * changing `/\.test\.tsx?$/` to `/\.test\.ts$/` silently excluded .tsx proofs
 * and turned the guard into a no-op while every proof stayed red.
 *
 * This version inverts the burden:
 *
 * - The PR's `git diff` is the source of truth for what was declared. No regex
 *   is applied to the result. Every file added/modified under tests/proofs/ is
 *   a declared proof.
 * - Each declared file is then validated: does it exist? does it have a
 *   replayable extension? is its content parseable? A declared file the guard
 *   cannot replay FAILS the step naming the file — it is never silently
 *   ignored.
 * - A git diff failure FAILS the step. An unresolvable base can never become a
 *   compliant default; an input the guard cannot parse must be loud.
 *
 * This removes the guard's single mutable point of failure. No change to the
 * guard's own code can flip it from "bites" to "silent green" without also
 * breaking the `git diff` contract or the extension check — both of which are
 * externally observable.
 *
 * The developer replay path is `just test-preuves` (lane worktree where .dump/
 * also exists for traces). CI runs the same command on a clean checkout.
 *
 * ## Why not (a) or (c)?
 * See .dump/DONE-1687-r5.md for the full rationale.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	classifyProofWithManifest,
	readExpectedRedManifest,
	readProofReport,
	type ProofReport,
} from './classify-proof.mts';
import { consumeVerdict, gateShouldFail } from './consume-verdict.mts';

const ROOT = join(process.cwd(), '..'); // apps/front → repo root
const PROOFS_DIR = join(process.cwd(), 'tests', 'proofs');
const CONFIG = 'vitest.preuves.config.ts';

/**
 * The shape of a single entry returned by `git diff --name-status`. The
 * status column is the load-bearing field for #1940: a wholly deleted
 * `tests/proofs/<issue>/` directory shows up here as one `D` entry per
 * file, and the runner must refuse the deletion — `existsSync` cannot
 * distinguish "the file was never there" from "the file was there and
 * has now been deleted", so the runner inspects the status column
 * explicitly.
 *
 * Renames (`R`) carry two paths: the old path and the new path. We model
 * them as a single entry whose `path` is the NEW path (the one the
 * runner would replay) and `oldPath` records where it came from so the
 * error message can name both. Renames are a CI red by default: the
 * proof's manifest sits next to the OLD path and the runner cannot
 * verify the NEW path without an explicit rename.
 */
export interface DiffEntry {
	/** The status reported by `git diff --name-status`: A/M/D/R/C/T. */
	status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T';
	/** The path the runner would replay (new path for renames). */
	path: string;
	/** For renames only: the path the entry was renamed from. */
	oldPath?: string;
}

/**
 * Parse the NUL-delimited output of `git diff --name-status -z`. The
 * `-z` flag changes the format substantially: rather than
 * `<status>\t<path>\n` per line, the output is `<status>\0<path>\0`,
 * with renames as `<status>\0<old>\0<new>\0` (three NUL-separated
 * tokens). A trailing NUL is allowed. Anything else (an empty
 * buffer, a status character outside the documented set, a rename
 * without both paths) is rejected loud — an unparseable diff is an
 * unanalysable input and must not fall back to a compliant default.
 *
 * The `-z` shape was chosen for ONE reason: filenames containing
 * newlines or tabs (legal on Linux) would otherwise make the line-
 * oriented parser silently drop them. The NUL delimiter is the only
 * one git offers that cannot appear inside a path.
 */
export const parseDiffNameStatus = (raw: string): DiffEntry[] => {
	if (raw.length === 0) {
		return [];
	}
	const tokens = raw.split('\0');
	const entries: DiffEntry[] = [];
	let i = 0;
	while (i < tokens.length) {
		const statusToken = tokens[i];
		if (statusToken === undefined || statusToken.length === 0) {
			// Trailing NUL or empty token — the parser consumed everything
			// the buffer declared. Stop here.
			break;
		}
		const statusChar = statusToken[0];
		if (statusChar === 'R' || statusChar === 'C') {
			// Renames and copies carry an optional similarity score in the
			// first token (e.g. "R100") and the OLD path in the next token.
			const oldPath = tokens[i + 1];
			const newPath = tokens[i + 2];
			if (
				oldPath === undefined ||
				newPath === undefined ||
				oldPath.length === 0
			) {
				throw new Error(
					`parseDiffNameStatus: rename/copy entry is missing the old or new path (got status "${statusToken}", old="${String(oldPath)}", new="${String(newPath)}"). An unparseable diff is an unanalysable input — refusing to silently drop the entry.`,
				);
			}
			entries.push({ status: statusChar, path: newPath, oldPath });
			i += 3;
			continue;
		}
		const path = tokens[i + 1];
		if (path === undefined) {
			throw new Error(
				`parseDiffNameStatus: entry is missing its path (got status "${statusToken}"). An unparseable diff is an unanalysable input — refusing to silently drop the entry.`,
			);
		}
		if (
			statusChar !== 'A' &&
			statusChar !== 'M' &&
			statusChar !== 'D' &&
			statusChar !== 'T'
		) {
			throw new Error(
				`parseDiffNameStatus: unknown status character "${String(statusChar)}" (full token "${statusToken}"). An unparseable diff is an unanalysable input — refusing to silently drop the entry.`,
			);
		}
		entries.push({ status: statusChar, path });
		i += 2;
	}
	return entries;
};

/**
 * Extensions that vitest.preuves.config.ts can replay. The config's include
 * pattern matches only .test.ts and .test.tsx files under tests/proofs/ — any
 * file with a different extension is declared by the PR but cannot be
 * replayed by the runner, which means the guard cannot verify it. Such a
 * file must fail the step loud.
 */
const REPLAYABLE_EXTENSIONS = ['.test.ts', '.test.tsx'] as const;

/**
 * Determine which proof files were declared by the current PR.
 *
 * The PR's `git diff` is the single source of truth — no regex filter is
 * applied afterward. Every file added or modified under tests/proofs/ is a
 * declared proof, regardless of its extension. The caller is responsible for
 * validating that each declared file is replayable.
 *
 * In CI, GITHUB_BASE_REF and GITHUB_HEAD_REF are available. We use a
 * three-dot diff (`git diff <mergeBase>...HEAD`) to list every file that
 * differs between the merge base and the PR's HEAD. The three-dot form
 * shows ONLY changes introduced by the PR branch — not base-branch changes
 * made since the fork — so a behind-HEAD branch does not fail with spurious
 * "declared proof" noise. Computing the merge base first also validates that
 * the base and HEAD actually share history; a diverged branch (no merge base)
 * fails loud naming the cause, never silently becoming "no proofs declared".
 *
 * GitHub's checkout action fetches only the PR's own ref by default — the
 * base branch's remote ref (refs/remotes/origin/<base>) is NOT available
 * until we fetch it. We fetch it explicitly before the merge-base check so
 * the guard works on a clean CI checkout. The fetch is scoped to the single
 * base ref and is fast (a few hundred KB at most).
 *
 * The workflow that runs this script (front-ci.yml) uses `fetch-depth: 0`
 * so the checkout is never shallow. But this script is also run locally and
 * from other contexts — if the repository is ALREADY shallow at entry
 * (graft left by another workflow, a developer's shallow clone, etc.), the
 * fetch below only fetches the base ref's history, not HEAD's. A shallow
 * HEAD means `merge-base` returns empty and the diff silently becomes blank
 * — concluding "no proofs declared" and exiting 0, a green light that
 * verified nothing. Detect a shallow graft up front and repair it with
 * `git fetch --unshallow` (never `--deepen=N`, which re-creates a bound
 * instead of removing it — precedent: #1773).
 *
 * Locally (no env vars), we use two-dot diff (HEAD~1..HEAD) to show what the
 * most recent commit introduced.
 *
 * @returns The list of proof-test paths (relative to apps/front) that were
 *          added or modified in the diff.
 * @throws If `git diff` or `git merge-base` fails. An unresolvable base can
 *         never silently become "no proofs declared"; the operator must fetch
 *         the base or fix the checkout.
 */
const declaredProofTests = (): DiffEntry[] => {
	// Note: do NOT short-circuit on `!existsSync(PROOFS_DIR)` here.
	// A wholly-deleted `tests/proofs/<issue>/` directory will not
	// exist on the working tree, but the diff still lists every
	// deleted file under it. Returning [] in that case is exactly
	// the silent false-green #1940 fixes. The "no proofs at all"
	// verdict must come from inspecting git history, not the
	// working tree.

	// If the repository is shallow at entry (graft left by a previous
	// --depth=1 fetch in a shared worktree, a developer's shallow clone,
	// etc.), the fetch below only fetches the base ref's history — HEAD
	// stays shallow. Under a shallow graft, `git merge-base` returns empty
	// and the diff silently becomes blank, concluding "no proofs declared"
	// and exiting 0: a green light that verified nothing. Detect and repair
	// up front with `git fetch --unshallow` (never `--deepen=N`, which
	// re-creates a bound instead of removing it — precedent: #1773).
	//
	// The two commands are wrapped in SEPARATE try/catch blocks so the
	// catch can name the right command: if `git rev-parse` fails, the
	// message accuses rev-parse; if `git fetch --unshallow` fails (the
	// most probable case — network down, remote unreachable), the
	// message accuses fetch. A single try/catch with the catch always
	// naming rev-parse would send the operator to look for a local repo
	// problem when the failure is remote access — worse than a vague
	// message (precedent: #1802).
	let isShallow: string;
	try {
		isShallow = execSync(`git -C "${ROOT}" rev-parse --is-shallow-repository`, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
	} catch (err) {
		// If we cannot even determine shallow status, fail loud — an input
		// we cannot parse is not replaced by a compliant default.
		throw new Error(
			`git rev-parse --is-shallow-repository failed — cannot determine ` +
				`whether the repository is shallow. Detail: ${(err as Error).message}`,
		);
	}

	if (isShallow === 'true') {
		try {
			console.error(
				`Repository is shallow at entry (.git/shallow exists) — ` +
					`repairing with "git fetch --unshallow" before continuing. ` +
					`A shallow graft would make merge-base return empty and the ` +
					`diff go blank, silently concluding "no proofs declared".`,
			);
			execSync(`git -C "${ROOT}" fetch --unshallow`, {
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
		} catch (err) {
			throw new Error(
				`git fetch --unshallow failed — could not repair the shallow ` +
					`repository. Detail: ${(err as Error).message}`,
			);
		}
	}

	// A half-set CI environment (exactly one of GITHUB_BASE_REF /
	// GITHUB_HEAD_REF defined) is a BROKEN environment, not a local run.
	// The old code silently fell through to the local HEAD~1..HEAD diff in
	// that case, printed "This PR did not declare any paired red proofs"
	// and exited 0 while CI believed the declaration check had run: a false
	// green that verified nothing (precedent: #1806 ronde 9). Fail loud
	// naming the missing variable — the operator must fix the workflow
	// rather than inherit a diff scope the PR author never intended.
	const baseRefEnv = process.env.GITHUB_BASE_REF;
	const headRefEnv = process.env.GITHUB_HEAD_REF;
	if (Boolean(baseRefEnv) !== Boolean(headRefEnv)) {
		throw new Error(
			`incomplete CI environment: GITHUB_BASE_REF and GITHUB_HEAD_REF must ` +
				`be set together, but ${baseRefEnv ? 'GITHUB_HEAD_REF' : 'GITHUB_BASE_REF'} is ` +
				`missing. A half-set environment cannot determine the PR diff scope ` +
				`and must not fall back to a local diff silently. Fix the workflow ` +
				`to export both variables, or unset both for a local run.`,
		);
	}

	// Get the list of files changed by this PR, with their status. The
	// status column (A/M/D/R/C/T) is what makes #1940 actionable: a wholly
	// deleted `tests/proofs/<issue>/` directory shows up here as one `D`
	// entry per file, and the runner must refuse the deletion (no path
	// on disk → no validation possible → must fail loud, never silently
	// count as "no proofs declared").
	let changedEntries: DiffEntry[];
	try {
		if (process.env.GITHUB_BASE_REF && process.env.GITHUB_HEAD_REF) {
			const baseRef = `refs/remotes/origin/${process.env.GITHUB_BASE_REF}`;

			// GitHub's checkout action fetches only the PR's own ref. The
			// base branch's remote ref does not exist until we fetch it.
			// Fetch it explicitly so the diff works on a clean CI
			// checkout. Scoped to the single base ref — fast, a few
			// hundred KB at most.
			//
			// CRITICAL: do NOT use --depth=1 (shallow fetch). A shallow
			// fetch writes .git/shallow, which is shared by all worktrees
			// in this repository and persists after this script finishes.
			// Under a shallow graft, `git merge-base` returns empty and
			// the diff below silently becomes blank — concluding "no
			// proofs declared" and exiting 0, a green light that
			// verified nothing. Fetch the full history of the single base
			// ref instead. A non-shallow fetch scoped to one ref is still
			// fast (a few hundred KB at most for typical branches).
			execSync(
				`git -C "${ROOT}" fetch --no-tags origin +refs/heads/${process.env.GITHUB_BASE_REF}:${baseRef}`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);

			// Verify the base and HEAD actually share a history. Under a
			// shallow graft (e.g., one left by a previous --depth=1 fetch
			// in a shared worktree), merge-base returns empty and the
			// diff below would silently become blank — concluding "no
			// proofs declared" and exiting 0, a green light that
			// verified nothing. An unresolvable base must FAIL LOUD naming
			// the cause; it can never silently become a compliant "no
			// proofs".
			let mergeBase: string;
			try {
				mergeBase = execSync(`git -C "${ROOT}" merge-base "${baseRef}" HEAD`, {
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe'],
				}).trim();
			} catch {
				throw new Error(
					`git merge-base failed — no common ancestor between ` +
						`origin/${process.env.GITHUB_BASE_REF} and HEAD. This is ` +
						`commonly caused by a shallow graft (.git/shallow) left by a ` +
						`previous --depth=1 fetch in a shared worktree. Remove the ` +
						`graft ("git fetch --unshallow" or delete .git/shallow) and ` +
						`retry.`,
				);
			}

			if (!mergeBase) {
				throw new Error(
					`git merge-base returned empty — no common ancestor between ` +
						`origin/${process.env.GITHUB_BASE_REF} and HEAD. This is ` +
						`commonly caused by a shallow graft (.git/shallow) left by a ` +
						`previous --depth=1 fetch in a shared worktree. Remove the ` +
						`graft ("git fetch --unshallow" or delete .git/shallow) and ` +
						`retry.`,
				);
			}

			// The diff must be computed against the FORK POINT (the mergeBase
			// commit SHA validated above), never against the moving base REF.
			// `git diff <baseRef>..HEAD` is a TREE diff of the CURRENT base ref
			// against HEAD, so a proof file merged to develop AFTER this branch
			// forked shows up as a DELETED entry and gets declared as "this PR's
			// proof" — replay then fails on ENOENT (measured in r4 validation: an
			// advanced origin/develop mis-declared 4 foreign proof files and
			// reddened the step; measured again on #1930 and #1873, which were red
			// on a proof neither branch had ever touched).
			//
			// The three-dot form below (`<mergeBase>...HEAD`) lists ONLY what this
			// branch introduced. With mergeBase on the left the two forms are
			// equivalent — three-dot re-derives the same merge base — but the
			// three-dot spelling states the intent, and it is the form the #1865
			// test names and pins. A diverged branch (no merge base) fails loud
			// above; it can never silently become "no proofs declared".
			// Get the list of files changed by this PR with their status.
			// `git diff --name-status` is used (not `--name-only`) so the
			// runner can see DELETIONS — issue #1940: a wholly deleted
			// `tests/proofs/<issue>/` directory listed as deleted entries
			// was previously dropped on the floor by the name-only filter
			// and the existsSync path, leaving the deletion undeclared and
			// unverified. The status column is read on every line; renamed
			// paths are reported as `R<score>\t<old>\t<new>` and are
			// rejected loud too (a renamed proof needs a manifest rename,
			// and the runner cannot verify the new path without one).
			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-status --diff-filter=ACDMRT -z "${mergeBase}...HEAD"`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedEntries = parseDiffNameStatus(diffOutput);
		} else {
			// Local development: neither variable is defined. Announce this
			// loudly so a local run is never mistaken for the CI declaration
			// check, and so the "no proofs declared" conclusion below cannot
			// be read as a CI verdict (precedent: #1806 ronde 11).
			console.error(
				`LOCAL RUN (GITHUB_BASE_REF/GITHUB_HEAD_REF unset) — using ` +
					`the HEAD~1..HEAD diff of the most recent commit. This is a developer ` +
					`fallback, not the CI declaration check.`,
			);
			// Local development: diff the most recent commit. Same
			// `--name-status` shape as CI so the parseDiffNameStatus
			// contract is exercised on both paths.
			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-status --diff-filter=ACDMRT -z HEAD~1 HEAD`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedEntries = parseDiffNameStatus(diffOutput);
		}
	} catch (err) {
		// A merge-base failure (graft, diverged histories) is caught
		// inline above and re-thrown with a clear cause — it never
		// reaches here as a silent "no proofs declared". Any other git
		// failure also fails LOUD. An input we cannot parse is not
		// replaced by a compliant default.
		throw new Error(
			`git diff failed — cannot determine which proofs this PR declared. ` +
				`Fetch the base ref (e.g., "git fetch origin <base>") and retry. ` +
				`Detail: ${(err as Error).message}`,
		);
	}

	// Every file added or modified under tests/proofs/ is a declared proof.
	// Proof files live under apps/front/tests/proofs/, so the diff paths
	// from the repo root start with "apps/front/tests/proofs/".
	// Filter to files that are REPLAYABLE test files. A sidecar
	// manifest (`.expected-red.json`) or a shared detection module
	// (`lib/sigint-handler-detection.mts`) lives in the same
	// directory tree but is not itself a proof — it is supporting
	// infrastructure. Including non-test files in `declared` would
	// make the runner's un-replayable check fail loud, which is the
	// right call for an undeclared test file but a false alarm for a
	// shared lib. The path-prefix filter alone is too broad; pin to
	// the replayable extensions the runner actually executes.
	//
	// Renames and copies are excluded here on purpose. A renamed proof
	// would need its manifest renamed to match the new path, and the
	// runner cannot verify the new path without that rename. The
	// rename's full info is preserved on the entry (`oldPath`) and
	// surfaces in the un-replayable branch below with a clear cause.
	const declared: DiffEntry[] = [];
	for (const entry of changedEntries) {
		if (entry.status === 'R' || entry.status === 'C') {
			// The runner cannot verify a renamed/copied proof without a
			// matching manifest rename. Reject loud with the cause and
			// both paths so the operator knows exactly what to look at.
			throw new Error(
				`declaredProofTests: a proof file was renamed or copied ` +
					`in this PR (status "${entry.status}", ` +
					`"${String(entry.oldPath)}" → "${entry.path}"). ` +
					`Renamed proofs need a manifest rename the runner cannot ` +
					`perform, so the rename MUST be split into an explicit ` +
					`"delete old + add new" pair, each carrying its own manifest.`,
			);
		}
		if (
			!entry.path.startsWith('apps/front/tests/proofs/') ||
			!(entry.path.endsWith('.test.ts') || entry.path.endsWith('.test.tsx'))
		) {
			continue;
		}
		// Strip the apps/front/ prefix so the rest of the runner sees paths
		// relative to the working directory it actually operates in.
		declared.push({
			status: entry.status,
			path: entry.path.replace(/^apps\/front\//, ''),
		});
	}

	return declared;
};

/**
 * Validate that a proof-test file is a real, parseable test before handing it
 * to vitest. An empty, binary, or truncated file makes vitest exit 1 with
 * "No test suite found" or a PARSE_ERROR — which the runner would otherwise
 * misread as "the test failed as expected". We catch that here and fail loud
 * naming the file, so a corrupted proof is never silently green.
 */
const validateProofFile = (path: string): void => {
	// Check existence explicitly so the error message names the file path in a
	// consistent format, rather than relying on the raw ENOENT from readFileSync
	// (#1768 — the three-dot diff declares files the working tree may not have,
	// and a bare ENOENT stack obscures which declared proof went missing).
	// The error is marked kind=missing-proof so the replay loop can tell a
	// merely-behind branch (missing file → merge develop) apart from a genuinely
	// corrupted proof (present but unreadable → corruption accusation).
	if (!existsSync(path)) {
		const err = new Error(
			`Proof file is missing (ENOENT — declared by the three-dot diff but not ` +
				`found on disk): ${path}. This is NOT a corrupted proof: the branch is ` +
				`likely simply behind develop, where the file was added, removed, or moved ` +
				`after this branch forked. Merge develop into this branch so the declared ` +
				`proof exists here.`,
		) as Error & { kind?: string };
		err.kind = 'missing-proof';
		throw err;
	}

	const buf = readFileSync(path);

	if (buf.length === 0) {
		throw new Error(`Proof file is empty (0 bytes): ${path}`);
	}

	// A real test file is UTF-8 source. Null bytes signal a binary file
	// (e.g. an image or compiled artifact renamed to .test.ts).
	if (buf.includes(0)) {
		throw new Error(`Proof file contains null bytes (binary?): ${path}`);
	}

	const content = buf.toString('utf-8');

	// A proof test must actually declare at least one test case. A truncated
	// file, a YAML-accident, or a non-test file renamed to .test.ts won't.
	if (!/(?:^|\s)(?:test|it|describe)\s*\(/.test(content)) {
		throw new Error(
			`Proof file declares no test/it/describe (truncated? not a test?): ${path}`,
		);
	}
};

/**
 * Determine if a filename ends with one of the replayable extensions.
 * Uses exact suffix matching (not last-dot slicing) so multi-dot
 * extensions like `.test.ts` and `.test.tsx` are recognized correctly.
 */
const isReplayableFile = (filename: string): boolean => {
	return REPLAYABLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
};

// --- Main logic ---

// First, determine what this PR declared, BEFORE the no-op check
// below. The previous order (no-op check first) created #1940: a PR
// that wholly deleted `tests/proofs/<issue>/` left the working tree
// without that directory, the early check fired, and the runner
// printed "no paired red proof tests found" and exited 0 — a silent
// green that verified nothing. The declaration step inspects git
// history, not the working tree, so it can detect a deletion even
// when the directory no longer exists locally. Let it propagate on
// any git error so the step fails loud rather than silently turning
// green.
const declared = declaredProofTests();

// #1940 — the load-bearing fix. `git diff --name-only` (the previous
// shape) dropped deletion status on the floor: a wholly deleted
// `tests/proofs/<issue>/` directory showed up as zero entries and
// the `existsSync` path could either crash on ENOENT (a hard red) or,
// worse, silently count as "no proofs declared" and exit 0. We now
// use `git diff --name-status`, so every entry carries its status.
// The runner's job is to refuse the deletion loud with the exact
// files touched, not to let it through. Two failure shapes:
//
// 1. Any entry under tests/proofs/ with status D or R is a deletion
//    the runner cannot verify (no path on disk → no validation). One
//    error message per file, naming the path, so the operator knows
//    exactly what to look at.
// 2. If every entry under a single tests/proofs/<X>/ subtree is
//    deleted (the entire directory has been removed), the message
//    groups them: deleting the whole directory is a stronger signal
//    than deleting a single file, and a grouped error saves the
//    operator from reading 6 redundant file names when 1 root cause
//    is at stake. The "PROUVE_ALLOW_DELETED=<X>" opt-in env var lets
//    a deliberate deletion proceed without rewriting the runner —
//    the variable's whole purpose is to force a conscious decision
//    rather than a silent "no proofs declared" green.
//
// This check must run BEFORE the working-tree "no proofs found"
// no-op below, otherwise a wholly-deleted subtree short-circuits to
// the silent false-green (the directory no longer exists on disk).
const deletedEntries = declared.filter((e) => e.status === 'D');
if (deletedEntries.length > 0) {
	// Group deletions by their top-level `tests/proofs/<X>/` directory.
	// A PR that deletes the entire tests/proofs/<X>/ subtree shows up
	// here as one group with every entry status `D`; a PR that deletes
	// individual files across several directories shows up as several
	// one-entry groups. The grouping is the operator-facing signal:
	// "you just deleted an entire subtree" reads differently from
	// "you deleted these individual files".
	const PROOFS_RE = /^tests\/proofs\/([^/]+)\//;
	const groups = new Map<string, string[]>();
	const orphans: string[] = [];
	for (const entry of deletedEntries) {
		const match = entry.path.match(PROOFS_RE);
		if (match) {
			const key = `tests/proofs/${match[1]}/`;
			const list = groups.get(key) ?? [];
			list.push(entry.path);
			groups.set(key, list);
			continue;
		}
		orphans.push(entry.path);
	}

	const lines: string[] = [
		'This PR deleted one or more proof files under tests/proofs/. ' +
			'The runner cannot verify a deleted proof (no path on disk), so ' +
			'the deletion is REFUSED.',
	];
	for (const [dir, files] of groups) {
		const subDir = dir.replace(/^tests\/proofs\//, '').replace(/\/$/, '');
		// The opt-in env var is checked per-subtree so a PR that
		// legitimately deletes tests/proofs/old-issue/ but not
		// tests/proofs/current-issue/ can opt in to ONE without
		// exempting the other.
		if (process.env.PROUVE_ALLOW_DELETED === subDir) {
			console.log(
				`Skipping deletion refusal for tests/proofs/${subDir}/ ` +
					`(PROUVE_ALLOW_DELETED=${subDir}).`,
			);
			continue;
		}
		const subTree =
			dir === `tests/proofs/${subDir}/` && files.length > 1
				? `Entire tests/proofs/${subDir}/ subtree deleted (${files.length} files):\n` +
					files.map((f) => `  - ${f}`).join('\n')
				: `Deleted proof file: ${files.join(', ')}`;
		lines.push(subTree);
		lines.push(
			`If this deletion is intentional, re-run with ` +
				`PROUVE_ALLOW_DELETED=${subDir} to acknowledge the loss.`,
		);
	}
	for (const orphan of orphans) {
		lines.push(`Deleted proof file: ${orphan}`);
	}
	throw new Error(lines.join('\n'));
}

// Renames inside tests/proofs/ already throw above. Anything past this
// point is A or M — entries the runner can replay. Keep the rest of
// the script unchanged in shape: it iterates over paths and validates
// each one. Use the same declared array, but resolve the path field
// (now the only thing the downstream code uses).

// Confirm the versioned directory exists on the WORKING TREE. If it
// does not, the repo has no proof infrastructure — the step is a
// no-op. This is checked AFTER the declaration+delete scan above so
// a wholly-deleted subtree is still refused loud (it cannot fall
// through to this branch).
if (!existsSync(PROOFS_DIR)) {
	console.log('No paired red proof tests found in tests/proofs/.');
	console.log(
		'This step is a no-op for PRs that do not declare a paired red proof.',
	);
	console.log(
		'To declare one, add a file under apps/front/tests/proofs/<issue>/.',
	);
	process.exit(0);
}

if (declared.length === 0) {
	// Proofs exist in the repo, but no proof files changed in scope.
	// The message must distinguish a LOCAL diff-scope check from the CI
	// declaration check: "no proofs in HEAD~1..HEAD" is not a CI verdict
	// and must never be read as one (precedent: #1806 ronde 9).
	const isLocalRun =
		!process.env.GITHUB_BASE_REF && !process.env.GITHUB_HEAD_REF;
	if (isLocalRun) {
		console.log(
			'LOCAL RUN — no proof test files changed in HEAD~1..HEAD (local diff scope).',
		);
		console.log(
			'This is NOT the CI declaration check; it only replays proofs touched ' +
				'by the most recent commit. CI declares proofs from the full base..HEAD diff.',
		);
	} else {
		console.log(
			'This PR did not declare any paired red proofs (no proof files added or modified).',
		);
		console.log(
			'Proof tests are versionned under tests/proofs/; this PR did not touch any of them.',
		);
		console.log(
			'This step is an explicit no-op for PRs that do not declare a proof.',
		);
	}
	process.exit(0);
}

// The PR declared proofs — validate each one is replayable.
// Renames have already thrown above; at this point every entry in
// `declared` is A or M and has a `.path` we can hand to the runner.
const replayable: string[] = [];
const unReplayable: string[] = [];

for (const entry of declared) {
	if (isReplayableFile(entry.path)) {
		replayable.push(entry.path);
	} else {
		unReplayable.push(entry.path);
	}
}

// A declared proof the guard cannot replay MUST fail the step loud. This is
// the load-bearing check: it is what makes the guard monitor its own
// integrity. If the runner's replay config cannot execute a declared file,
// the author must either make the file replayable or remove it — not ignore
// it.
if (unReplayable.length > 0) {
	console.error(
		`The PR declared ${declared.length} proof file(s), but ${unReplayable.length} of them cannot be replayed by the runner.`,
	);
	console.error(
		`Replayable extensions are: ${REPLAYABLE_EXTENSIONS.join(', ')}. ` +
			`Declare only proof files with these extensions.`,
	);
	console.error('UnReplayable declared proofs:');
	for (const t of unReplayable) {
		console.error(`  ${t}`);
	}
	console.error(
		'A declared proof the guard cannot replay is a blind spot, not a no-op. ' +
			'Fix the extension or remove the file from the PR.',
	);
	process.exit(1);
}

// All declared proofs are replayable — replay them with inverted semantics.
console.log(
	`This PR declared ${replayable.length} paired red proof(s) — replaying with inverted semantics:\n`,
);
for (const t of replayable) {
	console.log(`  ${t}`);
}
console.log();

let failures = 0; // proof tests that failed as expected (good)
let unexpectedPasses = 0;
let corrupted = 0;
let stale = 0;
let missing = 0; // declared proof files absent from the working tree (behind develop)

for (const test of replayable) {
	// Validate BEFORE running: distinguishes "test failed as expected" from
	// "file could not be parsed" — the latter must fail loud naming the file.
	try {
		validateProofFile(test);
	} catch (err) {
		const proofError = err as Error & { kind?: string };
		// A MISSING declared proof is NOT corruption (#1768): a branch that is
		// simply behind develop will three-dot-declare files it does not have
		// yet. Tell the operator to merge develop. A file that EXISTS but is
		// unreadable/unparseable stays a corruption accusation.
		if (proofError.kind === 'missing-proof') {
			console.error(`  MISSING PROOF: ${proofError.message}`);
			missing++;
		} else {
			console.error(`  CORRUPT PROOF: ${proofError.message}`);
			corrupted++;
		}
		continue;
	}

	// Every declared paired red proof MUST carry a per-test expectation
	// manifest sitting next to it, named `<proof-file>.expected-red.json`.
	// Validate the manifest BEFORE launching vitest: a missing or unreadable
	// manifest makes the proof unclassifiable, so launching vitest would
	// waste cycles only to fail loud anyway. Catching it here names the
	// cause precisely (missing file, invalid JSON, empty declaration) and
	// avoids a noisy vitest crash that would obscure the real defect.
	// The global classifier cannot see a declared kept-red test turn green,
	// so falling back to it would silently restore the exact defect class
	// this runner exists to catch (issue #1806 ronde 11). A missing manifest
	// is therefore a LOUD failure that names the missing file and the
	// expected action — there is no silent fallback, ever.
	const manifestPath = `${test}.expected-red.json`;
	if (!existsSync(manifestPath)) {
		console.error(
			`  CORRUPT PROOF: expected-red manifest is MISSING — ${manifestPath}\n` +
				`  Every declared paired red proof MUST carry a per-test expectation manifest ` +
				`(<proof-file>.expected-red.json) declaring which test(s) are expected to stay ` +
				`red. Without it the runner cannot see a declared kept-red test turn green, so ` +
				`it refuses to classify. Add the manifest and declare the kept-red test(s) — ` +
				`tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts.expected-red.json ` +
				`is the reference shape.`,
		);
		corrupted++;
		continue;
	}

	let manifest;
	try {
		manifest = readExpectedRedManifest(manifestPath);
	} catch (manifestErr) {
		console.error(
			`  CORRUPT PROOF: expected-red manifest is unreadable — ${(manifestErr as Error).message}\n` +
				`  Manifest: ${manifestPath}\n` +
				`  The runner refuses to classify a paired red proof with a malformed per-test expectation.`,
		);
		corrupted++;
		continue;
	}

	console.log(`--- Running: ${test} ---`);

	// Run vitest with the JSON reporter writing to a temp file. The JSON
	// report gives us, per test, its status and the TYPE of the failure —
	// structural signals we can classify without reading display text.
	const reportFile = join(tmpdir(), `preuve-${process.pid}-${Date.now()}.json`);
	try {
		execFileSync(
			'pnpm',
			[
				'exec',
				'vitest',
				'run',
				'--config',
				CONFIG,
				'--no-color',
				'--reporter=json',
				`--outputFile=${reportFile}`,
				test,
			],
			{ stdio: 'pipe', encoding: 'utf-8' },
		);
		// If execFileSync did NOT throw, vitest exited 0 = the test passed.
		console.error(
			`  FAIL: proof test passed unexpectedly — the bug it documented may have changed form.\n  Test: ${test}`,
		);
		unexpectedPasses++;
	} catch (err) {
		const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
		const stdout = (error.stdout?.toString() ?? '').slice(0, 500);
		const stderr = (error.stderr?.toString() ?? '').slice(0, 500);
		const exitCode = error.status ?? 'unknown';

		// Read and parse the structural report. If the report is
		// unreadable for ANY reason (missing, empty, invalid JSON, wrong
		// shape), fail loud naming the cause — never fall back to text
		// heuristics nor to a compliant default.
		let report: ProofReport;
		try {
			report = readProofReport(reportFile);
		} catch (parseErr) {
			console.error(
				`  CORRUPT PROOF: vitest JSON report is unreadable — ${(parseErr as Error).message}\n` +
					`  stdout: ${stdout}\n  stderr: ${stderr}`,
			);
			corrupted++;
			continue;
		}

		const result = classifyProofWithManifest(
			report,
			exitCode as number,
			manifest,
		);

		// Le comptage vit dans consume-verdict.mts (extrait par #1843) : fonction
		// pure, testable seule. Ici on n'applique que l'effet de bord. Decision
		// porteuse : un vitest qui plante -> verdict ERROR -> doit incrementer
		// unexpectedPasses, PAS failures.
		const counts = consumeVerdict(
			{ failures, unexpectedPasses, corrupted, stale },
			result.verdict,
		);
		failures = counts.failures;
		unexpectedPasses = counts.unexpectedPasses;
		corrupted = counts.corrupted;
		stale = counts.stale;
	} finally {
		// Always clean up the temp report file — even on classification
		// failure, we do not leave artifacts behind.
		try {
			unlinkSync(reportFile);
		} catch {
			// Ignore: the file may already be gone.
		}
	}
}

console.log(`\n=== Summary ===`);
console.log(`  Proof tests failed as expected: ${failures}`);
console.log(`  Proof tests passed unexpectedly:  ${unexpectedPasses}`);
console.log(`  Corrupt/unparseable proof files:  ${corrupted}`);
console.log(`  Declared proofs missing from tree: ${missing}`);
console.log(`  Stale proofs (declared red went green): ${stale}`);

// The exit gate, pinned by tests (issue #1806 ronde 11): the runner MUST
// exit non-zero when ANY of the three red counters is non-zero — a stale
// proof alone (a declared kept-red test went green, with
// unexpectedPasses == 0 and corrupted == 0) fails CI. The predicate
// lives in consume-verdict.mts so the exit condition is testable without
// spawning this script; the process-launch regression in
// run-preuves.test.ts additionally proves the REAL script exits
// non-zero when only stale > 0.
if (
	missing > 0 ||
	gateShouldFail({ failures, unexpectedPasses, corrupted, stale })
) {
	console.error(`\nFAIL: proof replay did not complete cleanly.`);
	if (missing > 0) {
		console.error(
			`  ${missing} declared proof file(s) are missing from this working tree.`,
		);
		console.error(
			'  This is NOT corruption: merge develop into the branch to bring the declared proofs over.',
		);
	}
	if (unexpectedPasses > 0) {
		console.error(
			`  ${unexpectedPasses} proof test(s) passed when they should have failed.`,
		);
		console.error(
			'A proof test passing means the bug it documented has been fixed or changed form.',
		);
	}
	if (stale > 0) {
		console.error(
			`  ${stale} declared kept-red test(s) passed unexpectedly \u2014 the proof is stale (the bug changed form or was weakened).`,
		);
		console.error(
			'Rebuild the proof: update the test assertion to match the current bug, or remove it if the bug is fixed.',
		);
	}
	if (corrupted > 0) {
		console.error(
			`  ${corrupted} proof file(s) could not be classified — an empty/binary/truncated file, ` +
				`an unreadable vitest JSON report, or a MISSING expected-red manifest.`,
		);
	}
	if (missing > 0) {
		console.error(
			`  ${missing} declared proof file(s) are missing — merge develop into the branch.`,
		);
	}
	process.exit(1);
}

console.log('\nAll declared proof tests behaved as expected.');
process.exit(0);
