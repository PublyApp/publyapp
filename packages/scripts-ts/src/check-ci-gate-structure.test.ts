import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	EXPECTED_PINNED_TEST_FILES,
	findCiGateStructureProblems,
	findPinnedTestFilesProblems,
	findRequiredContextCollisionProblems,
	GATE_WORKFLOWS,
} from './check-ci-gate-structure.ts';

// These tests are the standing proof that the #1017 aggregate-gate job graph
// — the `needs`/`if`/`permissions`/`outputs`/`id`/`name`/trigger wiring that
// carries this whole feature's safety property, and which
// scripts/check-ci-drift.mjs does not hash — actually gets pinned. Every
// failure mode either review round called out gets exercised against a
// throwaway fixture, so this guard cannot rot into one that always returns
// green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

/** A minimal but real, correctly-shaped fixture workflow, as YAML text. */
const goodWorkflow = `
name: fixture
on:
  pull_request:
  merge_group:
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
    name: \${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        id: check-required-jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
      - name: Verify outcome
        if: always()
        run: |
          outcome="\${{ steps.check-required-jobs.outcome }}"
          if [ "$outcome" != "success" ]; then
            exit 1
          fi
`;

const fixtureConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		pushCheckName: 'fixture-push-check',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
	},
];

/** Writes `workflowYaml` as .github/workflows/fixture.yml in a throwaway repo. */
// @ts-expect-error rung-0: add proper type in later rung
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
  merge_group:
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
    name: \${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        id: check-required-jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
      - name: Verify outcome
        if: always()
        run: |
          outcome="\${{ steps.check-required-jobs.outcome }}"
          if [ "$outcome" != "success" ]; then
            exit 1
          fi
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
			pushCheckName: 'fixture-push-check',
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
		'relevant: ${{ steps.filter.outputs.relevant }}',
		'relevant: ${{ steps.wrong.outputs.relevant }}',
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
		"name: ${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}",
		'name: renamed-gate',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate: expected `name: /);
	assert.match(findings[0], /fixture-push-check/);
	assert.match(findings[0], /found "renamed-gate"/);
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

	// Round 6 added a second, independent finding for the same mutation: the
	// `workflow_dispatch` event is not on the gate workflows' allowed list at
	// all (see the round-6 event-allowlist tests below).
	assert.equal(findings.length, 2);
	assert.ok(
		findings.some((finding) =>
			/the trigger has no pull_request key at all/.test(finding),
		),
	);
	assert.ok(
		findings.some((finding) =>
			/may declare only .* found the additional event\(s\) \["workflow_dispatch"\]/.test(
				finding,
			),
		),
	);
});

test('ROUND 3: array-shorthand `on: [pull_request, push]` is accepted as unconditional', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n  merge_group:\n',
		'on: [pull_request, merge_group, push]\n',
	);
	const rootDir = await buildFixture(broken);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

// ---------------------------------------------------------------------------
// ROUND 4 BLOCKER: `merge_group:` must be present and unconditional, for the
// same reason `pull_request:` must be — GitHub documents that a required
// Actions check missing this event waits forever once its PR reaches a
// merge queue, reproducing the exact missing-check deadlock #1017 removes,
// just under a different trigger.
// ---------------------------------------------------------------------------

test('ROUND 4 BLOCKER: removing the merge_group key entirely is caught', async () => {
	const broken = goodWorkflow.replace('  merge_group:\n', '');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /the trigger has no merge_group key at all/);
});

test('ROUND 4 BLOCKER: a merge_group `types:` restriction is caught (not just an unrestricted key)', async () => {
	const broken = goodWorkflow.replace(
		'  merge_group:\n',
		'  merge_group:\n    types: [checks_requested]\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /expected an unconditional `merge_group:` trigger/);
	assert.match(findings[0], /\["types"\]/);
});

test('ROUND 4: array-shorthand `on: [pull_request, merge_group]` accepts merge_group as unconditional too', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n  merge_group:\n',
		'on: [pull_request, merge_group]\n',
	);
	const rootDir = await buildFixture(broken);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

// ---------------------------------------------------------------------------
// ROUND 6 BLOCKER (mutation A, the exact reviewer reproduction): the round-5
// gate `name:` expression excluded only `push`, so EVERY other event
// resolved to the externally required check name. Adding `workflow_dispatch:`
// to a gate workflow's `on:` therefore created a second reporter of that
// required context for the same commit (a manual run takes a branch/tag ref
// and uses its last commit as GITHUB_SHA), and both enforced guards stayed
// green. Two independent layers now catch it.
// ---------------------------------------------------------------------------

test('ROUND 6 BLOCKER (mutation A, layer 1): an extra `workflow_dispatch:` trigger on a gate workflow is caught', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n  merge_group:\n',
		'on:\n  pull_request:\n  merge_group:\n  workflow_dispatch:\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /may declare only/);
	assert.match(findings[0], /\["workflow_dispatch"\]/);
});

test('ROUND 6 BLOCKER (mutation A, layer 1): an extra event in the `on: [...]` array shorthand is caught too', async () => {
	const broken = goodWorkflow.replace(
		'on:\n  pull_request:\n  merge_group:\n',
		'on: [pull_request, merge_group, schedule]\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /may declare only/);
	assert.match(findings[0], /\["schedule"\]/);
});

test('ROUND 6 BLOCKER (mutation A, layer 2): the round-5 `!= push` name expression is rejected, because every non-push event resolved to the required name', async () => {
	// The independent half of the fix: even if the event allowlist above were
	// widened, the gate's `name:` must resolve the required context name for
	// `pull_request`/`merge_group` and NOTHING else. This is the exact
	// expression that shipped at the round-6 head.
	const broken = goodWorkflow.replace(
		"name: ${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}",
		"name: ${{ github.event_name == 'push' && 'fixture-push-check' || 'fixture-gate' }}",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /gate: expected `name: /);
	assert.match(
		findings[0],
		/ONLY for pull_request\/merge_group runs, and the non-required `fixture-push-check` for every other event/,
	);
	assert.match(findings[0], /found "\$\{\{ github\.event_name == 'push'/);
});

