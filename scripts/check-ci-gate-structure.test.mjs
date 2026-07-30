import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findCiGateStructureProblems } from './check-ci-gate-structure.mjs';

// These tests are the standing proof that the #1017 aggregate-gate job graph
// — the `needs`/`if`/`permissions`/`outputs`/`id`/`name`/trigger wiring that
// carries this whole feature's safety property, and which
// scripts/check-ci-drift.mjs does not hash — actually gets pinned. Every
// failure mode either review round called out gets exercised against a
// throwaway fixture, so this guard cannot rot into one that always returns
// green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

/** A minimal but real, correctly-shaped fixture workflow, as YAML text. */
const goodWorkflow = `
name: fixture
on:
  pull_request:
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      relevant: \${{ steps.filter.outputs.relevant }}
    steps:
      - name: filter
        id: filter
        run: echo "relevant=true" >> "$GITHUB_OUTPUT"
  heavy:
    needs: changes
    if: needs.changes.outputs.relevant == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo heavy
  gate:
    name: fixture-gate
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
`;

const fixtureConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
	},
];

/** Writes `workflowYaml` as .github/workflows/fixture.yml in a throwaway repo. */
const buildFixture = async (workflowYaml) => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-ci-gate-structure-'),
	);

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflowYaml,
	);

	return rootDir;
};

test('passes a correctly-shaped job graph', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

test("BLOCKER analogue: a job dropped from the gate's needs is caught even if the shell body still reads it", async () => {
	// This is the round-1 review's concrete example: `needs.job.result` in the
	// gate's shell body silently becomes an empty string if `job` is removed
	// from `needs`, which the loop treats as neither failure nor cancelled.
	// The structural guard catches the `needs` removal itself, independent of
	// what the shell body still references.
	const broken = goodWorkflow.replace(
		'needs: [changes, heavy]',
		'needs: [changes]',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate.*needs.*must include every other job/s);
	assert.match(findings[0], /Missing: \[heavy\]/);
});

test('fails when gate.if stops being always()', async () => {
	const broken = goodWorkflow.replace(
		'if: always()\n    needs: [changes, heavy]',
		'if: success()\n    needs: [changes, heavy]',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate: expected `if: always\(\)`/);
});

test('fails when a relevance-gated job loses its relevance condition', async () => {
	const broken = `
name: fixture
on:
  pull_request:
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      relevant: \${{ steps.filter.outputs.relevant }}
    steps:
      - name: filter
        id: filter
        run: echo "relevant=true" >> "$GITHUB_OUTPUT"
  heavy:
    needs: changes
    runs-on: ubuntu-latest
    steps:
      - run: echo heavy
  gate:
    name: fixture-gate
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
`;
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /heavy: expected `if:/);
});

test('fails when a relevance-gated job loses part of its needs', async () => {
	const config = [
		{
			file: 'fixture.yml',
			changesJob: 'changes',
			gateJob: 'gate',
			gateName: 'fixture-gate',
			relevanceGatedJobs: [
				{ id: 'heavy', needs: ['changes', 'some-other-job'] },
			],
			alwaysJobs: [],
		},
	];
	const rootDir = await buildFixture(goodWorkflow);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: config,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/heavy: expected `needs` to be exactly \[changes, some-other-job\]/,
	);
});

test('fails when the changes job loses its pull-requests: read permission', async () => {
	const broken = goodWorkflow.replace('      pull-requests: read\n', '');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/changes: must declare `permissions: \{ pull-requests: read \}/,
	);
});

