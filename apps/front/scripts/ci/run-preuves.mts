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

// ROOT and PROOFS_DIR resolve from process.cwd(), not from import.meta.url.
// The runner is spawned from the package it inspects (apps/front for front
// proofs, packages/scripts-ts for scripts-ts proofs), so cwd tracks the
// working tree under measurement. Resolving ROOT from the script's own
// location would decouple ROOT from the spawn cwd and break the in-tree
// fixture tests (apps/front/scripts/ci/run-preuves.test.ts), which spin up
// throwaway git repos and spawn the runner from there.
//
// The runner is spawned with cwd=apps/front/; the repo root sits two levels
// up. `ROOT` is used for locating scripts-ts packages and computing the
// scripts-ts proofs CWD (ROOT + 'packages/scripts-ts'), and for spawning
// `git -C` commands. The git diff is repo-root-relative, so ROOT must point
// to the actual repo root, not the cwd one level up.
const ROOT = join(process.cwd(), '..', '..'); // apps/front → repo root
const PROOFS_DIR = join(process.cwd(), 'tests', 'proofs');
const CONFIG = 'vitest.preuves.config.ts';

// Heavy-operation timeouts ("charge machine" — every exec* in this runner
// must bound its wall-clock wait, never block the CI step indefinitely).
// Each value is generous enough for a cold cache on a slow runner, tight
// enough to fail loud within the CI step's 10-minute window. Without these,
// a hung `git fetch` (network partition) or a stuck `vitest run` (deadlock
// in a proof fixture) would block the step until the orchestrator kills
// the workflow, with no actionable error in the logs. Every execSync /
// execFileSync below MUST pass one of these as `timeout` — see the
// lint guard `no-uncapped-exec-timeout` (TODO once added) for the audit.
const TIMEOUT_GIT_READ_MS = 30_000; // rev-parse, merge-base, diff
const TIMEOUT_GIT_FETCH_MS = 5 * 60_000; // fetch --unshallow / single-ref fetch
const TIMEOUT_VITEST_RUN_MS = 8 * 60_000; // proof replay vitest run per file

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
 * two-dot diff (refs/remotes/origin/<base>..HEAD) to list every file that
 * differs between the base branch and the PR's HEAD. This is robust even
 * when the base ref and HEAD share no merge base (a diverged branch), where
 * a three-dot diff would fail with "no merge base". The two-dot form may
 * include base-branch changes introduced since the fork — conservatively
 * treating them as declared — but it never silently misses a proof the PR
 * actually added.
 *
 * GitHub's checkout action fetches only the PR's own ref by default — the
 * base branch's remote ref (refs/remotes/origin/<base>) is NOT available
 * until we fetch it. We fetch it explicitly before the diff so the guard
 * works on a clean CI checkout. The fetch is scoped to the single base ref
 * and is fast (a few hundred KB at most).
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
 * @returns The list of declared proofs. Each entry pairs the repo-root-relative
 *          path with a routing flag (`isScriptsTs`) that identifies which
 *          package's working directory the replay loop must use. The two
 *          proof trees (apps/front/tests/proofs/ and
 *          packages/scripts-ts/tests/proofs/) cannot share a stripped path
 *          shape — both become `tests/proofs/...` after the package prefix is
 *          dropped, and the routing flag is what tells the replay loop
 *          apart. Returning the repo-root-relative path keeps the declaration
 *          source-of-truth intact while the routing flag carries the run-time
 *          identity.
 * @throws If `git diff` or `git merge-base` fails. An unresolvable base can
 *         never silently become "no proofs declared"; the operator must fetch
 *         the base or fix the checkout.
 */
interface DeclaredProof {
	// Path relative to the repo root (e.g. "apps/front/tests/proofs/1767/red-...").
	path: string;
	// True for proofs under packages/scripts-ts/, false for proofs under
	// apps/front/. Used by the replay loop to pick the correct CWD + vitest
	// config + relative path passed to vitest.
	isScriptsTs: boolean;
}

