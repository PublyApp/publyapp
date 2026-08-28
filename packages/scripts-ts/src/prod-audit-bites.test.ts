import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

// ---------------------------------------------------------------------------
// #1674 — bite-proof test for the production-dependency audit gate
// (.github/workflows/front-ci.yml::supply-chain::Audit production dependencies,
// which runs `pnpm audit --prod --audit-level=moderate`).
//
// Why this test exists:
// The #1667 commit lowered the production-graph threshold from `high` to
// `moderate` (#1644, rationale in front-ci.yml::supply-chain's own comment
// block). Today the production graph is clean at every level, so the gate
// is green for the right reason — but a guard that has never been seen to
// bite is indistinguishable from a guard that is silently broken: a future
// edit that reverts to `high` (or drops `--prod`, or removes the step) would
// not be caught by the existing tests, which only prove the YAML/manifest
// shape is intact.
//
// This test exercises the REAL pnpm audit command (no re-implementation
// of the gate's decision logic) against a controlled minimal production
// graph carrying a single, known-stable moderate advisory:
//   ejs@3.1.7  →  GHSA-ghr5-ch3p-vcr6  ("ejs lacks certain pollution
//   protection", vulnerable_versions "<3.1.10", patched_versions
//   ">=3.1.10", CVSS 4.0).
//
// The audit is a black box from this test's point of view: it shells out
// to `pnpm` exactly as the workflow does, with no monkey-patching, no
// mock fixture of the JSON output, and no parallel parser. If a future
// release of pnpm changes how it surfaces advisories, the test breaks
// loudly and honestly — that is the intended behavior.
// ---------------------------------------------------------------------------

// The advisory under test. Pinned in the test as a constant so a future
// `pnpm audit` advisory-DB change that downgrades or withdraws GHSA-ghr5-
// ch3p-vcr6 is observed by editing the constant, not by a silent shift
// in the test's meaning.
const ADVISORY_ID = 'GHSA-ghr5-ch3p-vcr6';
const ADVISORY_PACKAGE = 'ejs@3.1.7';
const ADVISORY_TITLE_FRAGMENT = 'ejs lacks certain pollution protection';

const PKG_JSON = JSON.stringify(
	{
		name: 'publy-1674-prod-audit-fixture',
		version: '0.0.0',
		private: true,
		// ejs is a PRODUCTION dependency on purpose: --prod must include it
		// in the audited graph, --dev must NOT.
		dependencies: {
			ejs: '3.1.7',
		},
	},
	null,
	'\t',
);

/**
 * Runs `pnpm <args>` in `cwd` and returns { status, stdout, stderr }.
 * `spawnSync` (not `execFileSync`) so a nonzero exit is data the caller
 * can assert against, not a thrown exception that aborts the test.
 */
const runPnpm = (args: string[], cwd: string) => {
	const result = spawnSync('pnpm', args, { cwd, encoding: 'utf8' });
	return {
		status: result.status ?? -1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

/**
 * Builds a fresh production-graph fixture in a temp directory, installs
 * the pinned ejs@3.1.7 (so a real pnpm-lock.yaml is on disk for audit),
 * and returns the fixture's cwd. The directory is removed by the caller's
 * `finally { rmSync(..., { recursive: true, force: true }) }`.
 */
const buildProdGraphFixture = () => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), 'publy-1674-prod-audit-'));
	writeFileSync(path.join(cwd, 'package.json'), PKG_JSON);

	// `--no-frozen-lockfile` is mandatory: the fixture starts without one.
	// `--ignore-scripts` is the same flag the CI step uses
	// (`pnpm install --frozen-lockfile --ignore-scripts`); scripts are
	// inert here but keeping the flag matches the workflow shape.
	const install = runPnpm(
		['install', '--no-frozen-lockfile', '--ignore-scripts'],
		cwd,
	);
	if (install.status !== 0) {
		throw new Error(
			`fixture install failed (exit ${install.status})\n` +
				`stdout: ${install.stdout}\nstderr: ${install.stderr}`,
		);
	}
	return cwd;
};

// ---------------------------------------------------------------------------
// The actual gate: the exact command string front-ci.yml runs, parsed from
// the workflow's `run:` body (not a hand-copy). If a future edit changes
// the command, this assertion refuses to silently drift.
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../..',
);
const WORKFLOW_PATH = path.join(repoRoot, '.github/workflows/front-ci.yml');