test('fails when the changes job loses its contents: read permission (round 2: unspecified permissions become none)', async () => {
	const broken = goodWorkflow.replace('      contents: read\n', '');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/changes: must declare `permissions: \{ contents: read \}/,
	);
});

test('fails when the changes job becomes conditional (would no longer always report)', async () => {
	const broken = goodWorkflow.replace(
		'changes:\n    runs-on: ubuntu-latest',
		"changes:\n    if: github.event_name == 'push'\n    runs-on: ubuntu-latest",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: must be unconditional/);
});

test('fails when the changes job output stops matching the classifier step', async () => {
	const broken = goodWorkflow.replace(
		'relevant: \${{ steps.filter.outputs.relevant }}',
		'relevant: \${{ steps.wrong.outputs.relevant }}',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: expected `outputs.relevant`/);
});

test('ROUND 2 BLOCKER: renaming the classifier step\'s id away from "filter" is caught even though outputs.relevant is untouched', async () => {
	// The round-2 finding: outputs.relevant still literally reads
	// "steps.filter.outputs.relevant" (so the previous check sees no
	// difference), but at runtime that reference resolves empty because no
	// step has id: filter anymore. Only checking that the id actually exists
	// as a step catches this.
	const broken = goodWorkflow.replace(
		'      - name: filter\n        id: filter\n',
		'      - name: filter\n        id: attacker\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: expected a step with `id: filter`/);
});

test("ROUND 2: renaming the gate job's externally-required name is caught", async () => {
	const broken = goodWorkflow.replace(
		'name: fixture-gate',
		'name: renamed-gate',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate: expected `name: fixture-gate`/);
});

test('ROUND 2: restoring a pull_request.paths filter recreates the pending-check deadlock and is caught', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n',
		"on:\n  pull_request:\n    paths:\n      - 'apps/front/**'\n",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/expected an unconditional `pull_request:` trigger/,
	);
	assert.match(findings[0], /\["paths"\]/);
});

test('ROUND 3 BLOCKER: a paths-ignore filter is caught (not just paths)', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n',
		"on:\n  pull_request:\n    paths-ignore:\n      - '**'\n",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /\["paths-ignore"\]/);
});

test('ROUND 3 BLOCKER: a types filter (e.g. closed-only) is caught', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n',
		'on:\n  pull_request:\n    types: [closed]\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /\["types"\]/);
});

test('ROUND 3 BLOCKER: removing the pull_request key entirely (e.g. swapped to workflow_dispatch) is caught', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n',
		'on:\n  workflow_dispatch:\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /the trigger has no pull_request key at all/);
});

test('ROUND 3: array-shorthand `on: [pull_request, push]` is accepted as unconditional', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n',
		'on: [pull_request, push]\n',
	);
	const rootDir = await buildFixture(broken);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

test('ROUND 2 BLOCKER: a job added to gate.needs but omitted from a hand-written result map is impossible by construction, and its absence from the toJSON(needs) wiring is caught', async () => {
	// The round-2 finding: "Add a failed job, include it in gate.needs, but
	// omit it from the hand-written Bash result map." The fix removes the
	// hand-written map entirely (the gate step reads `${{ toJSON(needs) }}`,
	// which Actions populates from `needs:` itself — there is no second list
	// to omit an entry from). This test proves the guard actually requires
	// that wiring to exist, so a regression back to a hand-maintained map
	// is caught structurally, not just via the drift-hash on the step body.
	const broken = goodWorkflow.replace(
		'      - name: Check required jobs\n        env:\n          NEEDS_JSON: \${{ toJSON(needs) }}\n        run: echo "$NEEDS_JSON"\n',
		'      - name: Check required jobs\n        run: |\n          echo "${{ needs.changes.result }}"\n          echo "${{ needs.heavy.result }}"\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate: expected a step with `env.NEEDS_JSON/);
});

test('ROUND 4 BLOCKER: continue-on-error on a verification job itself is caught', async () => {
	const broken = goodWorkflow.replace(
		'heavy:\n    needs: changes',
		'heavy:\n    continue-on-error: true\n    needs: changes',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/heavy: verification jobs must not set `continue-on-error`/,
	);
});

test('ROUND 4 BLOCKER: continue-on-error on a step inside a verification job is caught even though the job itself, the drift hash aside, looks unchanged', async () => {
	const broken = goodWorkflow.replace(
		"  heavy:\n    needs: changes\n    if: needs.changes.outputs.relevant == 'true'\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo heavy\n",
		"  heavy:\n    needs: changes\n    if: needs.changes.outputs.relevant == 'true'\n    runs-on: ubuntu-latest\n    steps:\n      - name: Run verification\n        continue-on-error: true\n        run: echo heavy\n",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/heavy: step "Run verification" sets `continue-on-error`/,
	);
});