/**
 * The filename prefix that marks a test file as a PAIRED RED PROOF.
 *
 * A file under tests/proofs/ is a declared paired red proof ONLY when its
 * file name (the last path segment) starts with `red-`. This is the
 * explicit-in-the-tree marker the brief (#1929-r2) demands: the runner
 * must never GUESS whether a file is a red proof from its contents or
 * from the absence of a manifest — the prefix is the declaration.
 *
 * Files without the prefix (green proofs, decorative files, artefacts
 * that slipped into the directory) are NOT declared and are ignored by
 * the CI step. This is what keeps a legitimate green proof in the same
 * directory from turning the step red.
 */
const RED_PROOF_PREFIX = 'red-';

const declaredProofTests = (): DeclaredProof[] => {
	// First, confirm the versioned directory exists at all. If it does not,
	// the repo has no proof infrastructure — the step is a no-op.
	if (!existsSync(PROOFS_DIR)) {
		return [];
	}

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
			timeout: TIMEOUT_GIT_READ_MS,
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
			execSync(`git -C "${ROOT}" fetch --unshallow`, {
				stdio: ['pipe', 'pipe', 'pipe'],
				timeout: TIMEOUT_GIT_FETCH_MS,
			});
		} catch (err) {
			throw new Error(
				`git fetch --unshallow failed — cannot unshallow a grafted ` +
					`repository. Detail: ${(err as Error).message}`,
			);
		}
	}

	// Determine the diff scope. In CI (GITHUB_BASE_REF and GITHUB_HEAD_REF
	// both set), diff the PR's declared proof files against the base. In
	// local mode (neither set), diff the last commit. A half-set
	// environment (exactly one of the two) is a misconfiguration — fail
	// loud naming the missing variable so the operator can fix the
	// checkout, not silently fall through to the local diff (which would
	// produce a false "no proofs declared" green — precedent: #1806 ronde
	// 10).
	let changedFiles: string[];
	const ghBase = process.env['GITHUB_BASE_REF'];
	const ghHead = process.env['GITHUB_HEAD_REF'];
	const ciScope = ghBase !== undefined && ghHead !== undefined;
	const halfSet =
		(ghBase !== undefined && ghHead === undefined) ||
		(ghBase === undefined && ghHead !== undefined);

	if (halfSet) {
		const missing =
			ghBase === undefined ? 'GITHUB_BASE_REF' : 'GITHUB_HEAD_REF';
		throw new Error(
			`incomplete CI environment — ${missing} is undefined. Both ` +
				`GITHUB_BASE_REF and GITHUB_HEAD_REF must be set for CI scope, ` +
				`or neither for local scope. A half-set environment would ` +
				`silently fall through to the local diff and produce a false ` +
				`"no proofs declared" green.`,
		);
	}

	if (ciScope) {
		// CI mode: diff the merge base against HEAD. The merge base is the
		// point where the PR branch diverged from the base branch — the
		// files changed in the PR's lifetime.
		let mergeBase: string;
		try {
			mergeBase = execSync(
				`git -C "${ROOT}" merge-base origin/${ghBase} HEAD`,
				{
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe'],
					timeout: TIMEOUT_GIT_READ_MS,
				},
			).trim();
		} catch (err) {
			throw new Error(
				`git merge-base failed — cannot determine the PR's diff scope. ` +
					`Detail: ${(err as Error).message}`,
			);
		}

		try {
			changedFiles = execSync(
				`git -C "${ROOT}" diff --name-only ${mergeBase} HEAD`,
				{
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe'],
					timeout: TIMEOUT_GIT_READ_MS,
				},
			)
				.split('\n')
				.filter((l) => l.length > 0);
		} catch (err) {
			throw new Error(
				`git diff failed — cannot list the PR's changed files. ` +
					`Detail: ${(err as Error).message}`,
			);
		}
	} else {
		// Local mode: diff the last commit (HEAD~1..HEAD). This captures
		// the proof files the developer just committed. Announce this loudly
		// so a local run is never mistaken for the CI declaration check,
		// and so the "no proofs declared" conclusion below cannot be read
		// as a CI verdict (precedent: #1806 ronde 9).
		console.error(
			`LOCAL RUN (GITHUB_BASE_REF/GITHUB_HEAD_REF unset) — using the ` +
				`HEAD~1..HEAD diff of the most recent commit. This is a developer ` +
				`fallback, not the CI declaration check.`,
		);
		try {
			changedFiles = execSync(`git -C "${ROOT}" diff --name-only HEAD~1 HEAD`, {
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
				timeout: TIMEOUT_GIT_READ_MS,
			})
				.split('\n')
				.filter((l) => l.length > 0);
		} catch (err) {
			throw new Error(
				`git diff HEAD~1 HEAD failed — cannot list the last commit's ` +
					`changed files. Detail: ${(err as Error).message}`,
			);
		}
	}

	// Keep only proof files with the `red-` filename prefix under one of the
	// two proof directories. The prefix is the explicit-in-the-tree marker
	// that distinguishes a paired red proof from a green proof or other
	// artefact living in the same directory. A file WITHOUT the prefix is
	// NOT declared and is silently ignored — this is correct behaviour
	// because the runner cannot classify a file whose "this is a red proof"
	// declaration it cannot see.
	//
	// The path-prefix filter alone is too broad; pin to the replayable
	// extensions the runner actually executes AND the red- prefix.
	return changedFiles
		.filter((f) => {
			const fileName = f.split('/').pop() ?? '';
			const inProofsDir =
				f.startsWith('apps/front/tests/proofs/') ||
				f.startsWith('packages/scripts-ts/tests/proofs/');
			const isReplayableExt =
				fileName.endsWith('.test.ts') || fileName.endsWith('.test.tsx');
			const isRedProof = fileName.startsWith(RED_PROOF_PREFIX);
			return inProofsDir && isReplayableExt && isRedProof;
		})
		.map((p): DeclaredProof => ({
			path: p,
			isScriptsTs: p.startsWith('packages/scripts-ts/tests/proofs/'),
		}));
};