const extractProdAuditCommand = (): string => {
	// Use a tiny regex instead of a YAML parser: the `run:` body for this
	// step is a single literal line of the form
	//     run: pnpm audit --prod --audit-level=moderate
	// and parsing the whole workflow just to pluck one line is more
	// surface area than the assertion deserves. The regex matches the
	// step's name on the preceding line, so a future step named
	// "Audit production dependencies" with a different `run:` is caught
	// the same way a renamed step is.
	const text = readFileSync(WORKFLOW_PATH, 'utf8');
	const stepBlock = text.match(
		/- name: Audit production dependencies[^\n]*\n([\s\S]*?)(?=\n      - name:|\n  [a-z]|\n$)/,
	);
	assert.ok(
		stepBlock,
		'front-ci.yml: could not locate the "Audit production dependencies" step block',
	);
	const runMatch = stepBlock[1].match(/^\s*run:\s*(.+?)\s*$/m);
	assert.ok(
		runMatch,
		'front-ci.yml: "Audit production dependencies" step has no `run:` line',
	);
	return runMatch[1];
};

test('front-ci.yml: the production-dependency audit command is `pnpm audit --prod --audit-level=moderate` (the #1644 fix)', () => {
	const command = extractProdAuditCommand();
	assert.equal(
		command,
		'pnpm audit --prod --audit-level=moderate',
		`#1644 fix: the production-graph gate must run at moderate so a moderate advisory in a production dep fails the gate. Reverting this string to "--audit-level=high" (the pre-#1644 shape) would re-open the blind spot this test exists to catch.`,
	);
});

// ---------------------------------------------------------------------------
// Bite proof: a moderate advisory in a production dep must make the
// gate fail. This is the central claim of #1674 — the gate has never
// been seen to refuse a real advisory. Here it is.
// ---------------------------------------------------------------------------

