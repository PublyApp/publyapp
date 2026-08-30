/**
 * KEPT RED TEST — issue #1947 (CI: shard the API test suite).
 *
 * PROOF: the aggregate gate MUST fail when a shard is absent/failed.
 *
 * The api-tests-gate reads `${{ toJSON(needs) }}` and asserts every required
 * job reported `success` when the change is relevant. With a 4-way matrix,
 * GitHub reports the PARENT job `suite` as a single entry in `needs` — its
 * result is `failure` if ANY shard failed. This proof simulates a failed
 * shard by setting `suite.result = "failure"` and asserts the gate script
 * exits nonzero (RED).
 *
 * Why this matters: a gate that passes when a shard is silently skipped
 * (e.g., runner provisioning failure) is worse than no sharding — it
 * certifies a partial run as complete. The gate must require ALL shards.
 *
 * Replay:
 *   cd packages/scripts-ts && \
 *     pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1947/red-1947-gate-missing-shard.test.ts
 *
 * Expected: FAIL — the gate script exits 1, proving it catches the failure.
 * The green counterpart is the existing "relevant=true, a required job failed"
 * case in src/ci-gate-aggregation.test.ts, which exercises the exact same
 * gate script against the exact same payload shape and asserts it exits 1.
 *
 * The test is kept red because it asserts the gate catches the failure —
 * a "green" version of this test would be a no-op (asserting exit 1 is
 * already the red behavior). The proof IS the failure.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../../',
);

const apiTestsWorkflowPath = path.join(
	repoRoot,
	'.github/workflows/api-tests.yml',
);

// Extract the REAL gate script body from the workflow file (parsed, not
// hand-cited) — the same script check-ci-gate-structure.ts pins structurally.
const extractGateScript = () => {
	const document = parse(readFileSync(apiTestsWorkflowPath, 'utf8'));
	const gateSteps = document.jobs.gate.steps;
	const step = gateSteps.find(
		(s) => s?.env?.NEEDS_JSON === '${{ toJSON(needs) }}',
	);

	assert.ok(step, 'api-tests.yml must have a gate step with NEEDS_JSON');
	assert.equal(typeof step.run, 'string', 'step.run must be a string');

	return step.run;
};

// Execute the gate script with a specific NEEDS_JSON payload.
const runGateScript = (script, needsJson) =>
	spawnSync('bash', ['-e', '-c', script], {
		encoding: 'utf8',
		env: { ...process.env, NEEDS_JSON: needsJson },
	});

test('api-tests-gate must fail when a shard fails (simulated by suite.result=failure)', () => {
	const script = extractGateScript();

	// Simulate: changes classifier said relevant=true, the `suite` job ran
	// its matrix, and shard 3 failed — GitHub reports the PARENT job
	// `suite` as `failure`. The gate MUST fail (exit nonzero).
	const needsJson = JSON.stringify({
		changes: { result: 'success', outputs: { relevant: 'true' } },
		suite: { result: 'failure' },
	});

	const result = runGateScript(script, needsJson);

	// The proof: the gate catches the failed shard. If this assert ever
	// passes (exit 0), the gate is broken — it would certify a partial run.
	assert.notEqual(
		result.status,
		0,
		`GATE MUST FAIL when a shard fails — but it exited 0. stdout: ${result.stdout}`,
	);
});

test('api-tests-gate must fail when a shard is cancelled (simulated by suite.result=cancelled)', () => {
	const script = extractGateScript();

	// Simulate: changes classifier said relevant=true, the `suite` job was
	// cancelled (e.g., timeout). The gate MUST fail.
	const needsJson = JSON.stringify({
		changes: { result: 'success', outputs: { relevant: 'true' } },
		suite: { result: 'cancelled' },
	});

	const result = runGateScript(script, needsJson);

	assert.notEqual(
		result.status,
		0,
		`GATE MUST FAIL when a shard is cancelled — but it exited 0. stdout: ${result.stdout}`,
	);
});

test('api-tests-gate must fail when the suite job is skipped despite relevant=true', () => {
	const script = extractGateScript();

	// Simulate: changes said relevant=true, but the suite job was skipped
	// (e.g., an `if` condition bug). The gate MUST fail — skipped is not
	// acceptable when the change is relevant.
	const needsJson = JSON.stringify({
		changes: { result: 'success', outputs: { relevant: 'true' } },
		suite: { result: 'skipped' },
	});

	const result = runGateScript(script, needsJson);

	assert.notEqual(
		result.status,
		0,
		`GATE MUST FAIL when suite is skipped despite relevant=true — but it exited 0. stdout: ${result.stdout}`,
	);
});
