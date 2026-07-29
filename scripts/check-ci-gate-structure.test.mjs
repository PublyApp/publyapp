import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findCiGateStructureProblems } from './check-ci-gate-structure.mjs';

// These tests are the standing proof that the #1017 aggregate-gate job graph
// — the `needs`/`if`/`permissions`/`outputs` wiring that carries this whole
// feature's safety property, and which scripts/check-ci-drift.mjs does not
// hash — actually gets pinned. Every failure mode the review called out gets
// exercised against a throwaway fixture, so this guard cannot rot into one
// that always returns green.

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
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - run: echo gate
`;

const fixtureConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
	},
];

/** Writes `workflowYaml` as .github/workflows/fixture.yml in a throwaway repo. */
const buildFixture = async (workflowYaml) => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ci-gate-structure-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await writeFile(path.join(rootDir, '.github/workflows/fixture.yml'), workflowYaml);

	return rootDir;
};

test('passes a correctly-shaped job graph', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

test('BLOCKER analogue: a job dropped from the gate\'s needs is caught even if the shell body still reads it', async () => {
	// This is the review's concrete example: `needs.job.result` in the gate's
	// shell body silently becomes an empty string if `job` is removed from
	// `needs`, which the loop treats as neither failure nor cancelled. The
	// structural guard catches the `needs` removal itself, independent of
	// what the shell body still references.
	const broken = goodWorkflow.replace('needs: [changes, heavy]', 'needs: [changes]');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate.*needs.*must include every other job/s);
	assert.match(findings[0], /Missing: \[heavy\]/);
});

test('fails when gate.if stops being always()', async () => {
	const broken = goodWorkflow.replace('if: always()\n    needs: [changes, heavy]', "if: success()\n    needs: [changes, heavy]");
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

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
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - run: echo gate
`;
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /heavy: expected `if:/);
});

test('fails when a relevance-gated job loses part of its needs', async () => {
	const config = [
		{
			file: 'fixture.yml',
			changesJob: 'changes',
			gateJob: 'gate',
			relevanceGatedJobs: [{ id: 'heavy', needs: ['changes', 'some-other-job'] }],
			alwaysJobs: [],
		},
	];
	const rootDir = await buildFixture(goodWorkflow);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: config });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /heavy: expected `needs` to be exactly \[changes, some-other-job\]/);
});

test('fails when the changes job loses its pull-requests: read permission', async () => {
	const broken = goodWorkflow.replace('permissions:\n      pull-requests: read\n    ', '');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: must declare `permissions/);
});

test('fails when the changes job becomes conditional (would no longer always report)', async () => {
	const broken = goodWorkflow.replace(
		'changes:\n    runs-on: ubuntu-latest',
		"changes:\n    if: github.event_name == 'push'\n    runs-on: ubuntu-latest",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: must be unconditional/);
});

test('fails when the changes job output stops matching the classifier step', async () => {
	const broken = goodWorkflow.replace(
		'relevant: \${{ steps.filter.outputs.relevant }}',
		'relevant: \${{ steps.wrong.outputs.relevant }}',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /changes: expected `outputs.relevant`/);
});

test("the repo's own aggregate-gate workflows have the required job graph", async () => {
	assert.deepEqual(await findCiGateStructureProblems({ rootDir: repoRoot }), []);
});