test('ROUND 6: `push` remains an allowed gate-workflow trigger (three of the four real gate workflows declare it)', async () => {
	const withPush = goodWorkflow.replace(
		'on:\n  pull_request:\n  merge_group:\n',
		'on:\n  pull_request:\n  merge_group:\n  push:\n',
	);
	const rootDir = await buildFixture(withPush);

	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir, workflows: fixtureConfig }),
		[],
	);
});

// ---------------------------------------------------------------------------
// IMPORTANT: `selfTestCoverage` — pins that front-ci.yml's classifier
// pattern (the thing that decides whether the new `gate-selftest` job wakes
// up) actually matches every workflow/script path the guard's own tests
// parse/assert against, so narrowing it back to just one workflow file
// silently reintroduces the "unenforced on the server" gap.
// ---------------------------------------------------------------------------

/** A fixture workflow using the REAL `node "$CLASSIFIER" '<pattern>'` shape. */
// @ts-expect-error rung-0: add proper type in later rung
const selfTestCoverageWorkflow = (pattern) => `
name: fixture
on:
  pull_request:
  merge_group:
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
        run: |
          CLASSIFIER=base-ref/scripts/ci-changed-paths.mjs
          if [ -f "$CLASSIFIER" ]; then
            node "$CLASSIFIER" '${pattern}'
          else
            echo "relevant=true" >> "$GITHUB_OUTPUT"
          fi
  heavy:
    needs: changes
    if: needs.changes.outputs.relevant == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo heavy
  gate:
    name: \${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        id: check-required-jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
      - name: Verify outcome
        if: always()
        run: |
          outcome="\${{ steps.check-required-jobs.outcome }}"
          if [ "$outcome" != "success" ]; then
            exit 1
          fi
`;

// @ts-expect-error rung-0: add proper type in later rung
const selfTestCoverageConfig = (selfTestCoverage) => [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		pushCheckName: 'fixture-push-check',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
		selfTestCoverage,
	},
];

test('IMPORTANT: a classifier pattern covering every required path passes', async () => {
	const rootDir = await buildFixture(
		selfTestCoverageWorkflow('^(scripts/|\\.github/workflows/(a|b)\\.yml$)'),
	);

	assert.deepEqual(
		await findCiGateStructureProblems({
			rootDir,
			workflows: selfTestCoverageConfig([
				'.github/workflows/a.yml',
				'.github/workflows/b.yml',
				'scripts/some-guard-script.mjs',
			]),
		}),
		[],
	);
});

test('IMPORTANT BLOCKER: a classifier pattern narrowed back to a single workflow file is caught', async () => {
	// Exactly the round-4 regression this guards against: the pattern only
	// covers "a.yml" (as if front-ci.yml's classifier had been narrowed back
	// to matching only itself), so a change to the guarded "b.yml" would
	// never wake the self-test job even though check-ci-gate-structure.mjs
	// still asserts against it.
	const rootDir = await buildFixture(
		selfTestCoverageWorkflow('^\\.github/workflows/a\\.yml$'),
	);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: selfTestCoverageConfig([
			'.github/workflows/a.yml',
			'.github/workflows/b.yml',
			'scripts/some-guard-script.mjs',
		]),
	});

	assert.equal(findings.length, 2);
	assert.ok(
		findings.every((finding) =>
			/the classifier pattern must match/.test(finding),
		),
	);
	assert.ok(findings.some((finding) => finding.includes('b.yml')));
	assert.ok(
		findings.some((finding) => finding.includes('some-guard-script.mjs')),
	);
});

