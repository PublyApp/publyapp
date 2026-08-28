import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import { findCiDrift, hashReason, normalizeReason } from './check-ci-drift.ts';

// These tests are the standing proof that the drift guard actually fires.
// Every failure mode it claims to catch gets exercised against a throwaway
// repo, so the guard cannot rot into a check that always returns green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

// @ts-expect-error rung-0: add proper type in later rung
const workflow = (steps) =>
	`name: fixture\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

const mirroredStep = '      - name: Run tests\n        run: pnpm test\n';

const reason = 'Mirrored locally by the fixture gate for testing purposes.';

/**
 * Builds a throwaway repo with one workflow and one manifest.
 */
// @ts-expect-error rung-0: add proper type in later rung
const buildFixture = async ({ manifestSteps, steps }) => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ci-drift-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(steps),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: manifestSteps }, null, '\t'),
	);

	return rootDir;
};

// Hash of the `mirroredStep` above, as computed by the guard. Captured once so
// the other tests can build a reconciled baseline to perturb.
const computeReconciledHash = async () => {
	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: 'wrong',
				mirror: 'just ci',
				reason,
			},
		},
		steps: mirroredStep,
	});

	const [finding] = await findCiDrift({ rootDir });

	// @ts-expect-error rung-0: TS2531
	return finding.match(/workflow ([a-f0-9]+)/)[1];
};

const reconciledHash = await computeReconciledHash();

const reconciled = {
	'fixture.yml::build::Run tests': {
		hash: reconciledHash,
		mirror: 'just ci',
		reason,
	},
};

test('passes when every workflow step is reconciled', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	assert.deepEqual(await findCiDrift({ rootDir }), []);
});

test('fails when CI gains a step the local gate does not cover', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - name: Scan for secrets\n        run: pnpm scan:secrets\n`,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/^NEW STEP {2}fixture\.yml::build::Scan for secrets/,
	);
});

test('fails when a reconciled CI step changes its command', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: '      - name: Run tests\n        run: pnpm test --coverage\n',
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
});

test('fails when a step changes only its env or condition', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps:
			'      - name: Run tests\n        env:\n          CI: "1"\n        run: pnpm test\n',
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
});

test('ignores cosmetic trailing whitespace so the guard is not noise', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: '      - name: Run tests\n        run: |\n          pnpm test   \n',
	});

	assert.deepEqual(await findCiDrift({ rootDir }), []);
});

test('fails when the manifest reconciles a step that no longer exists', async () => {
	const rootDir = await buildFixture({
		manifestSteps: {
			...reconciled,
			'fixture.yml::build::Deleted step': {
				hash: 'abc',
				mirror: 'just ci',
				reason,
			},
		},
		steps: mirroredStep,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^STALE {5}fixture\.yml::build::Deleted step/);
});

test('rejects an exemption that does not give a reviewable reason', async () => {
	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: reconciledHash,
				mirror: null,
				reason: 'n/a',
			},
		},
		steps: mirroredStep,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /needs a `reason` of at least 24 characters/);
});

test('tracks uses: steps, so a new action cannot slip in uncounted', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - uses: some-org/scan-action@v1\n`,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/^NEW STEP {2}fixture\.yml::build::uses:some-org\/scan-action/,
	);
});

test('fails closed when two steps in a job share an identity', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - name: Run tests\n        run: pnpm test:other\n`,
	});

	const findings = await findCiDrift({ rootDir });

	assert.ok(
		findings.some((finding) => /two steps labelled "Run tests"/.test(finding)),
	);
});

test("the repo's own workflows are fully reconciled with the local gate", async () => {
	assert.deepEqual(await findCiDrift({ rootDir: repoRoot }), []);
});

// The CODEOWNERS contract must stay wired into `just ci-drift` and its
// server mirror (`front-ci.yml::gate-selftest`). Those wiring facts are
// asserted HERE as well as inside codeowners-contract.test.mjs, because the
// CODEOWNERS suite cannot be the only witness to its own wiring: it is
// itself invoked by the exact recipe line the assertion protects, so
// commenting that line out removes the detector together with the command
// it guards and the gate goes green on a CODEOWNERS rule mutation. This
// suite is invoked by a different `ci-drift` recipe line (`pnpm
// test:ci-drift`), so the wiring check survives the removal and fails the
// gate.
const codeownersInvocation =
	'pnpm --filter scripts-ts exec vitest run src/codeowners-contract.test.ts';

const ciDriftRecipe = readFileSync(
	path.join(repoRoot, 'justfile'),
	'utf8',
).match(/^ci-drift:\n([\s\S]*?)(?=^\S|(?![\s\S]))/m)?.[1];