// ---------------------------------------------------------------------------
// ROUND 4: matrix + denominator pinning (front-e2e.yml's sharded `test` job).
// A fixture separate from goodWorkflow/fixtureConfig above, since only
// front-e2e.yml declares a `matrix` config entry.
// ---------------------------------------------------------------------------

const matrixDenominator = 4;

/** A correctly-shaped fixture workflow with a 4-shard matrixed job. */
const matrixWorkflow = `
name: fixture
on:
  pull_request:
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      relevant: \${{ steps.filter.outputs.relevant }}
    steps:
      - name: filter
        id: filter
        run: echo "relevant=true" >> "$GITHUB_OUTPUT"
  test:
    name: front-e2e (\${{ matrix.shard }}/${matrixDenominator})
    needs: changes
    if: needs.changes.outputs.relevant == 'true'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - name: Run playwright browser tests
        run: |
          pnpm test --shard=\${{ matrix.shard }}/${matrixDenominator}
          if [ "\${{ matrix.shard }}" = "${matrixDenominator}" ]; then
            echo "last shard"
          fi
      - name: Upload playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: front-e2e-playwright-report-\${{ matrix.shard }}-of-${matrixDenominator}
  gate:
    name: fixture-gate
    if: always()
    needs: [changes, test]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
`;

const matrixFixtureConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		relevanceGatedJobs: [{ id: 'test', needs: ['changes'] }],
		alwaysJobs: [],
		matrix: { jobId: 'test', key: 'shard', expected: [1, 2, 3, 4] },
	},
];

test('ROUND 4: a correctly-shaped 4-shard matrix passes', async () => {
	const rootDir = await buildFixture(matrixWorkflow);

	assert.deepEqual(
		await findCiGateStructureProblems({
			rootDir,
			workflows: matrixFixtureConfig,
		}),
		[],
	);
});

test('ROUND 4 BLOCKER: narrowing the matrix from 4 shards to 1 is caught', async () => {
	const broken = matrixWorkflow.replace('shard: [1, 2, 3, 4]', 'shard: [1]');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected `strategy.matrix.shard` to be exactly \[1,2,3,4\]/,
	);
});

test('ROUND 4 BLOCKER: the job name denominator drifting from the matrix length independently is caught', async () => {
	const broken = matrixWorkflow.replace(
		'name: front-e2e (${{ matrix.shard }}/4)',
		'name: front-e2e (${{ matrix.shard }}/3)',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected `name: front-e2e \(\$\{\{ matrix\.shard \}\}\/4\)`/,
	);
});

test('ROUND 4 BLOCKER: the shard flag denominator drifting from the matrix length independently is caught', async () => {
	const broken = matrixWorkflow.replace(
		'--shard=${{ matrix.shard }}/4',
		'--shard=${{ matrix.shard }}/3',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected a step invoking Playwright with `--shard=\$\{\{ matrix\.shard \}\}\/4`/,
	);
});

test('ROUND 4 BLOCKER: the last-shard hermetic-counter check drifting from the matrix length independently is caught', async () => {
	const broken = matrixWorkflow.replace(
		'if [ "${{ matrix.shard }}" = "4" ]',
		'if [ "${{ matrix.shard }}" = "3" ]',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected the shard-flag step to also gate the hermetic-counter run on `if \[ "\$\{\{ matrix\.shard \}\}" = "4" \]`/,
	);
});

test('ROUND 4 BLOCKER: the uploaded report name denominator drifting from the matrix length independently is caught', async () => {
	const broken = matrixWorkflow.replace(
		'front-e2e-playwright-report-${{ matrix.shard }}-of-4',
		'front-e2e-playwright-report-${{ matrix.shard }}-of-3',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected the Playwright report upload's `with\.name` to be `front-e2e-playwright-report-\$\{\{ matrix\.shard \}\}-of-4`/,
	);
});

test("the repo's own aggregate-gate workflows have the required job graph", async () => {
	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir: repoRoot }),
		[],
	);
});