test('IMPORTANT: a workflow with no selfTestCoverage configured is skipped by this check entirely', async () => {
	// front-e2e.yml, openapi-spec-drift.yml, and docs-archive.yml do not
	// declare selfTestCoverage (only front-ci.yml hosts gate-selftest), so
	// this must be a no-op for them regardless of their classifier pattern.
	const rootDir = await buildFixture(
		selfTestCoverageWorkflow('^this-matches-nothing-relevant$'),
	);

	assert.deepEqual(
		await findCiGateStructureProblems({
			rootDir,
			workflows: selfTestCoverageConfig(undefined),
		}),
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
		'      - name: Check required jobs\n        id: check-required-jobs\n        env:\n          NEEDS_JSON: ${{ toJSON(needs) }}\n        run: echo "$NEEDS_JSON"\n',
		'      - name: Check required jobs\n        run: |\n          echo "${{ needs.changes.result }}"\n          echo "${{ needs.heavy.result }}"\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 2);
	assert.ok(
		findings.some((finding) =>
			/gate: expected a step with `env.NEEDS_JSON/.test(finding),
		),
	);
	assert.ok(
		findings.some((finding) =>
			/gate: expected the required-jobs check step .* to carry `id: check-required-jobs`/.test(
				finding,
			),
		),
	);
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
// ROUND 5 BLOCKER: a job/workflow-level `defaults: run: shell: bash {0}`
// silently drops bash's implicit `-e`, letting a failed command in a
// multi-line `run:` block be masked by a later command's exit code.
// ---------------------------------------------------------------------------

test('ROUND 5 BLOCKER: a job-level `defaults:` override on a verification job is caught', async () => {
	const broken = goodWorkflow.replace(
		"  heavy:\n    needs: changes\n    if: needs.changes.outputs.relevant == 'true'\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo heavy\n",
		"  heavy:\n    needs: changes\n    if: needs.changes.outputs.relevant == 'true'\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: bash {0}\n    steps:\n      - run: echo heavy\n",
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/heavy: verification jobs must not set `defaults:`/,
	);
});

test('ROUND 5 BLOCKER: a workflow-level `defaults:` override is caught', async () => {
	const broken = goodWorkflow.replace(
		'name: fixture\non:',
		'name: fixture\ndefaults:\n  run:\n    shell: bash {0}\non:',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /expected no workflow-level `defaults:`/);
});

// ---------------------------------------------------------------------------
// ROUND 5 BLOCKER: the required gate job itself can mask its own aggregation
// failure the same way a verification job/step can — continue-on-error on
// the gate job, or on any of its steps (including "Check required jobs"
// itself), previously fell entirely outside the round-4 hard-reject (which
// was scoped only to relevanceGatedJobs).
// ---------------------------------------------------------------------------

test('ROUND 5 BLOCKER: continue-on-error on the gate job itself is caught', async () => {
	const broken = goodWorkflow.replace(
		'  gate:\n    name:',
		'  gate:\n    continue-on-error: true\n    name:',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/gate: the required gate job itself must not set `continue-on-error`/,
	);
});

test('ROUND 5 BLOCKER (the exact reviewer reproduction): continue-on-error on the "Check required jobs" step is caught', async () => {
	const broken = goodWorkflow.replace(
		'      - name: Check required jobs\n        id: check-required-jobs\n',
		'      - name: Check required jobs\n        id: check-required-jobs\n        continue-on-error: true\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/gate: step "Check required jobs" sets `continue-on-error`/,
	);
});

test('ROUND 5 BLOCKER: dropping the "Check required jobs" step\'s pinned id is caught', async () => {
	const broken = goodWorkflow.replace(
		'      - name: Check required jobs\n        id: check-required-jobs\n',
		'      - name: Check required jobs\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.ok(
		findings.some((finding) =>
			/expected the required-jobs check step .* to carry `id: check-required-jobs`/.test(
				finding,
			),
		),
	);
});

test('ROUND 5 BLOCKER: removing the outcome-verification step is caught (this is the real enforcement, not just the hard-reject above)', async () => {
	const broken = goodWorkflow.replace(
		'      - name: Verify outcome\n        if: always()\n        run: |\n          outcome="${{ steps.check-required-jobs.outcome }}"\n          if [ "$outcome" != "success" ]; then\n            exit 1\n          fi\n',
		'',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/gate: expected a step whose `run:` reads `steps\.check-required-jobs\.outcome`/,
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
  merge_group:
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
          set -euo pipefail

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
    name: \${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}
    if: always()
    needs: [changes, test]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        id: check-required-jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
      - name: Verify outcome
        if: always()
        run: |
          outcome="\${{ steps.check-required-jobs.outcome }}"
          if [ "$outcome" != "success" ]; then
            exit 1
          fi
`;

const matrixFixtureConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		pushCheckName: 'fixture-push-check',
		relevanceGatedJobs: [{ id: 'test', needs: ['changes'] }],
		alwaysJobs: [],
		matrix: { jobId: 'test', key: 'shard', expected: [1, 2, 3, 4], namePrefix: 'front-e2e' },
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

test('ROUND 5 BLOCKER (the exact reviewer reproduction): `matrix.exclude` removing shard combinations is caught even though `shard: [1, 2, 3, 4]` itself is untouched', async () => {
	const broken = matrixWorkflow.replace(
		'      matrix:\n        shard: [1, 2, 3, 4]\n',
		'      matrix:\n        shard: [1, 2, 3, 4]\n        exclude:\n          - shard: 2\n          - shard: 3\n          - shard: 4\n',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected `strategy\.matrix` to declare EXACTLY the one key `shard`/,
	);
	assert.match(findings[0], /"exclude"/);
});

test('ROUND 5 BLOCKER: the Playwright step missing `set -euo pipefail` is caught (defense against a job/workflow-level shell-default override)', async () => {
	const broken = matrixWorkflow.replace('          set -euo pipefail\n\n', '');
	const rootDir = await buildFixture(broken);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: matrixFixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/test: expected the Playwright step's `run:` to start with `set -euo pipefail`/,
	);
});

// ---------------------------------------------------------------------------
// ROUND 5 BLOCKER: `requiresSelfCheck` — front-ci-gate must independently
// re-run this very script as one of ITS OWN steps, so the decisive
// "gate.needs must equal every other job" check cannot be silently
// disconnected the way dropping gate-selftest from front-ci-gate's `needs`
// did (see check-ci-gate-structure.mjs's file-level comment).
// ---------------------------------------------------------------------------

const requiresSelfCheckConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		pushCheckName: 'fixture-push-check',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
		requiresSelfCheck: true,
	},
];

test('ROUND 5: a gate job that runs check-ci-gate-structure.mjs as one of its own steps satisfies requiresSelfCheck', async () => {
	const withSelfCheck = goodWorkflow.replace(
		'      - name: Check required jobs\n',
		'      - name: Verify the aggregate-gate job graph from inside the required job itself\n        run: node ./packages/scripts-ts/src/check-ci-gate-structure.ts\n      - name: Check required jobs\n',
	);
	const rootDir = await buildFixture(withSelfCheck);

	assert.deepEqual(
		await findCiGateStructureProblems({
			rootDir,
			// @ts-expect-error rung-0: TS2322
			workflows: requiresSelfCheckConfig,
		}),
		[],
	);
});

test('ROUND 5 BLOCKER (the exact reviewer reproduction, one level up): a gate job with no self-check step at all is caught', async () => {
	// This is the fixture-level analogue of the round-5 finding: gate-selftest
	// dropped from front-ci-gate's `needs` disconnects the only job that ran
	// this script server-side, and nothing in the required job itself
	// re-derives the same answer. `goodWorkflow` has no such step, so this
	// must fail when requiresSelfCheck is asked for.
	const rootDir = await buildFixture(goodWorkflow);

	const findings = await findCiGateStructureProblems({
		rootDir,
		// @ts-expect-error rung-0: TS2322
		workflows: requiresSelfCheckConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/gate: expected a step whose `run:` invokes `check-ci-gate-structure\.mjs` directly/,
	);
});

// ---------------------------------------------------------------------------
// ROUND 6 BLOCKER (mutation B): required-context uniqueness across the WHOLE
// repository. The structure check above pins each gate job's own `name:`, but
// nothing stopped a job in an unrelated workflow from reporting one of the
// four required names. The reviewer's reproduction — naming
// old-front-characterization.yml's e2e job `docs-archive-gate` — passed both
// enforced guards, and on that head the unrelated job finished four minutes
// AFTER the real gate. Under "latest report for a context wins", a real gate
// failure followed by the unrelated job's later success leaves the required
// context green over failed required work.
//
// These fixtures write a SECOND workflow file into the throwaway repo, so
// they exercise the same whole-directory scan the CLI runs against the real
// .github/workflows.
// ---------------------------------------------------------------------------

/** Adds another workflow file alongside fixture.yml in a throwaway repo. */
// @ts-expect-error rung-0: add proper type in later rung
const addWorkflow = async (rootDir, fileName, workflowYaml) => {
	await writeFile(
		path.join(rootDir, '.github/workflows', fileName),
		workflowYaml,
	);

	return rootDir;
};

/** An unrelated workflow, in the shape of old-front-characterization.yml. */
// @ts-expect-error rung-0: add proper type in later rung
const unrelatedWorkflow = (jobId, jobName) => `
name: unrelated
on:
  pull_request:
  push:
  workflow_dispatch:
jobs:
  ${jobId}:
${jobName === undefined ? '' : `    name: ${jobName}\n`}    runs-on: ubuntu-latest
    steps:
      - run: echo unrelated
`;

test('ROUND 6: the real repository has exactly one producer of each reserved check name', async () => {
	assert.deepEqual(
		await findRequiredContextCollisionProblems({ rootDir: repoRoot }),
		[],
	);
});

test('ROUND 6: a fixture repo with an unrelated workflow that claims no reserved name passes', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(
		rootDir,
		'unrelated.yml',
		// @ts-expect-error rung-0: TS2554
		unrelatedWorkflow('unrelated-e2e'),
	);

	assert.deepEqual(
		await findRequiredContextCollisionProblems({
			rootDir,
			workflows: fixtureConfig,
		}),
		[],
	);
});

test("ROUND 6 BLOCKER (mutation B, the exact reviewer reproduction): another workflow's job renamed to a required context name is caught", async () => {
	// The reviewer renamed the JOB ID. GitHub reports a job with no `name:`
	// under its job ID, so this claims the required context just as surely as
	// a `name:` would.
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(
		rootDir,
		'unrelated.yml',
		// @ts-expect-error rung-0: TS2554
		unrelatedWorkflow('fixture-gate'),
	);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/unrelated\.yml::fixture-gate: reports the check name "fixture-gate", which contains the reserved name "fixture-gate" \(externally required context\)/,
	);
	assert.match(findings[0], /Only fixture\.yml::gate may report it/);
});

test("ROUND 6 BLOCKER (mutation B, the drift-invisible variant): a `name:` added to another workflow's job is caught", async () => {
	// scripts/check-ci-drift.mjs hashes step fields only, and its manifest
	// keys are `file::jobId::stepName` — so renaming the job ID at least
	// makes it complain about new/stale steps, but ADDING a job-level `name:`
	// leaves every one of its keys and hashes untouched. Verified against the
	// real files: with `name: docs-archive-gate` on
	// old-front-characterization.yml's e2e job, the drift guard exits 0. This
	// is the variant no other guard can see.
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(
		rootDir,
		'unrelated.yml',
		unrelatedWorkflow('unrelated-e2e', 'fixture-gate'),
	);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/unrelated\.yml::unrelated-e2e: reports the check name "fixture-gate"/,
	);
});