/**
 * Validate that a proof-test file is a real, parseable test before handing it
 * to vitest. An empty, binary, or truncated file makes vitest exit 1 with
 * "No test suite found" or a PARSE_ERROR — which the runner would otherwise
 * misread as "the test failed as expected". We catch that here and fail loud
 * naming the file, so a corrupted proof is never silently green.
 */
const validateProofFile = (path: string): void => {
	// Check existence BEFORE reading — readFileSync throws ENOENT for a
	// missing file, but a missing file is NOT corruption. It is a
	// "declared proof file is missing from the tree" condition (#1768),
	// which has a different remedy (merge develop) than a corrupt file.
	// The two must never be confused: a corrupt file tells the operator
	// "replace this file", while a missing file tells them "merge the
	// branch that added it". See the catch block in the replay loop.
	if (!existsSync(path)) {
		throw new Error(`Proof file is missing: ${path}`);
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

// Confirm the versioned directory exists. If it does not, the repo has no
// proof infrastructure — the step is a no-op.
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

// Determine what this PR declared. This can throw if git diff fails — let it
// propagate so the step fails loud rather than silently turning green.
const declared = declaredProofTests();

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
const replayable: DeclaredProof[] = [];
const unReplayable: DeclaredProof[] = [];

for (const test of declared) {
	if (isReplayableFile(test.path)) {
		replayable.push(test);
	} else {
		unReplayable.push(test);
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
		console.error(`  ${t.path}`);
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
	console.log(`  ${t.path}`);
}
console.log();

let failures = 0; // proof tests that failed as expected (good)
let unexpectedPasses = 0;
let corrupted = 0;
let missing = 0; // declared proof files missing from the working tree (#1768)
let stale = 0;

for (const test of replayable) {
	const isScriptsTsProof = test.isScriptsTs;
	// scripts-ts proofs run from packages/scripts-ts/ with their own vitest
	// config; front proofs run from the spawn cwd (apps/front/) with the
	// front runner's vitest config.
	const cwd = isScriptsTsProof
		? join(ROOT, 'packages', 'scripts-ts')
		: process.cwd();

	// Resolve the proof file to an absolute path. The path returned by
	// declaredProofTests() is repo-root-relative; strip the package prefix
	// to get the path vitest will see (relative to its CWD).
	const proofPackagePath = isScriptsTsProof
		? test.path.replace(/^packages\/scripts-ts\//, '')
		: test.path.replace(/^apps\/front\//, '');
	// proofFile is the on-disk path vitest will resolve. For front proofs the
	// package directory IS the spawn cwd (apps/front/), so the file lives at
	// cwd + proofPackagePath where cwd is the repo root and the full repo-
	// relative path is what vitest expects to find. For scripts-ts proofs the
	// cwd is packages/scripts-ts/, so the same shape works.
	const proofFile = isScriptsTsProof
		? join(cwd, proofPackagePath)
		: join(ROOT, test.path);

	// Validate BEFORE running: distinguishes "test failed as expected" from
	// "file could not be parsed" — the latter must fail loud naming the file.
	// A MISSING file (ENOENT) is NOT corruption — it is a "declared proof
	// file is missing from the tree" condition (#1768), which has a
	// different remedy (merge develop) than a corrupt file. The two must
	// never be confused: a corrupt file tells the operator "replace this
	// file", while a missing file tells them "merge the branch that added
	// it". validateProofFile throws a distinct message prefix for each.
	try {
		validateProofFile(proofFile);
	} catch (err) {
		const message = (err as Error).message;
		if (message.startsWith('Proof file is missing:')) {
			// MISSING PROOF: the file the diff declared is not on disk.
			// This happens when the branch is behind the base — the diff
			// (three-dot) includes a proof the base branch added, but the
			// working tree (a fork behind the base) never received it.
			// The remedy is to merge develop, NOT to replace the file.
			console.error(
				`  MISSING PROOF: ${message.slice('Proof file is missing:'.length).trim()}
` +
					`  The proof file the diff declared is not on disk — the branch is likely behind the base branch.
` +
					`  Remedy: merge develop (or the base branch) to bring the proof file into the working tree.`,
			);
			missing++;
		} else {
			// CORRUPT PROOF: the file exists but is empty, binary, or
			// truncated. The operator must replace the file.
			console.error(`  CORRUPT PROOF: ${message}`);
			corrupted++;
		}
		continue;
	}

	// Every declared paired red proof MUST carry a per-test expectation
	// manifest sitting next to it, named `<proof-file>.expected-red.json`.
	// Validate the manifest BEFORE launching vitest: a missing or unreadable
	// manifest makes the proof unclassifiable, so launching vitest would
	// waste cycles only to fail loud anyway. Catching it here names the
	// cause precisely (missing file, invalid JSON, invalid measuredAgainst
	// field) and avoids a noisy vitest crash that would obscure the real
	// defect. The manifest lives on disk next to the proof file, so
	// resolve it against the same cwd the proof file lives under: for
	// scripts-ts proofs that is `packages/scripts-ts/`, for front proofs
	// that is `apps/front/`. Resolving relative to the spawn cwd (the
	// front cwd) made scripts-ts manifests invisible — the runner could
	// not find the manifest for a scripts-ts red proof and refused to
	// classify it, defeating the entire scripts-ts proof wiring.
	const preFlightManifestPath = isScriptsTsProof
		? join(cwd, `${proofPackagePath}.expected-red.json`)
		: `${proofPackagePath}.expected-red.json`;
	if (!existsSync(preFlightManifestPath)) {
		console.error(
			`  CORRUPT PROOF: expected-red manifest is MISSING — ${preFlightManifestPath}
` +
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

	let preFlightManifest;
	try {
		preFlightManifest = readExpectedRedManifest(preFlightManifestPath);
	} catch (manifestErr) {
		console.error(
			`  CORRUPT PROOF: expected-red manifest is unreadable — ${(manifestErr as Error).message}
` +
				`  Manifest: ${preFlightManifestPath}
` +
				`  The runner refuses to classify a paired red proof with a malformed per-test expectation.`,
		);
		corrupted++;
		continue;
	}

	console.log(`--- Running: ${test.path} ---`);

	const config = isScriptsTsProof
		? join(ROOT, 'packages', 'scripts-ts', 'vitest.preuves.config.ts')
		: join(process.cwd(), CONFIG); // apps/front/vitest.preuves.config.ts/vitest.preuves.config.ts

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
				config,
				'--no-color',
				'--reporter=json',
				`--outputFile=${reportFile}`,
				proofPackagePath,
			],
			{
				cwd,
				stdio: 'pipe',
				encoding: 'utf-8',
				timeout: TIMEOUT_VITEST_RUN_MS,
			},
		);
		// If execFileSync did NOT throw, vitest exited 0 = the test passed.
		console.error(
			`  FAIL: proof test passed unexpectedly — the bug it documented may have changed form.\n  Test: ${test.path}`,
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

		// Every declared paired red proof MUST carry a per-test expectation
		// manifest sitting next to it, named `<proof-file>.expected-red.json`.
		// The manifest lives on disk next to the proof file, so resolve it
		// against the same cwd the proof file lives under: for scripts-ts
		// proofs that is `packages/scripts-ts/`, for front proofs that is
		// `apps/front/`. Resolving relative to the spawn cwd (the front
		// The manifest was already validated and parsed in the pre-flight
		// above (BEFORE launching vitest) — reuse it here. Any validation
		// failure is loud-failed there with the precise cause; by the time
		// we reach this catch, the manifest is known-good.
		const result = classifyProofWithManifest(
			report,
			exitCode as number,
			preFlightManifest,
		);

		// Le comptage vit dans consume-verdict.mts (extrait par #1843) : fonction
		// pure, testable seule. Ici on n'applique que l'effet de bord. Decision
		// porteuse : un vitest qui plante -> verdict ERROR -> doit incrementer
		// unexpectedPasses, PAS failures.
		const counts = consumeVerdict(
			{ failures, unexpectedPasses, corrupted, stale, missing },
			result.verdict,
		);
		failures = counts.failures;
		unexpectedPasses = counts.unexpectedPasses;
		corrupted = counts.corrupted;
		stale = counts.stale;
		missing = counts.missing;

		switch (result.verdict) {
			case 'OK':
				console.log(`  OK: ${result.reason}\n`);
				break;
			case 'CORRUPT PROOF':
				console.error(
					`  CORRUPT PROOF: ${result.reason}\n` +
						`  A kept-red proof must fail on an assertion (expected X to be Y), ` +
						`  not on a thrown Error. A thrown Error means the proof could not measure ` +
						`  — this is NOT the expected kept-red state and must fail CI.\n` +
						`  stdout: ${stdout}\n  stderr: ${stderr}`,
				);
				break;
			case 'NO_TESTS':
				console.error(
					`  CORRUPT PROOF: ${result.reason}\n` +
						`  stdout: ${stdout}\n  stderr: ${stderr}`,
				);
				break;
			case 'UNEXPECTED_PASS':
				console.error(`  FAIL: ${result.reason}\n  Test: ${test.path}`);
				break;
			case 'DECLARED RED PASSED':
				console.error(`  STALE PROOF: ${result.reason}\n  Test: ${test.path}`);
				break;
			case 'ERROR':
				console.error(
					`  ERROR: ${result.reason} ` +
						`(failed: ${result.failedTests}, total: ${result.totalTests}).\n` +
						`  stdout: ${stdout}\n  stderr: ${stderr}`,
				);
				break;
		}
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
// exit non-zero when ANY of the red counters is non-zero — a stale
// proof alone (a declared kept-red test went green, with
// unexpectedPasses == 0 and corrupted == 0) fails CI. The predicate
// lives in consume-verdict.mts so the exit condition is testable without
// spawning this script; the process-launch regression in
// run-preuves.test.ts additionally proves the REAL script exits
// non-zero when only stale > 0.
if (gateShouldFail({ failures, unexpectedPasses, corrupted, stale, missing })) {
	console.error(`\nFAIL: proof replay did not complete cleanly.`);
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
			`  ${missing} declared proof file(s) are missing from the working tree — merge develop (or the base branch) to bring them in.`,
		);
	}
	process.exit(1);
}

console.log('\nAll declared proof tests behaved as expected.');
process.exit(0);