test(
	`BITE PROOF — \`pnpm audit --prod --audit-level=moderate\` exits 1 on a prod graph containing ${ADVISORY_PACKAGE} (advisory ${ADVISORY_ID})`,
	{ timeout: 60_000 },
	() => {
		const cwd = buildProdGraphFixture();
		try {
			const { status, stdout, stderr } = runPnpm(
				['audit', '--prod', '--audit-level=moderate'],
				cwd,
			);
			assert.equal(
				status,
				1,
				`#1674: the production-audit gate must refuse a moderate advisory. ` +
					`If this assertion fails, the gate is no longer biting — ` +
					`either the threshold was raised (back to \`high\`), \`--prod\` was dropped, or pnpm no longer surfaces ${ADVISORY_ID}.\n` +
					`stdout: ${stdout}\nstderr: ${stderr}`,
			);
			// The output must surface the advisory by ID (not silently pass
			// because of some pnpm-internal heuristic that swallowed the
			// finding). This is also what an operator running the gate by
			// hand will see and act on.
			assert.match(
				stdout,
				new RegExp(ADVISORY_ID),
				`stdout must name the advisory (${ADVISORY_ID}) so the failure is actionable, not a bare exit code.\nstdout: ${stdout}`,
			);
			assert.match(
				stdout,
				new RegExp(ADVISORY_TITLE_FRAGMENT),
				`stdout must include the advisory title so the failure carries human-readable cause (DESIGN.md + AGENTS.md "transparent failure causes" rule).\nstdout: ${stdout}`,
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	},
);

// ---------------------------------------------------------------------------
// Mutation coverage: the same fixture, audited with the *previous*
// (`--audit-level=high`) and *previous* (`--dev`) shapes, must NOT bite.
// This is the assertion that makes the test resistant to "the gate is
// gone" mutations: if someone reverts the threshold to `high` (the
// pre-#1644 bug), the moderation-bite test above is no longer the only
// thing protecting the gate — this complementary test pins that a
// non-biting variant is NOT acceptable, and a future repair that "fixes"
// the gate by lowering the threshold past `moderate` (e.g. to `low`)
// would still pass the bite test but is rejected by the
// command-pinning test above.
// ---------------------------------------------------------------------------

test(
	`ADVERSE MUTATION #1 — \`pnpm audit --prod --audit-level=high\` (pre-#1644 threshold) does NOT bite on ${ADVISORY_ID} — proves the bite test above is real, not a tautology`,
	{ timeout: 60_000 },
	() => {
		const cwd = buildProdGraphFixture();
		try {
			const { status, stdout, stderr } = runPnpm(
				['audit', '--prod', '--audit-level=high'],
				cwd,
			);
			// pnpm audit at a higher threshold than the advisory's severity
			// exits 0: this is the behavior the pre-#1644 gate relied on, and
			// the reason a moderate advisory slipped through. Documenting
			// this here makes the bite proof non-tautological: if `high`
			// also failed, the bite test would be meaningless (any level
			// would do).
			assert.equal(
				status,
				0,
				`This test pins that \`--audit-level=high\` does NOT bite on a moderate advisory, ` +
					`which is exactly the #1644 blind spot. If this assertion fails, pnpm's ` +
					`threshold semantics changed and the bite proof above is no longer a ` +
					`useful witness of the #1644 fix.\nstdout: ${stdout}\nstderr: ${stderr}`,
			);
			// Sanity: the advisory is still surfaced in the output, just not
			// failing. pnpm suppresses the per-advisory table at `high` (the
			// detail rows are only printed at `moderate` and below) — so the
			// most we can demand is the headline "1 vulnerabilities found" with
			// a `moderate` severity tag, which proves the finding was
			// considered and dismissed by the threshold rather than hidden.
			// A future pnpm that hides below-threshold findings entirely
			// would invalidate the bite proof's signal; this assertion catches
			// that regression.
			assert.match(
				stdout,
				/1[\s\S]*?vulnerabilit/i,
				`\`--audit-level=high\` must still report the finding count, ` +
					`even though it does not fail on it — otherwise the bite proof is no ` +
					`longer a meaningful comparison (the gate could be hiding findings).\n` +
					`stdout: ${stdout}`,
			);
			assert.match(
				stdout,
				/moderate/i,
				`\`--audit-level=high\` must still surface the advisory's severity tag ` +
					`(moderate) when reporting the finding count — so an operator can tell ` +
					`the gate ignored a moderate advisory rather than a critical one.\n` +
					`stdout: ${stdout}`,
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	},
);

test(
	`ADVERSE MUTATION #2 — \`pnpm audit --dev --audit-level=moderate\` (the dev-graph gate) does NOT bite on ${ADVISORY_ID} because ejs is a prod dep — proves --prod is what makes the bite happen`,
	{ timeout: 60_000 },
	() => {
		const cwd = buildProdGraphFixture();
		try {
			const { status, stdout, stderr } = runPnpm(
				['audit', '--dev', '--audit-level=moderate'],
				cwd,
			);
			// ejs is in `dependencies`, not `devDependencies`, so the
			// dev-graph audit does not see it. The prod-graph bite above
			// is therefore specifically about --prod, not about audit
			// "in general" — a future edit that drops `--prod` from the
			// production gate would make THIS test pass on the same fixture
			// (the bite would silently migrate to the dev gate, which is
			// not what the workflow asks for).
			assert.equal(
				status,
				0,
				`--dev on a graph where the only vulnerable dep is in \`dependencies\` ` +
					`must exit 0 — that is the whole point of \`--prod\` in the production ` +
					`gate. If this assertion fails, either ejs landed in devDependencies by ` +
					`accident (revert) or pnpm's --dev semantics changed.\nstdout: ${stdout}\nstderr: ${stderr}`,
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	},
);

// ---------------------------------------------------------------------------
// Entry-readability: a gate that silently passes "no lockfile" as
// "no findings" is exactly the failure mode the brief calls out
// (exigence #5). pnpm's behavior is to fail loud with a named error
// code; pin that here so a future pnpm change that swallows the
// no-lockfile case (or a future edit to the gate that adds a fallback)
// is caught by the suite.
// ---------------------------------------------------------------------------

test(
	'ENTRY-READABILITY — `pnpm audit` with no lockfile fails with a named error, not a silent green',
	{ timeout: 60_000 },
	() => {
		const cwd = buildProdGraphFixture();
		try {
			const lockfile = path.join(cwd, 'pnpm-lock.yaml');
			// Move (not rm) so we can put it back if the assertion path
			// needs more diagnosis, and so a future maintainer can see the
			// fixture in its post-condition shape on failure.
			const backup = path.join(cwd, 'pnpm-lock.yaml.bak-1674');
			renameSync(lockfile, backup);

			const { status, stdout, stderr } = runPnpm(
				['audit', '--prod', '--audit-level=moderate'],
				cwd,
			);
			// Both streams can carry the error; pnpm has moved it between
			// them across versions.
			const combined = stdout + stderr;
			assert.notEqual(
				status,
				0,
				`pnpm audit with no lockfile must fail (status != 0), not silently treat ` +
					`the missing lockfile as "no findings". A gate that "no lockfile" → ` +
					`green is the failure mode this assertion exists to prevent.\n` +
					`stdout: ${stdout}\nstderr: ${stderr}`,
			);
			assert.match(
				combined,
				/ERR_PNPM_AUDIT_NO_LOCKFILE|No pnpm-lock\.yaml found/i,
				`The error must be named (a stable error code or an explicit message ` +
					`naming the cause), not a bare "exit 1" — see AGENTS.md "transparent ` +
					`failure causes" rule and the brief's entry-readability requirement.\n` +
					`stdout: ${stdout}\nstderr: ${stderr}`,
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	},
);
