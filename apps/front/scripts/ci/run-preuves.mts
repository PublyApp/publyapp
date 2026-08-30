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
	classifyProof,
	classifyProofWithManifest,
	readExpectedRedManifest,
	readProofReport,
	type ProofReport,
} from './classify-proof.mts';
import { consumeVerdict } from './consume-verdict.mts';

const ROOT = join(process.cwd(), '..'); // apps/front → repo root
const PROOFS_DIR = join(process.cwd(), 'tests', 'proofs');
const CONFIG = 'vitest.preuves.config.ts';

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
 * @returns The list of proof-test paths (relative to apps/front) that were
 *          added or modified in the diff.
 * @throws If `git diff` or `git merge-base` fails. An unresolvable base can
 *         never silently become "no proofs declared"; the operator must fetch
 *         the base or fix the checkout.
 */
const declaredProofTests = (): string[] => {
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

	// Get the list of files changed by this PR.
	let changedFiles: string[];
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

			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-only "${baseRef}..HEAD"`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedFiles = diffOutput
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
		} else {
			// Local development: neither variable is defined. Announce this
			// loudly so a local run is never mistaken for the CI declaration
			// check, and so the "no proofs declared" conclusion below cannot
			// be read as a CI verdict (precedent: #1806 ronde 9).
			console.error(
				`LOCAL RUN (GITHUB_BASE_REF/GITHUB_HEAD_REF unset) — using the ` +
					`HEAD~1..HEAD diff of the most recent commit. This is a developer ` +
					`fallback, not the CI declaration check.`,
			);
			// Local development: diff the most recent commit.
			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-only HEAD~1 HEAD`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedFiles = diffOutput
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
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
	const declared = changedFiles.filter(
		(f) =>
			f.startsWith('apps/front/tests/proofs/') &&
			(f.endsWith('.test.ts') || f.endsWith('.test.tsx')),
	);

	// Return paths relative to apps/front (the working directory).
	return declared.map((p) => p.replace(/^apps\/front\//, ''));
};

/**
 * Validate that a proof-test file is a real, parseable test before handing it
 * to vitest. An empty, binary, or truncated file makes vitest exit 1 with
 * "No test suite found" or a PARSE_ERROR — which the runner would otherwise
 * misread as "the test failed as expected". We catch that here and fail loud
 * naming the file, so a corrupted proof is never silently green.
 */
const validateProofFile = (path: string): void => {
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
const replayable: string[] = [];
const unReplayable: string[] = [];

for (const test of declared) {
	if (isReplayableFile(test)) {
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

for (const test of replayable) {
	// Validate BEFORE running: distinguishes "test failed as expected" from
	// "file could not be parsed" — the latter must fail loud naming the file.
	try {
		validateProofFile(test);
	} catch (err) {
		console.error(`  CORRUPT PROOF: ${(err as Error).message}`);
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

		// Look for a per-test expectation manifest sitting next to the
		// proof file (named `<proof>.expected-red.json`). When present,
		// use the per-test classifier (r8 fix for the angle mort in
		// #1863, scoped to this proof file). When absent, fall back to
		// the global classifier (existing r7 behavior). When present but
		// unreadable, fail loud naming the cause — never silently
		// fall back to a compliant default.
		const manifestPath = `${test}.expected-red.json`;
		let result;
		if (existsSync(manifestPath)) {
			let manifest;
			try {
				manifest = readExpectedRedManifest(manifestPath);
			} catch (manifestErr) {
				console.error(
					`  CORRUPT PROOF: expected-red manifest is unreadable — ${(manifestErr as Error).message}\n` +
						`  Manifest: ${manifestPath}\n` +
						`  The runner refuses to classify a paired red proof with a malformed per-test expectation.\n` +
						`  stdout: ${stdout}\n  stderr: ${stderr}`,
				);
				corrupted++;
				continue;
			}
			result = classifyProofWithManifest(report, exitCode as number, manifest);
		} else {
			// No sidecar: fall through to the global classifier (r7).
			// Generalization to per-test manifests for every proof file
			// is scoped in #1863.
			result = classifyProof(report, exitCode as number);
		}

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
				console.error(`  FAIL: ${result.reason}\n  Test: ${test}`);
				break;
			case 'DECLARED RED PASSED':
				console.error(`  STALE PROOF: ${result.reason}\n  Test: ${test}`);
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
console.log(`  Stale proofs (declared red went green): ${stale}`);

if (unexpectedPasses > 0 || stale > 0 || corrupted > 0) {
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
			`  ${corrupted} proof file(s) could not be parsed — they are empty, binary, or truncated.`,
		);
	}
	process.exit(1);
}

console.log('\nAll declared proof tests behaved as expected.');
process.exit(0);