const gateSelftestRunBlock = parse(
	readFileSync(path.join(repoRoot, '.github/workflows/front-ci.yml'), 'utf8'),
).jobs['gate-selftest']?.steps.find(
	// @ts-expect-error rung-0: add proper type in later rung
	(step) => step.name === 'Run CI gate guard tests (mirrors `just ci-drift`)',
)?.run;

// @ts-expect-error rung-0: add proper type in later rung
const executableLines = (block) =>
	block
		.split('\n')
		// @ts-expect-error rung-0: add proper type in later rung
		.map((line) => line.trim())
		// @ts-expect-error rung-0: add proper type in later rung
		.filter((line) => line !== '' && !line.startsWith('#'));

// @ts-expect-error rung-0: add proper type in later rung
const assertRunsCodeownersContract = (block, where) => {
	assert.ok(
		executableLines(block).includes(codeownersInvocation),
		`${where} must run the CODEOWNERS contract from an executable line: \`${codeownersInvocation}\``,
	);
};

test('the local ci-drift recipe runs the CODEOWNERS contract', () => {
	assert.ok(ciDriftRecipe, 'justfile must define the ci-drift recipe');
	assertRunsCodeownersContract(ciDriftRecipe, 'ci-drift');
});

test('a commented-out ci-drift invocation fails this independent wiring check', () => {
	assert.ok(ciDriftRecipe, 'justfile must define the ci-drift recipe');
	assert.throws(
		() =>
			assertRunsCodeownersContract(
				ciDriftRecipe.replace(
					codeownersInvocation,
					`# ${codeownersInvocation}`,
				),
				'ci-drift',
			),
		/ci-drift must run the CODEOWNERS contract from an executable line/,
	);
});

test('the gate-selftest server mirror runs the CODEOWNERS contract', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assertRunsCodeownersContract(gateSelftestRunBlock, 'gate-selftest');
});

test('a commented-out gate-selftest invocation fails this independent wiring check', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assert.throws(
		() =>
			assertRunsCodeownersContract(
				gateSelftestRunBlock.replace(
					codeownersInvocation,
					`# ${codeownersInvocation}`,
				),
				'gate-selftest',
			),
		/gate-selftest must run the CODEOWNERS contract from an executable line/,
	);
});

// --- Reason guard tests (#1725) ---

// The reason guard detects truncation/alteration of a reason while the step
// hash is unchanged. A deliberate rewrite is possible by updating
// reason-guard-ref.json in the same commit.

test('reason guard: passes when the reason is unchanged', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	assert.deepEqual(await findCiDrift({ rootDir }), []);
});

test('reason guard: fails when a reason SHRANKS while step hash is unchanged', async () => {
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;
	const shrunkReason = originalReason.slice(0, 50);

	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: reconciledHash,
				mirror: 'just ci',
				reason: shrunkReason,
			},
		},
		steps: mirroredStep,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /reason SHRANK/);
	assert.match(findings[0], /from .* to 50 characters/);
});

test('reason guard: fails when a reason CHANGES while step hash is unchanged', async () => {
	const changedReason = 'This is a completely different reason text that is longer than the original one for sure.';

	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: reconciledHash,
				mirror: 'just ci',
				reason: changedReason,
			},
		},
		steps: mirroredStep,
	});

	const findings = await findCiDrift({ rootDir });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /reason CHANGED/);
});

test('reason guard: does not fire when step hash also changes', async () => {
	// When the step hash changes, the CHANGED finding is already reported.
	// The reason guard should not add a duplicate finding for the same step.
	const changedReason = 'This is a completely different reason text that is longer than the original one for sure.';

	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: reconciledHash, // Same hash as workflow
				mirror: 'just ci',
				reason: changedReason,
			},
		},
		steps: '      - name: Run tests\n        run: pnpm test --coverage\n', // Different command
	});

	const findings = await findCiDrift({ rootDir });

	// Should have exactly one finding: CHANGED for the step command
	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
});

test('reason guard: encoding-invariant (em-dash \\u2014 vs —)', () => {
	// The reference was generated from the manifest which uses \\u2014 for
	// em-dashes. If a tool re-serializes the manifest with literal UTF-8
	// em-dashes (—), the hash must NOT change — otherwise every rebase
	// would resurrect a merge conflict.
	//
	// This test verifies directly that normalizeReason treats both forms
	// identically, which is the core property the guard relies on.
	const withEscaped = 'Cannot silently change it \\u2014 it is NOT a defense';
	const withLiteral = 'Cannot silently change it — it is NOT a defense';

	// Both forms must produce the same normalized output
	assert.equal(normalizeReason(withEscaped), normalizeReason(withLiteral));

	// And the hash must match
	assert.equal(hashReason(withEscaped), hashReason(withLiteral));
});
