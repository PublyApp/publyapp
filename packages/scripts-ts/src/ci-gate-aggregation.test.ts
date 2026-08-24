import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Proves the #1017 aggregate gates' result-aggregation logic — the "Check
// required jobs" step that reads `${{ toJSON(needs) }}` — actually fails
// closed on every documented result value AND on every shape a reviewer
// found it silently passed on. Extracts the REAL `run:` body from each of
// the four workflow files (parsed, not hand-copied) and executes it via
// `bash -e` (GitHub's default unspecified-shell behavior) with NEEDS_JSON
// set to representative payloads.
//
// Round-3 review found two fail-open cases, neither involving malformed
// JSON (which already fails: `set -e` propagates when `jq` itself errors,
// proven directly by the "malformed JSON" case below):
//   - an empty needs set (`{}`, `[]`) — passes after examining zero jobs;
//   - a valid-but-wrong shape (missing `.result`, or a result value outside
//     GitHub's documented success/failure/cancelled/skipped, e.g. a typo'd
//     or hypothetical future value) — `select(.result == "failure" or
//     .result == "cancelled")` only counts the two known-bad values, so
//     anything else silently contributes zero to bad_count.
// That fix inverted the check to a known-GOOD allowlist (success/skipped)
// and added explicit type/emptiness checks.
//
// ROUND 4 BLOCKER (this file's current job): the round-3 fix still treated
// EVERY "skipped" result as a pass, unconditionally. A round-4 review proved
// the real, damaging consequence: `changes` reporting `result: success` with
// an absent or empty `outputs.relevant` (GitHub can omit a job output
// entirely — including because it may contain a secret), combined with
// every heavy job legitimately skipped by its own `if` condition, made every
// one of the four gates exit 0 and print "All required jobs passed or were
// skipped" — a required check certifying that literally nothing was
// verified. The bug: "skipped" was never correlated with the classifier's
// own verdict. The gate step now:
//   - asserts `needs.changes.result` is exactly "success" (nothing
//     downstream can be trusted if the classifier itself did not complete);
//   - requires `needs.changes.outputs.relevant` to be EXACTLY the string
//     "true" or "false", failing closed on anything else, including an
//     absent, empty, wrong-case, or otherwise malformed value;
//   - when relevant is "true", requires every required job to be "success"
//     — "skipped" is no longer acceptable, which also catches the case
//     where a job was skipped because an upstream dependency actually
//     failed (the default cascade-skip GitHub Actions applies), not because
//     the change was irrelevant;
//   - when relevant is "false", allows "success" or "skipped" (a job that
//     is not gated by relevance, such as front-e2e's always-run cleanup
//     job, may legitimately still succeed even when the heavy work was
//     skipped) but still rejects failure/cancelled/unrecognized values.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowsDirectory = path.join(repoRoot, '.github/workflows');

// Workflows that contain an aggregate gate job but intentionally do NOT have
// that gate exercised by this fixture suite. Keep this empty unless a new
// gate really cannot be covered — every entry needs a reason so the NEXT
// gate cannot be forgotten silently.
const IGNORED_GATE_WORKFLOWS = new Map([
	// No ignored workflows today.
]);

const workflowFiles = readdirSync(workflowsDirectory)
	.filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
	.filter((file) => {
		if (IGNORED_GATE_WORKFLOWS.has(file)) {
			return false;
		}

		const document = parse(
			readFileSync(path.join(workflowsDirectory, file), 'utf8'),
		);
		const gateSteps = document?.jobs?.gate?.steps;

		if (!Array.isArray(gateSteps)) {
			return false;
		}

		return gateSteps.some(
			(step) => step?.env?.NEEDS_JSON === '${{ toJSON(needs) }}',
		);
	})
	.sort();

assert.ok(
	workflowFiles.length > 0,
	'expected at least one workflow with a gate job wiring NEEDS_JSON',
);
assert.ok(
	workflowFiles.includes('quality-gate.yml'),
	'ci-gate-aggregation: quality-gate.yml must be exercised (see #803 / PR #1156 R2)',
);

/**
 * Parses a real workflow file and returns the `run:` body of the `gate`
 * job's step that wires `env.NEEDS_JSON: ${{ toJSON(needs) }}` — the same
 * step scripts/check-ci-gate-structure.mjs pins structurally.
 */
// @ts-expect-error rung-0: add proper type in later rung
const extractGateStepRun = (file) => {
	const document = parse(
		readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8'),
	);
	const gateSteps = document.jobs.gate.steps;
	const step = gateSteps.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(s) => s?.env?.NEEDS_JSON === '${{ toJSON(needs) }}',
	);

	assert.ok(
		step,
		`${file}: expected a gate step with env.NEEDS_JSON: \${{ toJSON(needs) }}`,
	);
	assert.equal(
		typeof step.run,
		'string',
		`${file}: expected step.run to be a string`,
	);

	return step.run;
};

/**
 * Executes `script` exactly as GitHub Actions would (`bash -e -c`), with
 * NEEDS_JSON set to the raw text `needsJson`. Returns { status, stdout,
 * stderr } — `spawnSync` (not `execFileSync`) so a nonzero exit is data,
 * not a thrown exception.
 */
// @ts-expect-error rung-0: add proper type in later rung
const runGateScript = (script, needsJson) =>
	spawnSync('bash', ['-e', '-c', script], {
		encoding: 'utf8',
		env: { ...process.env, NEEDS_JSON: needsJson },
	});