test('ROUND 6 BLOCKER: the non-required push-check name is reserved too', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(
		rootDir,
		'unrelated.yml',
		unrelatedWorkflow('unrelated-e2e', 'fixture-push-check'),
	);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /reserved name "fixture-push-check"/);
});

test("ROUND 6 BLOCKER: an expression in an unrelated job's `name:` is rejected, because it can resolve to a reserved name without containing it", async () => {
	// A substring scan cannot see `${{ format('{0}-gate', 'fixture') }}` or
	// `${{ vars.CHECK_NAME }}`, and this guard cannot evaluate GitHub
	// expressions. So a dynamic job name anywhere in the repository is a
	// reviewed decision rather than something that can arrive silently.
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(
		rootDir,
		'unrelated.yml',
		unrelatedWorkflow('unrelated-e2e', "${{ format('{0}-gate', 'fixture') }}"),
	);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /contains a GitHub expression/);
	assert.match(findings[0], /unrelated\.yml::unrelated-e2e/);
});

test('ROUND 6 BLOCKER: a second copy of the gate workflow itself is caught (the authorized producer is one file::job, not one expression)', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(rootDir, 'fixture-copy.yml', goodWorkflow);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	// The copy's gate job is not the authorized producer, so its expression
	// is rejected as dynamic AND flagged for both reserved names it contains.
	assert.equal(findings.length, 3);
	assert.ok(
		findings.every((finding) => finding.startsWith('fixture-copy.yml::gate')),
	);
	assert.ok(
		findings.some((finding) => /reserved name "fixture-gate"/.test(finding)),
	);
	assert.ok(
		findings.some((finding) =>
			/reserved name "fixture-push-check"/.test(finding),
		),
	);
});

