import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
// The fix inverts the check to a known-GOOD allowlist (success/skipped) and
// adds explicit type/emptiness checks, so every one of these shapes is red.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

const workflowFiles = [
	'front-e2e.yml',
	'front-ci.yml',
	'openapi-spec-drift.yml',
	'docs-archive.yml',
];

/**
 * Parses a real workflow file and returns the `run:` body of the `gate`
 * job's step that wires `env.NEEDS_JSON: ${{ toJSON(needs) }}` — the same
 * step scripts/check-ci-gate-structure.mjs pins structurally.
 */
const extractGateStepRun = (file) => {
	const document = parse(
		readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8'),
	);
	const gateSteps = document.jobs.gate.steps;
	const step = gateSteps.find(
		(s) => s?.env?.NEEDS_JSON === '${{ toJSON(needs) }}',
	);

	assert.ok(
		step,
		`${file}: expected a gate step with env.NEEDS_JSON: \${{ toJSON(needs) }}`,
	);
	assert.equal(typeof step.run, 'string', `${file}: expected step.run to be a string`);

	return step.run;
};

/**
 * Executes `script` exactly as GitHub Actions would (`bash -e -c`), with
 * NEEDS_JSON set to the raw text `needsJson`. Returns { status, stdout,
 * stderr } — `spawnSync` (not `execFileSync`) so a nonzero exit is data,
 * not a thrown exception.
 */
const runGateScript = (script, needsJson) =>
	spawnSync('bash', ['-e', '-c', script], {
		encoding: 'utf8',
		env: { ...process.env, NEEDS_JSON: needsJson },
	});

/**
 * The full result-shape matrix: every documented GitHub result value in
 * every relevant combination, plus every fail-open shape round 3 found.
 * `expectPass: true` means the gate must exit 0; `false` means it must
 * exit nonzero. This mirrors (a representative subset of) the reviewer's
 * manual 304-combination sweep, plus the specific shapes that were
 * previously fail-open.
 */
const CASES = [
	{ name: 'all success', json: '{"a":{"result":"success"},"b":{"result":"success"}}', expectPass: true },
	{ name: 'success + skipped', json: '{"a":{"result":"success"},"b":{"result":"skipped"}}', expectPass: true },
	{ name: 'all skipped', json: '{"a":{"result":"skipped"},"b":{"result":"skipped"}}', expectPass: true },
	{ name: 'single skipped', json: '{"a":{"result":"skipped"}}', expectPass: true },
	{ name: 'one failure', json: '{"a":{"result":"failure"}}', expectPass: false },
	{ name: 'one cancelled', json: '{"a":{"result":"cancelled"}}', expectPass: false },
	{ name: 'success mixed with failure', json: '{"a":{"result":"success"},"b":{"result":"failure"}}', expectPass: false },
	{ name: 'success mixed with cancelled', json: '{"a":{"result":"success"},"b":{"result":"cancelled"}}', expectPass: false },
	{ name: 'skipped mixed with failure', json: '{"a":{"result":"skipped"},"b":{"result":"failure"}}', expectPass: false },
	{
		name: 'ROUND 3: empty object (examined zero jobs)',
		json: '{}',
		expectPass: false,
	},
	{
		name: 'ROUND 3: empty array (not an object at all)',
		json: '[]',
		expectPass: false,
	},
	{
		name: 'ROUND 3: entry missing .result entirely',
		json: '{"a":{"outputs":{}}}',
		expectPass: false,
	},
	{
		name: 'ROUND 3: unrecognized result value (timed_out)',
		json: '{"a":{"result":"timed_out"}}',
		expectPass: false,
	},
	{
		name: 'ROUND 3: numeric result value',
		json: '{"a":{"result":200}}',
		expectPass: false,
	},
	{ name: 'ROUND 3: JSON null', json: 'null', expectPass: false },
	{ name: 'ROUND 3: a JSON string, not an object', json: '"oops"', expectPass: false },
	{
		name: 'ROUND 3: malformed JSON (jq itself errors)',
		json: '{not valid',
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
				assert.notEqual(result.status, 0, `expected nonzero exit; stdout: ${result.stdout}`);
			}
		});
	}
}