/**
 * The full result-shape matrix. `expectPass: true` means the gate must exit
 * 0; `false` means it must exit nonzero. Every case that reaches the
 * relevant-correlation logic supplies a `changes` entry with its own
 * `result` and `outputs.relevant`, exactly like the real `toJSON(needs)`
 * payload — the shape this step actually reads at runtime.
 */
const CASES = [
	// --- shape validation: malformed/absent NEEDS_JSON must never pass ---
	{ name: 'empty object (examined zero jobs)', json: '{}', expectPass: false },
	{
		name: 'empty array (not an object at all)',
		json: '[]',
		expectPass: false,
	},
	{ name: 'JSON null', json: 'null', expectPass: false },
	{
		name: 'a JSON string, not an object',
		json: '"oops"',
		expectPass: false,
	},
	{
		name: 'malformed JSON (jq itself errors)',
		json: '{not valid',
		expectPass: false,
	},

	// --- ROUND 4: needs.changes.result must be exactly "success" ---
	{
		name: 'ROUND 4: changes missing entirely (no changes key at all)',
		json: '{"verify":{"result":"success"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: changes present but skipped',
		json: '{"changes":{"result":"skipped","outputs":{"relevant":"true"}},"verify":{"result":"success"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: changes present but failed',
		json: '{"changes":{"result":"failure","outputs":{"relevant":"true"}},"verify":{"result":"success"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: changes present but cancelled',
		json: '{"changes":{"result":"cancelled","outputs":{"relevant":"true"}},"verify":{"result":"success"}}',
		expectPass: false,
	},

	// --- ROUND 4: needs.changes.outputs.relevant must be exactly "true"/"false" ---
	{
		name: 'ROUND 4: outputs object entirely absent',
		json: '{"changes":{"result":"success"},"verify":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: relevant output entirely absent from outputs',
		json: '{"changes":{"result":"success","outputs":{}},"verify":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: relevant output is an empty string',
		json: '{"changes":{"result":"success","outputs":{"relevant":""}},"verify":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: relevant output has the wrong case ("True")',
		json: '{"changes":{"result":"success","outputs":{"relevant":"True"}},"verify":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4: relevant output is a non-boolean-ish string ("maybe")',
		json: '{"changes":{"result":"success","outputs":{"relevant":"maybe"}},"verify":{"result":"success"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 4 BLOCKER (the exact reviewer reproduction): changes=success, relevant missing, heavy job skipped',
		json: '{"changes":{"result":"success","outputs":{}},"verify":{"result":"skipped"}}',
		expectPass: false,
	},

	// --- relevant=true: every required job must be success; skipped is no longer acceptable ---
	{
		name: 'relevant=true, the only required job succeeded',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":"success"}}',
		expectPass: true,
	},
	{
		name: 'relevant=true, multiple required jobs all succeeded',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"a":{"result":"success"},"b":{"result":"success"}}',
		expectPass: true,
	},
	{
		name: 'ROUND 4 BLOCKER: relevant=true but a required job was skipped (the previously fail-open shape)',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'relevant=true, a required job failed',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":"failure"}}',
		expectPass: false,
	},
	{
		name: 'relevant=true, a required job was cancelled',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":"cancelled"}}',
		expectPass: false,
	},
	{
		name: 'relevant=true, one job succeeded and a second was skipped (e.g. cascaded from an upstream failure)',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"a":{"result":"success"},"b":{"result":"skipped"}}',
		expectPass: false,
	},
	{
		name: 'relevant=true, a required job has a numeric result value instead of a string',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":200}}',
		expectPass: false,
	},
	{
		name: 'relevant=true, a required job has result: null',
		json: '{"changes":{"result":"success","outputs":{"relevant":"true"}},"verify":{"result":null}}',
		expectPass: false,
	},

	// --- relevant=false: required jobs may be success or skipped, but not failure/cancelled/unrecognized ---
	{
		name: 'relevant=false, all required jobs skipped (the ordinary verified-irrelevant-PR shape)',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"verify":{"result":"skipped"}}',
		expectPass: true,
	},
	{
		name: 'relevant=false, a required job still succeeded (e.g. an always-run job like e2e image cleanup)',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"verify":{"result":"success"}}',
		expectPass: true,
	},
	{
		name: 'relevant=false, mixed success and skipped required jobs',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"a":{"result":"success"},"b":{"result":"skipped"}}',
		expectPass: true,
	},
	{
		name: 'relevant=false, a required job failed anyway',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"verify":{"result":"failure"}}',
		expectPass: false,
	},
	{
		name: 'relevant=false, a required job was cancelled anyway',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"verify":{"result":"cancelled"}}',
		expectPass: false,
	},
	{
		name: 'relevant=false, a required job reports an unrecognized result value',
		json: '{"changes":{"result":"success","outputs":{"relevant":"false"}},"verify":{"result":"timed_out"}}',
		expectPass: false,
	},
];

for (const file of workflowFiles) {
	const script = extractGateStepRun(file);

	for (const { name, json, expectPass } of CASES) {
		test(`${file} gate: ${name} ${expectPass ? 'passes' : 'fails'}`, () => {
			const result = runGateScript(script, json);

			if (expectPass) {
				assert.equal(result.status, 0, result.stderr);
			} else {
				assert.notEqual(
					result.status,
					0,
					`expected nonzero exit; stdout: ${result.stdout}`,
				);
			}
		});
	}
}