test('ROUND 6 BLOCKER: the authorized gate job carrying a name other than its pinned expression is caught', async () => {
	const broken = goodWorkflow.replace(
		"name: ${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}",
		'name: something-else',
	);
	const rootDir = await buildFixture(broken);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/fixture\.yml::gate: is the authorized producer of "fixture-gate" and "fixture-push-check", but its `name:` is "something-else"/,
	);
});

test('ROUND 6 BLOCKER: a required context that no job in the repository reports at all is caught', async () => {
	// The mirror image of a duplicate: with the gate job gone, the required
	// context has zero producers. That blocks every pull request rather than
	// letting one through, but it is still a defect, and the "exactly one"
	// rule catches both directions.
	const broken = goodWorkflow.slice(0, goodWorkflow.indexOf('  gate:\n'));
	const rootDir = await buildFixture(broken);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.equal(findings.length, 2);
	assert.ok(
		findings.some((finding) =>
			/no job in \.github\/workflows reports the reserved check name "fixture-gate"/.test(
				finding,
			),
		),
	);
	assert.ok(
		findings.some((finding) =>
			/no job in \.github\/workflows reports the reserved check name "fixture-push-check"/.test(
				finding,
			),
		),
	);
});

test('ROUND 6 BLOCKER: two gate workflows configured with the same reserved name are caught in the table itself', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await addWorkflow(rootDir, 'other.yml', goodWorkflow);

	const findings = await findRequiredContextCollisionProblems({
		rootDir,
		workflows: [
			...fixtureConfig,
			{
				...fixtureConfig[0],
				file: 'other.yml',
			},
		],
	});

	assert.ok(
		findings.some((finding) =>
			/reserved check name "fixture-gate" is claimed twice/.test(finding),
		),
	);
});

test("the repo's own aggregate-gate workflows have the required job graph", async () => {
	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir: repoRoot }),
		[],
	);
});

// #1227 BLOCKER: a workflow that subscribes to `push` must not diff against
// `origin/${{ github.base_ref }}` — that expression is empty on `push` (and
// `merge_group`), so the fetch resolves to `origin/` and react-doctor aborts
// with "Diff base branch \"origin/\" does not exist". The real run
// https://github.com/PublyApp/publyapp/actions/runs/32585167025 died on
// exactly this. The base must instead be resolved per event (see the
// react-doctor.yml fix). This guard catches the raw pattern reappearing in any
// workflow that also declares a `push` trigger — including the one we are
// fixing it in.
//
// TDD: this test was written RED against the unmodified guard (it failed: the
// pattern was not detected) and turned GREEN when the guard below landed.
const pushWorkflowWithBadBase = `
name: fixture
on:
  pull_request:
  merge_group:
  push:
    branches: [develop]
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
      - name: Fetch base branch
        run: git fetch --no-tags origin \${{ github.base_ref }}
      - name: React Doctor
        run: pnpm dlx react-doctor --base origin/\${{ github.base_ref }}
  gate:
    name: \${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fixture-gate' || 'fixture-push-check' }}
    if: always()
    needs: [changes, heavy]
    runs-on: ubuntu-latest
    steps:
      - name: Check required jobs
        id: check-required-jobs
        env:
          NEEDS_JSON: \${{ toJSON(needs) }}
        run: echo "$NEEDS_JSON"
      - name: Verify outcome
        if: always()
        run: |
          outcome="\${{ steps.check-required-jobs.outcome }}"
          if [ "$outcome" != "success" ]; then
            exit 1
          fi
`;

test('#1227 BLOCKER: a `push`-subscribed workflow diffing against `origin/${{ github.base_ref }}` is caught', async () => {
	const rootDir = await buildFixture(pushWorkflowWithBadBase);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	const bad = findings.filter((finding) =>
		/fixture\.yml.*origin\/\$\{\{ github\.base_ref \}\}/.test(finding),
	);

	assert.ok(
		bad.length > 0,
		`expected at least one finding about the raw origin/\${{ github.base_ref }} pattern in a push-subscribed workflow, got:\n${findings.join('\n')}`,
	);
	assert.ok(
		bad.every((finding) => /push/.test(finding)),
		`every such finding must name the push trigger, got:\n${bad.join('\n')}`,
	);
});

// The same pattern is harmless in a workflow that does NOT subscribe to `push`
// (github.base_ref is always set on pull_request/merge_group). Prove the guard
// does not over-reach: a workflow with only pull_request/merge_group and the
// raw pattern must NOT be flagged by this rule.
const noPushWorkflowWithBadBase = pushWorkflowWithBadBase.replace(
	'  push:\n    branches: [develop]\n',
	'',
);

test('#1227: a non-push workflow using `origin/${{ github.base_ref }}` is NOT flagged by this rule', async () => {
	const rootDir = await buildFixture(noPushWorkflowWithBadBase);

	const findings = await findCiGateStructureProblems({
		rootDir,
		workflows: fixtureConfig,
	});

	assert.ok(
		!findings.some((finding) =>
			/origin\/\$\{\{ github\.base_ref \}\}/.test(finding),
		),
		`expected no origin/\${{ github.base_ref }} finding for a non-push workflow, got:\n${findings.join('\n')}`,
	);
});

// ---------------------------------------------------------------------------
// PR #1312 round 1: `pinnedTestFiles` — explicit CI enforcement for the
// real-<Trans> render guard. Renaming, moving, deleting, or quietly excluding
// that file keeps `pnpm --filter front test` green (the file simply stops
// running), so this structural check is what fails the gate instead.
// ---------------------------------------------------------------------------

// The pin fixture carries `pinnedTestFiles`, which only exists on the real
// front-ci entry of GATE_WORKFLOWS — and that entry additionally REQUIRES
// `selfTestCoverage`/`requiresSelfCheck`, fields a minimal fixture cannot
// fake (their checks inspect the changes job's real classifier patterns),
// while every other union member pins `pinnedTestFiles` to undefined. Each
// use site below therefore carries the file's standing rung-0 escape hatch.
const pinnedConfig = [
	{
		file: 'fixture.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'fixture-gate',
		pushCheckName: 'fixture-push-check',
		relevanceGatedJobs: [{ id: 'heavy', needs: ['changes'] }],
		alwaysJobs: [],
		pinnedTestFiles: [
			{
				path: 'apps/front/src/lib/i18n/trans-render.guard.test.tsx',
				runnerConfig: 'apps/front/vitest.config.ts',
				reason: 'the real-<Trans> render guard',
			},
		],
	},
];

test('pinnedTestFiles: the real tree still pins the trans-render guard and its vitest discovery', async () => {
	assert.deepEqual(
		await findCiGateStructureProblems({ rootDir: repoRoot }),
		[],
	);
});

test('pinnedTestFiles: a renamed/moved/deleted pinned file is a finding', async () => {
	// The renamed/moved/deleted shape: the runner config still exists, but
	// no file sits at the path the pin expects.
	const rootDir = await buildFixture(goodWorkflow);

	await mkdir(path.join(rootDir, 'apps/front'), { recursive: true });
	await writeFile(
		path.join(rootDir, 'apps/front/vitest.config.ts'),
		"export default { test: { include: ['src/**/*.test.tsx'] } };\n",
	);

	const findings = await findCiGateStructureProblems({
		rootDir,
		// @ts-expect-error rung-0: TS2322 — minimal pin fixture omits selfTestCoverage/requiresSelfCheck
		workflows: pinnedConfig,
	});

	assert.ok(
		findings.some((finding) =>
			/trans-render\.guard\.test\.tsx` is missing/.test(finding),
		),
		`expected a missing-pinned-file finding, got:\n${findings.join('\n')}`,
	);
});

test('pinnedTestFiles: a present file no vitest include glob discovers is a finding', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await mkdir(path.join(rootDir, 'apps/front/src/lib/i18n'), {
		recursive: true,
	});
	await writeFile(
		path.join(rootDir, 'apps/front/src/lib/i18n/trans-render.guard.test.tsx'),
		'export {};\n',
	);
	await writeFile(
		path.join(rootDir, 'apps/front/vitest.config.ts'),
		"export default { test: { include: ['src/**/*.nope.test.tsx'] } };\n",
	);

	const findings = await findCiGateStructureProblems({
		rootDir,
		// @ts-expect-error rung-0: TS2322 — minimal pin fixture omits selfTestCoverage/requiresSelfCheck
		workflows: pinnedConfig,
	});

	assert.ok(
		findings.some((finding) =>
			/no `include` pattern in `apps\/front\/vitest\.config\.ts` discovers/.test(
				finding,
			),
		),
		`expected a not-discovered-by-runner finding, got:\n${findings.join('\n')}`,
	);
});

test('pinnedTestFiles: a file matched by the runner exclude list is a finding', async () => {
	const rootDir = await buildFixture(goodWorkflow);

	await mkdir(path.join(rootDir, 'apps/front/src/lib/i18n'), {
		recursive: true,
	});
	await writeFile(
		path.join(rootDir, 'apps/front/src/lib/i18n/trans-render.guard.test.tsx'),
		'export {};\n',
	);
	await writeFile(
		path.join(rootDir, 'apps/front/vitest.config.ts'),
		"export default { test: { include: ['src/**/*.test.tsx'], exclude: ['src/**/trans-render.guard.test.tsx'] } };\n",
	);

	const findings = await findCiGateStructureProblems({
		rootDir,
		// @ts-expect-error rung-0: TS2322 — minimal pin fixture omits selfTestCoverage/requiresSelfCheck
		workflows: pinnedConfig,
	});

	assert.ok(
		findings.some((finding) =>
			/matched by the `exclude` pattern\(s\)/.test(finding),
		),
		`expected an excluded-from-runner finding, got:\n${findings.join('\n')}`,
	);
});

// ---------------------------------------------------------------------------
// PR #1312 round 2 (review MAJOR/BLOCKS_PR): the pin-of-the-pin. Round 1
// proved the enforcement loop fires on a moved/renamed/excluded FILE — but the
// reviewer's actual mutation deleted the `pinnedTestFiles` ENTRY itself from
// GATE_WORKFLOWS, and every check stayed green: an absent pin is a compliant
// default, so the guard's own switch had no switch-guard. These tests pin the
// table's exact contents against EXPECTED_PINNED_TEST_FILES, symmetrically.
// ---------------------------------------------------------------------------

const frontCiWorkflow = GATE_WORKFLOWS.find(
	(workflow) => workflow.file === 'front-ci.yml',
);

test('round 2: GATE_WORKFLOWS.front-ci declares a pinnedTestFiles list containing exactly the trans-render guard pin', () => {
	assert.ok(
		frontCiWorkflow,
		'the front-ci.yml entry must exist in GATE_WORKFLOWS',
	);

	const pins = frontCiWorkflow.pinnedTestFiles ?? [];
	assert.deepEqual(
		pins.map(({ path }) => path),
		['apps/front/src/lib/i18n/trans-render.guard.test.tsx'],
		'front-ci pinnedTestFiles must be EXACTLY [the trans-render guard] — removing the entry silently switches the round-1 enforcement off; adding anything else must be a conscious, reviewed change to this assertion too',
	);

	const expectation = EXPECTED_PINNED_TEST_FILES.filter(
		(pin) =>
			pin.file === 'front-ci.yml' &&
			pin.path === 'apps/front/src/lib/i18n/trans-render.guard.test.tsx',
	);
	assert.equal(
		expectation.length,
		1,
		'EXPECTED_PINNED_TEST_FILES must declare exactly one trans-render guard pin for front-ci.yml',
	);
});

test('round 2: findPinnedTestFilesProblems is green on the real tree', async () => {
	assert.deepEqual(
		await findPinnedTestFilesProblems({ rootDir: repoRoot }),
		[],
	);
});

test('round 2: REMOVING the pinnedTestFiles entry goes RED naming it (the exact review mutation, via the test seam)', async () => {
	// Reproduce the reviewer's mutation against a mutated COPY of the real
	// table: the front-ci entry loses its `pinnedTestFiles` array entirely.
	// The production check runs against the REAL table (see the real-tree
	// green above); this proves the comparison flips symmetrically. The full
	// source-level reproduction — entry deleted from check-ci-gate-structure.ts
	// itself, whole suite RED — lives in .dump/fix-r2-proof.md.
	const mutatedTable = GATE_WORKFLOWS.map((workflow) =>
		workflow.file === 'front-ci.yml'
			? { ...workflow, pinnedTestFiles: undefined }
			: workflow,
	);

	const findings = await findPinnedTestFilesProblems({
		rootDir: repoRoot,
		workflows: mutatedTable,
	});

	assert.ok(
		findings.length > 0,
		'expected a finding when the pinnedTestFiles entry is deleted',
	);
	assert.ok(
		findings.every((finding) => /pinnedTestFiles/.test(finding)),
		`every finding must name pinnedTestFiles, got:\n${findings.join('\n')}`,
	);
	assert.ok(
		findings.some((finding) =>
			/front-ci\.yml.*trans-render\.guard\.test\.tsx|trans-render\.guard\.test\.tsx.*front-ci\.yml/s.test(
				finding,
			),
		),
		`the finding must name the removed entry (front-ci.yml + the trans-render guard), got:\n${findings.join('\n')}`,
	);
});

test('round 2: ADDING an undeclared pin goes RED naming it', async () => {
	const mutatedTable = GATE_WORKFLOWS.map((workflow) =>
		workflow.file === 'front-ci.yml'
			? {
					...workflow,
					pinnedTestFiles: [
						...(workflow.pinnedTestFiles ?? []),
						{
							path: 'apps/front/src/lib/i18n/some-undeclared.guard.test.tsx',
							runnerConfig: 'apps/front/vitest.config.ts',
							reason: 'an undeclared extra pin',
						},
					],
				}
			: workflow,
	);

	const findings = await findPinnedTestFilesProblems({
		rootDir: repoRoot,
		workflows: mutatedTable,
	});

	assert.ok(
		findings.some((finding) =>
			/undeclared pinnedTestFiles entry.*some-undeclared\.guard\.test\.tsx/.test(
				finding,
			),
		),
		`expected an undeclared-entry finding naming the added pin, got:\n${findings.join('\n')}`,
	);
});

test('round 2: EDITING an existing pin (runnerConfig swap) goes RED naming both spellings', async () => {
	const mutatedTable = GATE_WORKFLOWS.map((workflow) =>
		workflow.file === 'front-ci.yml'
			? {
					...workflow,
					pinnedTestFiles: [
						{
							path: 'apps/front/src/lib/i18n/trans-render.guard.test.tsx',
							runnerConfig: 'apps/front/vitest.config.other.ts',
							reason: 'swapped runner config',
						},
					],
				}
			: workflow,
	);

	const findings = await findPinnedTestFilesProblems({
		rootDir: repoRoot,
		workflows: mutatedTable,
	});

	assert.ok(
		findings.some((finding) => /no longer carries/.test(finding)) &&
			findings.some((finding) =>
				/undeclared pinnedTestFiles entry/.test(finding),
			),
		`an edited pin must produce BOTH the missing-declared-entry and undeclared-entry findings, got:\n${findings.join('\n')}`,
	);
});

test('round 2: the declared expectation fails closed when its file is missing on disk', async () => {
	// The expectation must never quietly describe coverage that no longer
	// exists: point the comparison at a rootDir where the guard file is gone.
	const rootDir = await buildFixture(goodWorkflow);

	const findings = await findPinnedTestFilesProblems({ rootDir });

	assert.ok(
		findings.some(
			(finding) =>
				/points at a file that does not exist on disk/.test(finding) &&
				/trans-render\.guard\.test\.tsx/.test(finding),
		),
		`expected a fail-closed finding naming the vanished pinned file, got:\n${findings.join('\n')}`,
	);
});
