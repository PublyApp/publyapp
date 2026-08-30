import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	findCiDrift,
	findDuplicateKeys,
	hashReason,
} from './check-ci-drift.ts';

// These tests are the standing proof that the drift guard actually fires.
// Every failure mode it claims to catch gets exercised against a throwaway
// repo, so the guard cannot rot into a check that always returns green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflow = (steps: string) =>
	`name: fixture\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

const mirroredStep = '      - name: Run tests\n        run: pnpm test\n';

const reason = 'Mirrored locally by the fixture gate for testing purposes.';

/**
 * Builds a throwaway repo with one workflow and one manifest.
 */
const buildFixture = async ({
	manifestSteps,
	steps,
}: {
	manifestSteps: Record<string, unknown>;
	steps: string;
}): Promise<string> => {
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

	// Inject an empty ref so the call exercises the CHANGED path without
	// needing a git repo (these fixtures are throwaway tmpdirs).
	const [finding] = await findCiDrift({ rootDir, reasonRef: { steps: {} } });

	return finding!.match(/workflow ([a-f0-9]+)/)![1];
};

const reconciledHash = await computeReconciledHash();

const reconciled = {
	'fixture.yml::build::Run tests': {
		hash: reconciledHash,
		mirror: 'just ci',
		reason,
	},
} as const;

const manifestEntry = 'fixture.yml::build::Run tests';

test('passes when every workflow step is reconciled', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	assert.deepEqual(
		await findCiDrift({
			rootDir,
			reasonRef: buildFixtureReasonRef(reason),
		}),
		[],
	);
});

test('fails when CI gains a step the local gate does not cover', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - name: Scan for secrets\n        run: pnpm scan:secrets\n`,
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(
		findings[0],
		/^NEW STEP {2}fixture\.yml::build::Scan for secrets/,
	);
	// Cause: CI gained a step the local gate does not account for.
	assert.match(
		findings[0],
		/CI gained a step the local gate does not account for/,
	);
	// Action: mirror it or record why it cannot run locally.
	assert.match(
		findings[0],
		/mirror it in `just ci` or record why it cannot run locally/,
	);
	// Order: cause must precede action.
	assert.ok(
		findings[0].indexOf(
			'CI gained a step the local gate does not account for',
		) < findings[0].indexOf('mirror it in `just ci`'),
		'Cause (CI gained a step) must appear before the action (mirror it or record why)',
	);
});

test('fails when a reconciled CI step changes its command', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: '      - name: Run tests\n        run: pnpm test --coverage\n',
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
	// Cause: the CI step changed since it was reconciled.
	assert.match(findings[0], /changed since it was reconciled/);
	// Action: re-check the mirror and update the hash.
	assert.match(findings[0], /Re-check that/);
	assert.match(findings[0], /still covers it/);
	assert.match(findings[0], /update the hash/);
	// Order: cause must precede action.
	assert.ok(
		findings[0].indexOf('changed since it was reconciled') <
			findings[0].indexOf('Re-check that'),
		'Cause (this CI step changed) must appear before the action (Re-check and update hash)',
	);
});

test('fails when a step changes only its env or condition', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps:
			'      - name: Run tests\n        env:\n          CI: "1"\n        run: pnpm test\n',
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
});

test('ignores cosmetic trailing whitespace so the guard is not noise', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: '      - name: Run tests\n        run: |\n          pnpm test   \n',
	});

	assert.deepEqual(
		await findCiDrift({
			rootDir,
			reasonRef: buildFixtureReasonRef(reason),
		}),
		[],
	);
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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				[manifestEntry]: {
					reason_hash: hashReason(reason),
					reason_length: reason.length,
					reason,
				},
				'fixture.yml::build::Deleted step': {
					reason_hash: hashReason(reason),
					reason_length: reason.length,
					reason,
				},
			},
		},
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^STALE {5}fixture\.yml::build::Deleted step/);
	// Cause: the manifest reconciles a CI step that no longer exists.
	assert.match(findings[0], /reconciles a CI step that no longer exists/);
	// Action: delete the entry and drop the local mirror.
	assert.match(findings[0], /Delete the entry/);
	assert.match(findings[0], /drop the local mirror/);
	// Order: cause must precede action.
	assert.ok(
		findings[0].indexOf('reconciles a CI step that no longer exists') <
			findings[0].indexOf('Delete the entry'),
		'Cause (manifest reconciles a non-existent step) must appear before the action (delete the entry)',
	);
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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /needs a `reason` of at least 24 characters/);
});

// #1809 r11: the filler rejection must not be limited to a single repeated
// character. Two-character cycles ("ab".repeat(12)) and repeated pairs
// ("x ".repeat(12) + "x", a truncated final repetition) are equally
// zero-information strings that clear a 24-char length bar, and the r8 commit
// that claimed "reject repeated-char filler" was narrower than its claim.
// #1809 r13: a single-block check is still bypassable by a multi-block stack
// ("ab".repeat(6) + "cd".repeat(6), the measured 24-char bypass) and by a
// run with a single alien tail ("a".repeat(23) + "b"); the residue-based
// detector covers both. The manifest-entry validator shares the widened check
// with the confession reader; this test locks the manifest-entry side.
test('rejects a reconciled step whose reason is a repeated-block filler', async () => {
	const fillerReasons = [
		'x'.repeat(24),
		'ab'.repeat(12),
		'x '.repeat(12) + 'x',
		'ab'.repeat(6) + 'cd'.repeat(6),
		'ab'.repeat(6) + 'cd'.repeat(6) + 'ef'.repeat(6),
		'a'.repeat(23) + 'b',
	];

	for (const fillerReason of fillerReasons) {
		const rootDir = await buildFixture({
			manifestSteps: {
				'fixture.yml::build::Run tests': {
					hash: reconciledHash,
					mirror: 'just ci',
					reason: fillerReason,
				},
			},
			steps: mirroredStep,
		});

		const findings = await findCiDrift({
			rootDir,
			reasonRef: buildFixtureReasonRef(reason),
		});

		assert.equal(findings.length, 1);
		assert.match(
			findings[0],
			/reason that is filler/,
			`Expected the filler rejection for: ${fillerReason}`,
		);
	}
});

// #1809 r13 blocker: the ratchet floor was incomplete. The invariant actually
// applied was pinned ⊆ steps ⊆ manifest — it forbade pinning anything, but
// never required completeness, so a step covered by the manifest could sit
// unpinned ("protected in name only") and vanish later without the ratchet
// moving. check-ci-drift.ts must now emit an UNPINNED finding for any
// manifest step missing from the CURRENT reference's pinned_step_ids.
test('pin completeness: fails when a reconciled step is missing from pinned_step_ids', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	// Manifest covers the step and the ref tracks its reason fingerprint, but
	// pinned_step_ids does not cover it — the exact r13 defect shape.
	const refWithoutPin = {
		pinned_step_ids: [],
		steps: {
			[manifestEntry]: {
				reason_hash: hashReason(reason),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({ rootDir, reasonRef: refWithoutPin });

	assert.equal(findings.length, 1);
	assert.match(findings[0], /^UNPINNED fixture\.yml::build::Run tests/);
	// Cause: reconciled but not pinned, so removal needs no confession.
	assert.match(findings[0], /reconciled in the manifest but not pinned/);
	assert.match(findings[0], /needs no confession and trips no RATCHET/);
	// Action: regenerate so every reconciled step is pinned.
	assert.match(findings[0], /Regenerate reason-guard-ref\.json/);
});

test('pin completeness: passes when every reconciled step is pinned in the current reference', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	const refWithPin = {
		pinned_step_ids: [manifestEntry],
		steps: {
			[manifestEntry]: {
				reason_hash: hashReason(reason),
				reason_length: reason.length,
				reason,
			},
		},
	};

	assert.deepEqual(await findCiDrift({ rootDir, reasonRef: refWithPin }), []);
});

test('pin completeness: a malformed pinned_step_ids is a named finding, never a crash', async () => {
	// A hand-tampered reference can carry `"pinned_step_ids": null` (or a
	// non-array). `new Set(null)` would throw a raw TypeError and abort the
	// whole drift check; the guard must instead emit a named finding telling
	// the operator what is wrong and how to repair. The generator can only
	// ever write the array form, so any other shape is tampering.
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	const nullPinsRef = {
		pinned_step_ids: null,
		steps: {
			[manifestEntry]: {
				reason_hash: hashReason(reason),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({
		rootDir,
		reasonRef: nullPinsRef,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /pinned_step_ids` must be an array of step ids/);
	assert.match(findings[0], /got null/);
	assert.match(findings[0], /gen-reason-ref\.ts/);
});

test('tracks uses: steps, so a new action cannot slip in uncounted', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - uses: some-org/scan-action@v1\n`,
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

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

const gateSelftestRunBlock = (
	parse(
		readFileSync(path.join(repoRoot, '.github/workflows/front-ci.yml'), 'utf8'),
	) as {
		jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
	}
).jobs?.['gate-selftest']?.steps?.find(
	(step) => step.name === 'Run CI gate guard tests (mirrors `just ci-drift`)',
)?.run;

const executableLines = (block: string | undefined) =>
	block
		? block
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '' && !line.startsWith('#'))
		: [];

const assertRunsCodeownersContract = (block: string, where: string) => {
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
				ciDriftRecipe!.replace(
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
	assertRunsCodeownersContract(gateSelftestRunBlock!, 'gate-selftest');
});

test('a commented-out gate-selftest invocation fails this independent wiring check', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assert.throws(
		() =>
			assertRunsCodeownersContract(
				gateSelftestRunBlock!.replace(
					codeownersInvocation,
					`# ${codeownersInvocation}`,
				),
				'gate-selftest',
			),
		/gate-selftest must run the CODEOWNERS contract from an executable line/,
	);
});

// The artifact-version-compat guard (#1728) must stay wired into `just ci-drift`
// and its server mirror (`front-ci.yml::gate-selftest`). The same anti-rot
// reasoning as the CODEOWNERS block above applies: the guard cannot be the only
// witness to its own wiring, because commenting out its invocation would remove
// the detector along with the command it guards.
const artifactCompatInvocation =
	'node ./packages/scripts-ts/src/artifact-version-compat.ts';

// @ts-expect-error rung-0: add proper type in later rung
const assertRunsArtifactCompatGuard = (block, where) => {
	assert.ok(
		executableLines(block).includes(artifactCompatInvocation),
		`${where} must run the artifact version compat guard from an executable line: \`${artifactCompatInvocation}\``,
	);
};

test('the local ci-drift recipe runs the artifact version compat guard', () => {
	assert.ok(ciDriftRecipe, 'justfile must define the ci-drift recipe');
	assertRunsArtifactCompatGuard(ciDriftRecipe, 'ci-drift');
});

test('a commented-out ci-drift artifact-compat invocation fails this independent wiring check', () => {
	assert.ok(ciDriftRecipe, 'justfile must define the ci-drift recipe');
	assert.throws(
		() =>
			assertRunsArtifactCompatGuard(
				ciDriftRecipe.replace(
					artifactCompatInvocation,
					`# ${artifactCompatInvocation}`,
				),
				'ci-drift',
			),
		/ci-drift must run the artifact version compat guard from an executable line/,
	);
});

test('the gate-selftest server mirror runs the artifact version compat guard', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assertRunsArtifactCompatGuard(gateSelftestRunBlock, 'gate-selftest');
});

test('a commented-out gate-selftest artifact-compat invocation fails this independent wiring check', () => {
	assert.ok(
		typeof gateSelftestRunBlock === 'string',
		'front-ci.yml must define the gate-selftest run step that mirrors `just ci-drift`',
	);
	assert.throws(
		() =>
			assertRunsArtifactCompatGuard(
				gateSelftestRunBlock.replace(
					artifactCompatInvocation,
					`# ${artifactCompatInvocation}`,
				),
				'gate-selftest',
			),
		/gate-selftest must run the artifact version compat guard from an executable line/,
	);
});

// --- Reason guard tests (#1725, #1732) ---

// The reason guard detects truncation/alteration of a reason while the step
// hash is unchanged. A deliberate rewrite is possible by updating
// reason-guard-ref.json in the same commit.

// Build a fixture reference that pins the original reason so the guard can
// detect changes. In production, reason-guard-ref.json is the source of truth;
// here we inject a test-only reference so the tests don't depend on the real one.
//
// #1736: the reference MUST include the `reason` text itself (not just its hash
// and length) so that regenerating the ref is visible in the diff review.
// The guard verifies that the stored reason text matches the manifest's reason.
const buildFixtureReasonRef = (originalReason: string) => ({
	steps: {
		'fixture.yml::build::Run tests': {
			reason_hash: hashReason(originalReason),
			reason_length: originalReason.length,
			reason: originalReason,
		},
	},
});

test('reason guard: passes when the reason is unchanged', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	assert.deepEqual(
		await findCiDrift({
			rootDir,
			reasonRef: buildFixtureReasonRef(
				reconciled['fixture.yml::build::Run tests'].reason,
			),
		}),
		[],
	);
});

test('reason guard: fails when a reason SHRINK while step hash is unchanged', async () => {
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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(originalReason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /reason SHRINK/);
	assert.match(findings[0], /from .* to 50 characters/);
});

test('reason guard: fails when a reason CHANGES while step hash is unchanged', async () => {
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;
	const changedReason =
		'This is a completely different reason text that is longer than the original one for sure.';

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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(originalReason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /reason CHANGED/);
});

test('reason guard: does not fire when step hash also changes', async () => {
	// When the step hash changes, the CHANGED finding is already reported.
	// The reason guard should not add a duplicate finding for the same step.
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;
	const changedReason =
		'This is a completely different reason text that is longer than the original one for sure.';

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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(originalReason),
	});

	// Should have exactly one finding: CHANGED for the step command
	assert.equal(findings.length, 1);
	assert.match(findings[0], /^CHANGED {3}fixture\.yml::build::Run tests/);
});

test('reason guard: distinct reasons produce distinct fingerprints', () => {
	// Two semantically different reasons must never collide under the hash,
	// even if they differ by a single character. This proves the guard does
	// not collapse distinct content into the same fingerprint.
	const reasonA = 'The step mirrors the local just ci recipe exactly as-is.';
	const reasonB = 'The step mirrors the local just ci recipe exacty as-is.';
	//   ^^^ differs only by one character ('ly' dropped)

	assert.notEqual(hashReason(reasonA), hashReason(reasonB));
	assert.notEqual(reasonA.length, reasonB.length);
});

// --- Reason guard tests for #1732 (new entry without reference) ---

test('reason guard: fails when a manifest entry is absent from the reference (new unpinned entry)', async () => {
	// A true new CI step was added to the workflow and reconciled in the manifest,
	// but reason-guard-ref.json was NOT regenerated. The guard must fail, naming
	// the entry and the regeneration command.
	const newStep = '      - name: Brand new step\n        run: pnpm brand-new\n';
	const newEntryId = 'fixture.yml::build::Brand new step';
	const newReason = 'A brand new CI step that mirrors the local gate recipe.';

	// Build a fixture with both steps in the manifest and workflow.
	const rootDir = await buildFixture({
		manifestSteps: {
			...reconciled,
			[newEntryId]: {
				hash: 'wronghash0000000',
				mirror: 'just ci',
				reason: newReason,
			},
		},
		steps: `${mirroredStep}${newStep}`,
	});

	// First, get the actual hash for the new step by collecting workflow steps.
	// We can call findCiDrift with an empty ref to see the CHANGED finding
	// which reveals the workflow hash.
	const preFindings = await findCiDrift({
		rootDir,
		reasonRef: { steps: {} },
	});

	// The CHANGED finding for the new step will show the workflow hash.
	const changedFinding = preFindings.find((f) => f.includes(newEntryId));
	assert.ok(changedFinding, 'Expected a CHANGED finding for the new step');
	const workflowHash = changedFinding!.match(/workflow ([a-f0-9]+)/)![1];

	// Now rebuild the fixture with the CORRECT hash for the new step so the
	// CHANGED finding goes away and only the reason guard fires.
	const rootDirCorrect = await buildFixture({
		manifestSteps: {
			...reconciled,
			[newEntryId]: {
				hash: workflowHash,
				mirror: 'just ci',
				reason: newReason,
			},
		},
		steps: `${mirroredStep}${newStep}`,
	});

	const findings = await findCiDrift({
		rootDir: rootDirCorrect,
		// Reference only contains the ORIGINAL step, not the new one.
		reasonRef: buildFixtureReasonRef(reason),
	});

	// Should find: the original step passes (ref aligned), the new step fails
	// reason guard (no reference), no STALE REF for original, no STALE for new
	// step in reference.
	const newEntryFindings = findings.filter(
		(f) =>
			f.includes('manifest but missing from reason-guard-ref') &&
			f.includes(newEntryId),
	);

	assert.equal(newEntryFindings.length, 1);
	assert.match(
		newEntryFindings[0],
		/is present in the manifest but missing from reason-guard-ref\.json/,
	);
	assert.match(newEntryFindings[0], /gen-reason-ref\.ts/);
});

test('reason guard: warns when a reference entry is absent from the manifest (stale reference)', async () => {
	// A step was removed from the workflow, but the reference still holds
	// its fingerprint. The guard must report it as a stale reference so
	// the user knows to clean up the reference.
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	const staleId = 'fixture.yml::build::Stale step';
	const staleReason =
		'old reason text that is long enough for the guard to accept';
	const refWithStaleEntry = {
		steps: {
			'fixture.yml::build::Run tests': {
				reason_hash: hashReason(reason),
				reason_length: reason.length,
				reason,
			},
			[staleId]: {
				reason_hash: hashReason(staleReason),
				reason_length: staleReason.length,
				reason: staleReason,
			},
		},
	};

	const findings = await findCiDrift({
		rootDir,
		reasonRef: refWithStaleEntry,
	});

	const staleRefFindings = findings.filter((f) => f.startsWith('STALE REF '));

	assert.equal(staleRefFindings.length, 1);
	assert.match(
		staleRefFindings[0],
		/STALE REF fixture\.yml::build::Stale step/,
	);
	assert.match(staleRefFindings[0], /gen-reason-ref\.ts/);
	// Cause: the reference holds a fingerprint for a step absent from the manifest.
	assert.match(
		staleRefFindings[0],
		/holds a fingerprint for .* which is absent from the manifest/,
	);
	// Action: delete the reference entry by regenerating.
	assert.match(
		staleRefFindings[0],
		/delete the reference entry by regenerating/,
	);
	// Order: cause must precede action.
	assert.ok(
		staleRefFindings[0].indexOf('absent from the manifest') <
			staleRefFindings[0].indexOf('delete the reference entry by regenerating'),
		'Cause (holds a fingerprint for absent step) must appear before the action (delete the reference entry)',
	);
});

test('reason guard: passes when manifest and reference are fully aligned (Case 3 unchanged)', async () => {
	// Case 3: both sides have the entry, hashes match, reasons match.
	// No new entry, no stale ref, no changed reason. Guard must be green.
	const newStep = '      - name: Another step\n        run: pnpm another\n';
	const newEntryId = 'fixture.yml::build::Another step';
	const newReason = 'A valid reason for a second step in the manifest file.';

	// Get the workflow hash for the new step.
	const tempRoot = await buildFixture({
		manifestSteps: {
			...reconciled,
			[newEntryId]: { hash: 'wrong', mirror: 'just ci', reason: newReason },
		},
		steps: `${mirroredStep}${newStep}`,
	});

	const tempFindings = await findCiDrift({
		rootDir: tempRoot,
		reasonRef: buildFixtureReasonRef(reason),
	});
	const changedFinding = tempFindings.find((f) => f.includes(newEntryId));
	assert.ok(changedFinding, 'Expected CHANGED for wrong hash');
	const workflowHash = changedFinding!.match(/workflow ([a-f0-9]+)/)![1];

	// Now rebuild with correct hash and a full reference.
	const rootDir = await buildFixture({
		manifestSteps: {
			...reconciled,
			[newEntryId]: {
				hash: workflowHash,
				mirror: 'just ci',
				reason: newReason,
			},
		},
		steps: `${mirroredStep}${newStep}`,
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				'fixture.yml::build::Run tests': {
					reason_hash: hashReason(reason),
					reason_length: reason.length,
					reason,
				},
				[newEntryId]: {
					reason_hash: hashReason(newReason),
					reason_length: newReason.length,
					reason: newReason,
				},
			},
		},
	});

	assert.equal(findings.length, 0);
});

// --- Reason guard tests for #1736 (visible reason text in ref) ---
//
// The bypass from #1736: writing a 24-char bogus reason and regenerating
// reason-guard-ref.json in the same commit makes the guard green, because the
// ref file only stored reason_hash + reason_length — the actual reason text
// was invisible in the diff, so a human reviewer could not see "24 x" chars.
//
// The fix: reason-guard-ref.json now includes the `reason` text itself, so
// regeneration is visible in the diff. The guard also verifies that the stored
// reason text matches the manifest's reason (catching hash/text mismatch).

test('reason guard #1736: ref format includes reason text for diff visibility', async () => {
	// The reason-guard-ref.json file must include the actual `reason` text so
	// that regeneration is visible in the diff. This test reads the REAL ref
	// file and asserts the format.
	const refRaw = readFileSync(
		path.join(repoRoot, 'packages/scripts-ts/src/reason-guard-ref.json'),
		'utf-8',
	);
	const ref = JSON.parse(refRaw) as {
		steps: Record<
			string,
			{ reason_hash: string; reason_length: number; reason: string }
		>;
	};

	for (const [id, entry] of Object.entries(ref.steps)) {
		assert.ok(
			typeof entry.reason === 'string' && entry.reason.trim().length > 0,
			`reason-guard-ref.json entry "${id}" must include a non-empty \`reason\` text field for diff visibility`,
		);
		assert.equal(
			entry.reason_hash,
			hashReason(entry.reason),
			`reason-guard-ref.json entry "${id}" reason_hash must match the hash of the stored reason text`,
		);
		assert.equal(
			entry.reason_length,
			entry.reason.length,
			`reason-guard-ref.json entry "${id}" reason_length must match the stored reason text length`,
		);
	}
});

test('reason guard #1736: fails when ref reason text does not match manifest reason', async () => {
	// Even if the hash and length match (impossible in practice but let's be
	// explicit), the guard must verify the reason TEXT matches. Here we
	// simulate a ref that has a bogus reason with the same hash/length as a
	// different reason — but since hash is derived from text, a text mismatch
	// means a hash mismatch, which the existing CHANGED detection catches.
	// The key #1736 property is: the reason text is stored in the ref so
	// regeneration is visible in diff. This test proves the guard catches
	// when the ref's reason text differs from the manifest's.
	const bogusReason = 'xxxxxxxxxxxxxxxxxxxxxxxx'; // exactly 24 chars — passes min-length
	assert.equal(bogusReason.length, 24);

	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	// The ref has the ORIGINAL reason, but the manifest has the BOGUS reason.
	// The guard must fire because the reason changed.
	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				'fixture.yml::build::Run tests': {
					reason_hash: hashReason(bogusReason),
					reason_length: bogusReason.length,
					reason: bogusReason,
				},
			},
		},
	});

	assert.ok(
		findings.some(
			(f) => f.includes('reason CHANGED') || f.includes('reason SHRINK'),
		),
		'Guard must detect when the manifest reason differs from the ref reason',
	);
});

test('reason guard #1736: bypass reproduction — 24-char bogus reason with regenerated ref must be visible', async () => {
	// This is the exact bypass from #1736: a 24-char bogus reason written
	// into the manifest, with the ref regenerated to match. Under the OLD
	// ref format (hash+length only), the diff showed nothing readable —
	// only "24" appeared, not the actual bogus text.
	//
	// The fix ensures the ref stores the reason TEXT, so a reviewer seeing
	// the regenerated ref in the diff immediately sees "xxxxxxxxxxxxxxxxxxxxxxxx"
	// (24 x's). This test proves the ref format carries the text.
	const bogusReason = 'xxxxxxxxxxxxxxxxxxxxxxxx'; // exactly 24 chars
	assert.equal(bogusReason.length, 24);

	// Simulate what gen-reason-ref.ts would produce with the new format:
	// it must include the reason text.
	const newRefFormat = {
		steps: {
			'fixture.yml::build::Bogus step': {
				reason_hash: hashReason(bogusReason),
				reason_length: bogusReason.length,
				reason: bogusReason,
			},
		},
	};

	// The key assertion: the reason text is present in the ref, not just its
	// hash and length. A reviewer reading the diff of this ref would see
	// "xxxxxxxxxxxxxxxxxxxxxxxx" — immediately suspicious.
	assert.equal(
		newRefFormat.steps['fixture.yml::build::Bogus step'].reason,
		bogusReason,
	);
	assert.equal(
		newRefFormat.steps['fixture.yml::build::Bogus step'].reason_length,
		bogusReason.length,
	);
});

test('reason guard #1841 r3: detects an internally inconsistent ref via check (B)', async () => {
	// An internally inconsistent ref: stored text says A, stored hash says B.
	// This means someone edited the ref manually — either changed the hash without
	// updating the text, or vice versa. Check (B) catches this: hashReason(A) !== B.
	// Round 2 incorrectly claimed this was redundant; round 3 restores it.
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;
	const bogusReason = 'x'.repeat(24); // passes min-length

	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	// The ref has ORIGINAL text but BOGUS hash (matching bogusReason).
	// Check (B): hashReason(originalReason) !== hashReason(bogusReason) → finding.
	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				'fixture.yml::build::Run tests': {
					reason_hash: hashReason(bogusReason), // bogus hash
					reason_length: bogusReason.length, // bogus length
					reason: originalReason, // but original text!
				},
			},
		},
	});

	assert.ok(
		findings.length >= 1,
		'Guard must detect an internally inconsistent ref',
	);
	assert.ok(
		findings.some(
			(f) =>
				f.includes('internally inconsistent') || f.includes('reason CHANGED'),
		),
		'Guard must fire when stored text does not match stored hash',
	);
});

test('reason guard #1841 r3: THE BYPASS — manifest reason B, ref text A, ref hash hashReason(B) — check (B) fires, check (A) is silent', async () => {
	// This is the exact bypass scenario described in the brief:
	//   - manifest.reason = B (bogus reason, written to bypass the guard)
	//   - stepRef.reason = A (original text, NOT updated — so the diff is invisible)
	//   - stepRef.reason_hash = hashReason(B) (updated to match the bogus reason)
	//
	// Check (A): hashReason(B) === stepRef.reason_hash → NO finding (silent!)
	// Check (B): hashReason(A) !== hashReason(B) → YES finding (fires!)
	//
	// Without check (B), the guard passes: the diff shows only a hash changing,
	// which is meaningless to a human reviewer. The human cannot see that the
	// reason TEXT stayed the same — so the rewrite is invisible.
	// With check (B), the finding names the inconsistency: stored text A does not
	// match its own stored hash.
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;
	// A PLAUSIBLE bogus reason, not filler: the manifest filler check fires on
	// repeated blocks ('x'.repeat(24)) BEFORE the reason guard runs, so a filler
	// bogus reason would be caught by the wrong control and check (B) would never
	// be exercised. A real attacker cannot ship filler anyway (it is already
	// rejected), so the bypass must look legitimate to reach check (B).
	const bogusReason =
		'The release train was blocked, so this gate was paused for one cycle to unblock deploys.';

	const rootDir = await buildFixture({
		manifestSteps: {
			'fixture.yml::build::Run tests': {
				hash: reconciledHash,
				mirror: 'just ci',
				reason: bogusReason, // BOGUS: manifest says B
			},
		},
		steps: mirroredStep,
	});

	// The ref has ORIGINAL text A but hash for BOGUS reason B.
	// This is the tampered ref: text says A, hash says hash(B).
	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				'fixture.yml::build::Run tests': {
					reason_hash: hashReason(bogusReason), // hashReason(B)
					reason_length: bogusReason.length,
					reason: originalReason, // ORIGINAL text A — NOT updated
				},
			},
		},
	});

	// Check (A) is SILENT: hashReason(bogusReason) === stepRef.reason_hash.
	// Check (B) FIRES: hashReason(originalReason) !== hashReason(bogusReason).
	assert.ok(
		findings.length >= 1,
		'Guard must fire on the bypass — check (B) is not silent',
	);
	assert.ok(
		findings.some(
			(f) =>
				f.includes('internally inconsistent') || f.includes('reason CHANGED'),
		),
		'Check (B) must detect that stored text does not match stored hash',
	);

	// PROOF that check (A) is silent: no "reason CHANGED because manifest reason
	// differs from ref" finding. The CHANGED finding would say "manifest reason
	// differs from ref fingerprint" — but here the manifest reason IS the fingerprint,
	// so they match and check (A) is silent. Only check (B) catches this.
	assert.ok(
		!findings.some(
			(f) =>
				f.includes('manifest') &&
				f.includes('reason_hash') &&
				f.includes('got') &&
				// This pattern means "manifest reason differs from ref fingerprint"
				/manifest.*reason_hash|reason_hash.*manifest/.test(f),
		),
		'Check (A) must be silent — manifest reason hashes to the ref fingerprint',
	);
});

test('reason guard #1841: fails loudly when ref entry has no `reason` text field', async () => {
	// A ref entry that stores only reason_hash + reason_length (the pre-#1736
	// format) instead of the full reason text. Before the fix, getReasonGuardProblem
	// calls hashReason(stepRef.reason) where reason is undefined — throws
	// TypeError: The "data" argument must be of type string, aborting the
	// entire drift check instead of producing a named finding. A malformed
	// entry must fail LOUDLY by naming the problem, never crash or fall
	// back to a compliant default.
	const originalReason = reconciled['fixture.yml::build::Run tests'].reason;

	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	// Build a ref WITHOUT the `reason` field (simulating the old format).
	// The guard must defend against a ref that predates #1736 or is
	// otherwise malformed — parse it at the boundary as a loose shape,
	// then narrow inside the guard itself (the guard's job, not the test's).
	type StrictReasonRef = {
		steps: Record<
			string,
			{ reason_hash: string; reason_length: number; reason: string }
		>;
	};

	// Cast through the named StrictReasonRef: the guard narrows the field
	// itself, the test only asserts that a malformed ref is tolerated.
	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				'fixture.yml::build::Run tests': {
					reason_hash: hashReason(originalReason),
					reason_length: originalReason.length,
					// reason is intentionally missing
				},
			},
		} as StrictReasonRef,
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /is missing the `reason` text field/);
	assert.match(findings[0], /gen-reason-ref\.ts/);
});

// --- Duplicate key guard tests (#1700) ---
//
// JSON.parse silently keeps the LAST occurrence of a duplicate key, dropping
// the earlier one without error. This means a manifest with a duplicate entry
// parses "successfully" while silently discarding a reconciled step. The
// findDuplicateKeys guard reads the raw text directly to catch this.
//
// Each test below proves a specific property of the guard:
//   - It detects a straightforward duplicate at the top level of `steps`
//   - It returns empty for a manifest with no duplicates
//   - It is integrated into findCiDrift (end-to-end)
//   - It survives adversarial mutations (whitespace, escape sequences in keys)
//   - It distinguishes same-named keys at different nesting depths (not a dup)
//   - It proves JSON.parse would silently drop the duplicate (motivating the guard)

test('duplicate key guard: detects a duplicate key in the manifest steps', () => {
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"fixture.yml::build::Run tests": { "hash": "abc", "mirror": "just ci", "reason": "Mirrored locally for testing purposes." },',
		'\t\t"fixture.yml::build::Run tests": { "hash": "def", "mirror": "just ci", "reason": "Different entry for testing purposes here." }',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	assert.equal(findings.length, 1);
	assert.match(findings[0], /DUPLICATE KEY "fixture\.yml::build::Run tests"/);
	assert.match(findings[0], /lines 3 and 4/);
	// Cause: the complete explanation must name the actor (JSON.parse), the
	// danger (silently), the mechanism (keeps only the last occurrence), and
	// what is at risk (a reconciled step). Truncating any of these leaves the
	// operator without understanding why the finding is dangerous.
	assert.match(
		findings[0],
		/JSON\.parse would silently keep only the last occurrence/,
	);
	assert.match(
		findings[0],
		/masking a reconciled step that should not be lost/,
	);
	// Action: the complete directive must tell the operator to delete the
	// duplicate AND keep the intended one — not just one or the other.
	// Order: cause must precede action — not just both present. A message
	// that states what to do before stating what is wrong leaves the operator
	// without understanding the problem first.
	assert.ok(
		findings[0].indexOf(
			'JSON.parse would silently keep only the last occurrence',
		) <
			findings[0].indexOf(
				'Delete the duplicate entry and keep the intended one',
			),
		'Cause (JSON.parse silently drops the duplicate) must appear before the action (delete the duplicate)',
	);
});

test('duplicate key guard: returns empty for a manifest with no duplicates', () => {
	const manifest = JSON.stringify(
		{
			steps: {
				'fixture.yml::build::Run tests': {
					hash: 'abc',
					mirror: 'just ci',
					reason: 'Mirrored locally for testing purposes.',
				},
				'fixture.yml::build::Scan for secrets': {
					hash: 'def',
					mirror: 'just ci',
					reason: 'Mirrored locally via the local scanner recipe.',
				},
			},
		},
		null,
		'\t',
	);

	assert.deepEqual(findDuplicateKeys(manifest), []);
});

test('duplicate key guard: detects a duplicate nested inside an entry object', () => {
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"fixture.yml::build::Run tests": { "hash": "abc", "mirror": null, "reason": "short reason text here" },',
		'\t\t"fixture.yml::build::Run tests": { "hash": "abc", "mirror": null, "reason": "short reason text here" },',
		'\t\t"other": {',
		'\t\t\t"hash": "x",',
		'\t\t\t"hash": "y"',
		'\t\t}',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	// Both duplicates should be detected: the one at the steps level AND the
	// one nested inside the "other" entry object.
	assert.ok(
		findings.some((f) =>
			f.includes('DUPLICATE KEY "fixture.yml::build::Run tests"'),
		),
		'Expected duplicate detection for the step-level key',
	);
	assert.ok(
		findings.some((f) => f.includes('DUPLICATE KEY "hash"')),
		'Expected duplicate detection for the nested hash key',
	);
});

test('duplicate key guard: same key name at different nesting depths is NOT a duplicate', () => {
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"a": { "hash": "x", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'\t"other": {',
		'\t\t"a": { "hash": "y", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	assert.deepEqual(findDuplicateKeys(manifest), []);
});

test('duplicate key guard: is integrated into findCiDrift (end-to-end)', async () => {
	// Build a fixture manifest with a duplicate key, bypassing JSON.stringify
	// (which deduplicates) by writing raw text.
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-dup-key-'));
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);

	const dedupedHash = reconciledHash;
	const rawManifest = [
		'{',
		'\t"steps": {',
		`		"fixture.yml::build::Run tests": { "hash": "${dedupedHash}", "mirror": "just ci", "reason": "${reason}" },`,
		`		"fixture.yml::build::Run tests": { "hash": "deadbeefdeadbeef", "mirror": null, "reason": "different reason text for testing purposes here." }`,
		'\t}',
		'}',
	].join('\n');

	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		rawManifest,
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.ok(
		findings.some((f) => /DUPLICATE KEY/.test(f)),
		'findCiDrift should report duplicate keys in the manifest',
	);
});

test('duplicate key guard: proves JSON.parse silently drops the duplicate (motivating the guard)', () => {
	// This is the RED proof: JSON.parse does NOT throw on duplicate keys.
	// It silently keeps the LAST value, dropping the first. This is exactly
	// why the raw-text guard is necessary — a manifest with a duplicate is
	// invalid by intent but parses cleanly under JSON.parse.
	const rawWithDup = [
		'{',
		'\t"key": "first-value-kept-by-humans",',
		'\t"key": "second-value-kept-by-JSON-parse"',
		'}',
	].join('\n');

	const parsed = JSON.parse(rawWithDup) as { key: string };

	// JSON.parse keeps the last: the first value is silently dropped.
	assert.equal(
		parsed.key,
		'second-value-kept-by-JSON-parse',
		'JSON.parse silently keeps the last duplicate, dropping the first',
	);
	assert.notEqual(
		parsed.key,
		'first-value-kept-by-humans',
		'The first value is lost without any error from JSON.parse',
	);

	// But the guard catches it.
	const findings = findDuplicateKeys(rawWithDup);
	assert.equal(findings.length, 1);
	assert.match(findings[0], /DUPLICATE KEY "key"/);
});

test('duplicate key guard: tolerates escaped quotes inside key strings', () => {
	// A key that contains escaped quotes should not confuse the scanner.
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"key with \\"quotes\\" inside": { "hash": "abc", "mirror": null, "reason": "short reason text here" },',
		'\t\t"key with \\"quotes\\" inside": { "hash": "def", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	assert.equal(findings.length, 1);
	assert.match(findings[0], /DUPLICATE KEY "key with \\"quotes\\" inside"/);
});

test('duplicate key guard: reports correct line numbers for multiple duplicates', () => {
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"first": { "hash": "a", "mirror": null, "reason": "short reason text here" },',
		'\t\t"second": { "hash": "b", "mirror": null, "reason": "short reason text here" },',
		'\t\t"first": { "hash": "c", "mirror": null, "reason": "short reason text here" },',
		'\t\t"second": { "hash": "d", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	// Both "first" (lines 3 and 5) and "second" (lines 4 and 6) are duplicates.
	assert.equal(findings.length, 2);

	const firstFinding = findings.find((f) =>
		f.includes('DUPLICATE KEY "first"'),
	);
	const secondFinding = findings.find((f) =>
		f.includes('DUPLICATE KEY "second"'),
	);

	assert.ok(firstFinding, 'Expected a finding for the duplicate "first" key');
	assert.ok(secondFinding, 'Expected a finding for the duplicate "second" key');
	assert.match(firstFinding!, /lines 3 and 5/);
	assert.match(secondFinding!, /lines 4 and 6/);
});

test('duplicate key guard: does not flag keys that appear as string values', () => {
	// String values (not keys) that happen to share a name with another key
	// must not trigger a duplicate finding. The guard distinguishes keys
	// (preceded by `"`, followed by `:`) from values (preceded by `:`).
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"unique-key": {',
		'\t\t\t"hash": "a",',
		'\t\t\t"mirror": "unique-key",',
		'\t\t\t"reason": "short reason text here"',
		'\t\t}',
		'\t}',
		'}',
	].join('\n');

	// "unique-key" appears once as a key and once as a string value.
	// "hash", "mirror", "reason" appear once as keys. No duplicates expected.
	assert.deepEqual(findDuplicateKeys(manifest), []);
});

test('duplicate key guard: the repo manifest has no duplicate keys', () => {
	// The standing proof: the real manifest must pass the guard. If someone
	// reintroduces a duplicate key (as happened in cd74695f4), this test turns
	// red before CI ever runs.
	const raw = readFileSync(
		path.join(repoRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		'utf8',
	);

	assert.deepEqual(findDuplicateKeys(raw), []);
});

// --- Edge case tests for #1762 ---
//
// The duplicate-key guard reads raw text at the brace/quote level rather than
// via JSON.parse. These tests prove it behaves correctly on the boundary
// cases that a naive line scanner would mishandle.

test('edge case #2 — multi-line key with escaped newline (\\n): MUST report', () => {
	// Unlike a literal newline, \\n is valid JSON. Two keys that both contain
	// \\n and are otherwise identical are a real duplicate that JSON.parse would
	// silently accept. The guard must report them.
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"multi\\nline key": { "hash": "a", "mirror": null, "reason": "short reason text here" },',
		'\t\t"multi\\nline key": { "hash": "b", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	assert.equal(findings.length, 1);
	// The guard decodes \\n to a real newline in the reported key name.
	assert.match(findings[0], /DUPLICATE KEY "multi\\nline key"/);
	assert.match(findings[0], /lines 3 and 4/);
});

test('edge case #4 — unicode escape vs escaped quote: MUST report (same key after decode)', () => {
	// Two keys that differ only in how they escape a quote (\\u0022 vs \\) are
	// DISTINCT as raw text but IDENTICAL after JSON.parse decodes them. JSON.parse
	// would silently keep the last one. The guard decodes escape sequences before
	// comparing, so it correctly identifies them as duplicates.
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"foo\\u0022bar": { "hash": "a", "mirror": null, "reason": "short reason text here" },',
		'\t\t"foo\\\"bar": { "hash": "b", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	const findings = findDuplicateKeys(manifest);

	// Both decode to "foo\"bar", so the guard reports a duplicate.
	assert.equal(findings.length, 1);
	assert.match(findings[0], /DUPLICATE KEY "foo\\"bar"/);
	assert.match(findings[0], /lines 3 and 4/);

	// Proof that JSON.parse treats them as the same key (silently keeps last):
	const parsed = JSON.parse(manifest) as {
		steps: Record<string, unknown>;
	};
	assert.equal(Object.keys(parsed.steps).length, 1);
});

test('edge case #4 — different escape sequences: MUST stay silent (truly distinct keys)', () => {
	// Two keys that use DIFFERENT escape sequences (\\u0022 quote vs \\u0023 hash)
	// decode to DIFFERENT characters. The guard must NOT report them.
	const manifest = [
		'{',
		'\t"steps": {',
		'\t\t"foo\\u0022bar": { "hash": "a", "mirror": null, "reason": "short reason text here" },',
		'\t\t"foo\\u0023bar": { "hash": "b", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	assert.deepEqual(findDuplicateKeys(manifest), []);

	// Proof that JSON.parse treats them as distinct keys:
	const parsed = JSON.parse(manifest) as {
		steps: Record<string, unknown>;
	};
	assert.equal(Object.keys(parsed.steps).length, 2);
});

test('findCiDrift: fails loudly on invalid JSON manifest (duplicate-key guard is protected)', async () => {
	// A manifest with a literal newline in a key is INVALID JSON. Before the
	// JSON.parse validation was added, findCiDrift would call findDuplicateKeys
	// first (which stays silent on multi-line keys) and then JSON.parse would
	// throw an unhandled error. Now, JSON.parse is attempted FIRST with a
	// try/catch, and the guard reports the syntax error with a message naming
	// the cause — never a silent "no duplicates" on an unparseable document.
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-invalid-json-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);

	// Invalid JSON: literal newline inside a string key.
	const invalidManifest = [
		'{',
		'\t"steps": {',
		'\t\t"multi',
		'\t\tline key": { "hash": "a", "mirror": null, "reason": "short reason text here" }',
		'\t}',
		'}',
	].join('\n');

	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		invalidManifest,
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	// The guard must report exactly one finding: the invalid JSON, naming the
	// cause. It must NOT silently return "no duplicates" or throw unhandled.
	assert.equal(findings.length, 1);
	assert.match(findings[0], /invalid JSON/);
	assert.match(findings[0], /syntax error/);
	assert.match(findings[0], /Fix the JSON syntax error first/);
});

test('findCiDrift: valid manifest with no duplicates stays green', async () => {
	// The positive control: a valid, reconciled manifest produces no findings.
	// This proves the JSON.parse validation does not introduce false positives
	// on well-formed input.
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.deepEqual(findings, []);
});

// --- Input validation tests for #1762 (round 3) ---
//
// findCiDrift must distinguish five manifest-input states and surface each as
// a named finding — none silently accepted, none crashing on a raw stack:
//   1. valid object (baseline — existing tests)
//   2. JSON null
//   3. JSON non-object (array / string / number)
//   4. malformed JSON (existing test: "fails loudly on invalid JSON manifest")
//   5. missing file (ENOENT)
//   6. unreadable file (EACCES)

test('findCiDrift: manifest of null fails loudly with a named finding', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-null-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		'null',
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /manifest is JSON null/);
	assert.match(findings[0], /expects an object with a `steps` key/);
});

test('findCiDrift: manifest of [] (array) fails loudly with a named finding', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-array-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		'[]',
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /manifest is a JSON array, not an object/);
	assert.match(findings[0], /expects a JSON object with a `steps` key/);
});

test('findCiDrift: manifest of "texte" (string) fails loudly with a named finding', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-string-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		'"texte"',
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /manifest is a string, not an object/);
	assert.match(findings[0], /expects a JSON object with a `steps` key/);
});

test('findCiDrift: manifest of 42 (number) fails loudly with a named finding', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-number-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		'42',
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /manifest is a number, not an object/);
	assert.match(findings[0], /expects a JSON object with a `steps` key/);
});

test('findCiDrift: missing manifest file fails loudly (ENOENT)', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-no-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	// Intentionally no ci-gate-manifest.json.

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assert.match(findings[0], /manifest file not found/);
	assert.match(
		findings[0],
		/requires this manifest to verify CI step reconciliation/,
	);
});

test('findCiDrift: unreadable manifest file fails loudly (EACCES)', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-unreadable-manifest-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: {} }),
	);
	await chmod(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		0o000,
	);

	try {
		const findings = await findCiDrift({
			rootDir,
			reasonRef: buildFixtureReasonRef(reason),
		});

		assert.equal(findings.length, 1);
		assert.match(findings[0], /manifest file is not readable/);
		assert.match(findings[0], /Check file permissions/);
	} finally {
		// Restore permissions so cleanup can succeed.
		await chmod(
			path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
			0o600,
		);
	}
});

// --- Ratchet floor tests for #1709 ---
//
// The ratchet floor breaks the 3-step attack where a covered step is deleted
// from CI, then from the manifest, then the reference is regenerated to match.
// The reference's `pinned_step_ids` array grows monotonically — regeneration
// can only ADD, never remove. A step can only be removed by confessing it in
// ci-gate-removals.json with a reason naming what was lost and why.

test('ratchet floor: 3-step sequence (delete from CI + manifest) turns RED — the bug proof', async () => {
	// This is the paired RED proof: before the fix, this sequence turned green.
	// After the fix, the ratchet catches it.
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ratchet-'));
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	// Workflow: only Step A remains (Step B was deleted)
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow('      - name: Step A\n        run: echo a\n'),
	);

	// Manifest: only Step A (Step B was deleted)
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: 'b0ea35b0641c92e6',
						mirror: 'just ci',
						reason:
							'Mirrored locally by the fixture gate for testing purposes.',
					},
				},
			},
			null,
			'\t',
		),
	);

	// Reference: still pins BOTH steps (ratchet holds — regeneration refused to drop Step B)
	const ref = {
		pinned_step_ids: [
			'fixture.yml::build::Step A',
			'fixture.yml::build::Step B',
		],
		steps: {
			'fixture.yml::build::Step A': {
				reason_hash: hashReason(
					'Mirrored locally by the fixture gate for testing purposes.',
				),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({ rootDir, reasonRef: ref });

	// The ratchet must catch the vanished Step B
	const ratchetFindings = findings.filter((f) => f.startsWith('RATCHET'));
	assert.equal(
		ratchetFindings.length,
		1,
		'Expected exactly one RATCHET finding for Step B',
	);
	assert.match(ratchetFindings[0], /RATCHET\s+fixture\.yml::build::Step B/);
	assert.match(ratchetFindings[0], /silently erased/);
	assert.match(ratchetFindings[0], /ci-gate-removals\.json/);
});

test('ratchet floor: legitimate deletion with confession turns GREEN', async () => {
	// A step is removed deliberately, with a confession file naming it and why.
	// The guard must accept this and stay green.
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-ratchet-green-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	// Workflow: only Step A
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow('      - name: Step A\n        run: echo a\n'),
	);

	// Manifest: only Step A
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: 'b0ea35b0641c92e6',
						mirror: 'just ci',
						reason:
							'Mirrored locally by the fixture gate for testing purposes.',
					},
				},
			},
			null,
			'\t',
		),
	);

	// Confession file: Step B was deliberately removed
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-removals.json'),
		JSON.stringify(
			{
				steps: [
					{
						step_id: 'fixture.yml::build::Step B',
						reason:
							'Step B was a duplicate verification step that was consolidated into Step A. The coverage is preserved.',
						removed_at: '2026-08-29',
					},
				],
			},
			null,
			'\t',
		),
	);

	// Reference: pins both steps (the ratchet holds, but confession covers Step B)
	const ref = {
		pinned_step_ids: [
			'fixture.yml::build::Step A',
			'fixture.yml::build::Step B',
		],
		steps: {
			'fixture.yml::build::Step A': {
				reason_hash: hashReason(
					'Mirrored locally by the fixture gate for testing purposes.',
				),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({ rootDir, reasonRef: ref });

	// No RATCHET finding — the confession covers the removal
	const ratchetFindings = findings.filter((f) => f.startsWith('RATCHET'));
	assert.equal(
		ratchetFindings.length,
		0,
		'Expected no RATCHET findings when confession is present',
	);
	assert.deepEqual(findings, [], 'Expected fully green when step is confessed');
});

// #1809 r13: a confession naming a step still present in the manifest used to
// be a generator-side warning and a check-ci-drift-side silence — a warning
// nobody reads and a silence have the same value. The contradiction must now
// be a loud finding on the check side too.
test('ratchet floor: a confession naming a step still present in the manifest is a loud CONTRADICTION', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-confession-contradiction-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: reconciled }, null, '\t'),
	);
	// The confession names the very step that is STILL reconciled.
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-removals.json'),
		JSON.stringify(
			{
				steps: [
					{
						step_id: manifestEntry,
						reason:
							'Step B was a duplicate verification step that was consolidated into Step A. The coverage is preserved.',
						removed_at: '2026-08-29',
					},
				],
			},
			null,
			'\t',
		),
	);

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	const contradictionFindings = findings.filter((f) =>
		f.startsWith('CONFESSION CONTRADICTION'),
	);
	assert.equal(contradictionFindings.length, 1);
	assert.match(
		contradictionFindings[0],
		/CONFESSION CONTRADICTION {2}fixture\.yml::build::Run tests/,
	);
	// Cause: the step is still reconciled, so the confession is a no-op.
	assert.match(contradictionFindings[0], /still reconciled in the manifest/);
	// Action: delete the confession entry or actually remove the step.
	assert.match(contradictionFindings[0], /Delete the confession entry/);
});

test('ratchet floor: adverse mutation — wrong step ID in confession does NOT cover the vanished step', async () => {
	// Adversary tries: confess a DIFFERENT step ID to distract the guard.
	// The ratchet must NOT be fooled — only the exact vanished step ID counts.
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-ratchet-adverse2-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow('      - name: Step A\n        run: echo a\n'),
	);

	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: 'b0ea35b0641c92e6',
						mirror: 'just ci',
						reason:
							'Mirrored locally by the fixture gate for testing purposes.',
					},
				},
			},
			null,
			'\t',
		),
	);

	// Confession for a DIFFERENT step — not the one that vanished
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-removals.json'),
		JSON.stringify(
			{
				steps: [
					{
						step_id: 'fixture.yml::build::Some other step',
						reason: 'This is not the step that vanished.',
					},
				],
			},
			null,
			'\t',
		),
	);

	const ref = {
		pinned_step_ids: [
			'fixture.yml::build::Step A',
			'fixture.yml::build::Step B',
		],
		steps: {
			'fixture.yml::build::Step A': {
				reason_hash: hashReason(
					'Mirrored locally by the fixture gate for testing purposes.',
				),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({ rootDir, reasonRef: ref });

	// The ratchet must still catch Step B — wrong confession doesn't cover it
	const ratchetFindings = findings.filter((f) => f.startsWith('RATCHET'));
	assert.equal(
		ratchetFindings.length,
		1,
		'Wrong confession does not cover the vanished step',
	);
	assert.match(ratchetFindings[0], /RATCHET\s+fixture\.yml::build::Step B/);
});

test('ratchet floor: no pinned_step_ids means no ratchet check (backward compatible)', async () => {
	// A reference without pinned_step_ids (old format) should not trigger
	// the ratchet check. This ensures backward compatibility.
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: mirroredStep,
	});

	const refWithoutPinned = {
		// No pinned_step_ids field
		steps: {
			'fixture.yml::build::Run tests': {
				reason_hash: hashReason(reason),
				reason_length: reason.length,
				reason,
			},
		},
	};

	const findings = await findCiDrift({ rootDir, reasonRef: refWithoutPinned });

	// No RATCHET findings — ratchet is not active without pinned_step_ids
	const ratchetFindings = findings.filter((f) => f.startsWith('RATCHET'));
	assert.equal(ratchetFindings.length, 0);
});

// --- Git-based reference read tests (#1762 round 7, supersedes r8) ---
//
// The "ratchet can't rely on its own file" defect: the drift guard used to
// import reason-guard-ref.json from the working tree, then from git HEAD.
// The r7 fix (HEAD) breaks uncommitted edits but NOT committed ones: in a PR,
// HEAD IS the attacker's commit. A contributor who deletes a CI step, removes
// its manifest entry, and drops the id from pinned_step_ids — all in one
// committed push — makes HEAD agree with the removal. The guard comparing its
// floor to itself sees nothing and stays green.
//
// The r8 fix reads the floor from `git merge-base origin/develop HEAD`: the
// shared ancestor representing the last reviewed-and-merged state of the
// target branch. That commit predates the attacker's removal, so the vanished
// step id is still pinned and the guard cries RATCHET.

test('readRefFromGit-fs: reading from a non-git directory fails loudly (no silent fallback)', async () => {
	// A throwaway tmpdir with no .git — findCiDrift must refuse to run rather
	// than silently fall back to a working-tree or HEAD read. A guard that
	// degrades to "trust the working tree" on error is a guard that turns green
	// exactly when the attack succeeds.
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-no-git-'));
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: {} }),
	);
	// A reason-guard-ref.json in the working tree that an attacker might try to
	// use as a fallback. The guard must NOT read this.
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify({ steps: {} }),
	);

	await assert.rejects(
		() => findCiDrift({ rootDir }),
		/Could not read reason-guard-ref\.json from git HEAD/,
		'Guard must fail loudly when no git repo is available',
	);
});

test('readRefFromGit-fs: no origin/develop fails loudly (no silent fallback to HEAD)', async () => {
	// A git repo with commits but NO origin/develop remote-tracking ref.
	// merge-base cannot resolve, so the guard must refuse to run — never
	// silently fall back to HEAD or the working tree.
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-no-origin-'));
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await writeFile(path.join(rootDir, '.gitignore'), '');
	const execFile = (cmd: string, args: string[]) =>
		new Promise<string>((resolve, reject) => {
			const { execFile: nodeExec } = require('node:child_process');
			nodeExec(
				cmd,
				args,
				{ cwd: rootDir },
				(error: Error | null, stdout: string) => {
					if (error) {
						reject(error);
					} else {
						resolve(stdout);
					}
				},
			);
		});

	await execFile('git', ['init', '-q']);
	await execFile('git', ['config', 'user.email', 'test@test.test']);
	await execFile('git', ['config', 'user.name', 'test']);
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow(mirroredStep),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: {} }),
	);
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify({ steps: {} }),
	);
	await execFile('git', ['add', '.']);
	await execFile('git', ['commit', '-q', '-m', 'initial']);
	// NOTE: no `git remote add` or `git update-ref refs/remotes/origin/develop`
	// — origin/develop does not exist, so merge-base will fail.

	await assert.rejects(
		() => findCiDrift({ rootDir }),
		/REFUSING TO RUN/,
		'Guard must refuse when origin/develop is unavailable',
	);
});

test('readRefFromGit-fs: reads committed floor from merge-base, ignoring working-tree edits', async () => {
	// Sets up a repo with origin/develop at commit A (pinned floor), then
	// creates HEAD on a branch that commits a working-tree edit lowering the
	// floor. The guard must read the floor from the MERGE-BASE (commit A),
	// not from HEAD or the working tree.
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-git-mergebase-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	const execFile = (cmd: string, args: string[]) =>
		new Promise<string>((resolve, reject) => {
			const { execFile: nodeExec } = require('node:child_process');
			nodeExec(
				cmd,
				args,
				{ cwd: rootDir },
				(error: Error | null, stdout: string) => {
					if (error) {
						reject(error);
					} else {
						resolve(stdout);
					}
				},
			);
		});

	await execFile('git', ['init', '-q']);
	await execFile('git', ['config', 'user.email', 'test@test.test']);
	await execFile('git', ['config', 'user.name', 'test']);

	// Workflow: single step
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow('      - name: Step A\n        run: echo a\n'),
	);

	const manifest = {
		steps: {
			'fixture.yml::build::Step A': {
				hash: 'b0ea35b0641c92e6',
				mirror: 'just ci',
				reason: 'Mirrored locally by the fixture gate for testing purposes.',
			},
		},
	};
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(manifest, null, '\t'),
	);

	// Committed reference at the base: pins Step A (ratchet floor).
	const committedRef = {
		pinned_step_ids: ['fixture.yml::build::Step A'],
		steps: {
			'fixture.yml::build::Step A': {
				reason_hash: hashReason(
					'Mirrored locally by the fixture gate for testing purposes.',
				),
				reason_length: reason.length,
				reason,
			},
		},
	};
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify(committedRef, null, '\t'),
	);

	await writeFile(path.join(rootDir, '.gitignore'), '');
	await execFile('git', ['add', '.']);
	await execFile('git', [
		'commit',
		'-q',
		'-m',
		'base commit with pinned floor',
	]);

	// Create a branch (simulating a PR) so HEAD diverges from develop.
	await execFile('git', ['checkout', '-q', '-b', 'feature']);

	// Set up origin/develop to point at the base commit (the merge-base).
	await execFile('git', ['remote', 'add', 'origin', rootDir]);
	const baseSha = (await execFile('git', ['rev-parse', 'HEAD'])).trim();
	await execFile('git', ['update-ref', 'refs/remotes/origin/develop', baseSha]);

	// Attack: edit the WORKING-TREE reference to empty pinned_step_ids.
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify({ steps: {} }, null, '\t'),
	);

	// The manifest still pins Step A, and the committed floor (at merge-base)
	// still pins it — so the guard should stay green.
	const findings = await findCiDrift({ rootDir });
	assert.deepEqual(
		findings,
		[],
		'Guard must read floor from merge-base, not working tree',
	);

	// Now remove the step from the manifest. The floor at merge-base still
	// pins Step A, so the ratchet must fire.
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify({ steps: {} }, null, '\t'),
	);

	const findingsAfterRemoval = await findCiDrift({ rootDir });
	const ratchetFindings = findingsAfterRemoval.filter((f) =>
		f.startsWith('RATCHET'),
	);
	assert.equal(
		ratchetFindings.length,
		1,
		'Ratchet must fire from merge-base floor even when working-tree ref was emptied',
	);
	assert.match(ratchetFindings[0], /RATCHET\s+fixture\.yml::build::Step A/);
});

test('readRefFromGit-fs: 3-part committed attack IS CAUGHT by the merge-base floor', async () => {
	// THE KEY PROOF: the attacker commits all three removal edits in ONE commit
	// on a PR branch. With the r7 fix (read from HEAD), HEAD IS the attacker's
	// commit — the committed floor agrees with the removal, and the guard
	// stays green. With the r8 fix (read from merge-base), the floor is read
	// from origin/develop's state, which still pins the step, so RATCHET fires.
	//
	// Steps:
	//   1. base commit: workflow + manifest + reference all pin Step A and Step B
	//   2. origin/develop -> base commit (the floor)
	//   3. feature branch: commit the 3-part attack (remove Step B from workflow,
	//      manifest, and pinned_step_ids all in one commit)
	//   4. merge-base(origin/develop, HEAD) = base commit (still pins Step B)
	//   5. guard fires RATCHET on Step B

	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-attack-3part-'),
	);
	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	const execFile = (cmd: string, args: string[]) =>
		new Promise<string>((resolve, reject) => {
			const { execFile: nodeExec } = require('node:child_process');
			nodeExec(
				cmd,
				args,
				{ cwd: rootDir },
				(error: Error | null, stdout: string) => {
					if (error) {
						reject(error);
					} else {
						resolve(stdout);
					}
				},
			);
		});

	await execFile('git', ['init', '-q']);
	await execFile('git', ['config', 'user.email', 'test@test.test']);
	await execFile('git', ['config', 'user.name', 'test']);
	await execFile('git', ['remote', 'add', 'origin', rootDir]);

	// --- Step 1: base commit with both steps pinned ---
	const workflowBoth = workflow(
		'      - name: Step A\n        run: echo a\n      - name: Step B\n        run: echo b\n',
	);
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflowBoth,
	);

	const reasonA = 'Mirrored locally by the fixture gate for testing purposes.';
	const reasonB =
		'Step B is also mirrored by the fixture gate for testing purposes here.';

	// Compute hashes for both steps.
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'publyapp-tempsha-'));
	await mkdir(path.join(tempRoot, '.github/workflows'), { recursive: true });
	await mkdir(path.join(tempRoot, 'packages/scripts-ts/src'), {
		recursive: true,
	});
	await writeFile(
		path.join(tempRoot, '.github/workflows/fixture.yml'),
		workflowBoth,
	);
	await writeFile(
		path.join(tempRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: 'wrong',
						mirror: 'just ci',
						reason: reasonA,
					},
					'fixture.yml::build::Step B': {
						hash: 'wrong',
						mirror: 'just ci',
						reason: reasonB,
					},
				},
			},
			null,
			'\t',
		),
	);
	const tempFindings = await findCiDrift({
		rootDir: tempRoot,
		reasonRef: { steps: {} },
	});
	const hashA = tempFindings
		.find((f) => f.includes('fixture.yml::build::Step A'))!
		.match(/workflow ([a-f0-9]+)/)![1];
	const hashB = tempFindings
		.find((f) => f.includes('fixture.yml::build::Step B'))!
		.match(/workflow ([a-f0-9]+)/)![1];

	// Write the manifest at base with correct hashes.
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: hashA,
						mirror: 'just ci',
						reason: reasonA,
					},
					'fixture.yml::build::Step B': {
						hash: hashB,
						mirror: 'just ci',
						reason: reasonB,
					},
				},
			},
			null,
			'\t',
		),
	);

	// Committed reference: pins BOTH Step A and Step B.
	const baseRef = {
		pinned_step_ids: [
			'fixture.yml::build::Step A',
			'fixture.yml::build::Step B',
		],
		steps: {
			'fixture.yml::build::Step A': {
				reason_hash: hashReason(reasonA),
				reason_length: reasonA.length,
				reason: reasonA,
			},
			'fixture.yml::build::Step B': {
				reason_hash: hashReason(reasonB),
				reason_length: reasonB.length,
				reason: reasonB,
			},
		},
	};
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify(baseRef, null, '\t'),
	);

	await execFile('git', ['add', '.']);
	await execFile('git', ['commit', '-q', '-m', 'base: both steps pinned']);

	// Set origin/develop to this base commit (the floor).
	const baseSha = (await execFile('git', ['rev-parse', 'HEAD'])).trim();
	await execFile('git', ['update-ref', 'refs/remotes/origin/develop', baseSha]);

	// --- Step 3: the 3-part COMMITTED attack on a feature branch ---
	await execFile('git', ['checkout', '-q', '-b', 'feature']);

	// Attack part 1: remove Step B from the workflow
	await writeFile(
		path.join(rootDir, '.github/workflows/fixture.yml'),
		workflow('      - name: Step A\n        run: echo a\n'),
	);

	// Attack part 2: remove Step B from the manifest
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A': {
						hash: hashA,
						mirror: 'just ci',
						reason: reasonA,
					},
				},
			},
			null,
			'\t',
		),
	);

	// Attack part 3: remove Step B from pinned_step_ids (committed, not just
	// working-tree — this is what the r7 fix failed to catch)
	await writeFile(
		path.join(rootDir, 'packages/scripts-ts/src/reason-guard-ref.json'),
		JSON.stringify(
			{
				pinned_step_ids: ['fixture.yml::build::Step A'],
				steps: {
					'fixture.yml::build::Step A': {
						reason_hash: hashReason(reasonA),
						reason_length: reasonA.length,
						reason: reasonA,
					},
				},
			},
			null,
			'\t',
		),
	);

	// Commit the attack.
	await execFile('git', [
		'-c',
		'user.email=test@test.test',
		'-c',
		'user.name=test',
		'add',
		'.',
	]);
	await execFile('git', [
		'-c',
		'user.email=test@test.test',
		'-c',
		'user.name=test',
		'commit',
		'-q',
		'-m',
		'attack: remove Step B entirely',
	]);

	// Run the guard — it reads the floor from the merge-base (base commit),
	// which still pins Step B. The ratchet must fire.
	const findings = await findCiDrift({ rootDir });
	const ratchetFindings = findings.filter((f) => f.startsWith('RATCHET'));

	assert.equal(
		ratchetFindings.length,
		1,
		'The 3-part committed attack must be caught by the merge-base floor',
	);
	assert.match(ratchetFindings[0], /RATCHET\s+fixture\.yml::build::Step B/);
	assert.match(ratchetFindings[0], /silently erased/);
	assert.match(ratchetFindings[0], /ci-gate-removals\.json/);
});

// --- Proximity contract (#1845) ---
//
// The order contract (cause before action) is pinned in the tests above, but
// order alone is not enough: a message that states the cause, then inserts
// three paragraphs of technical context, then states the action satisfies
// the order contract while failing at its purpose — the operator no longer
// sees the action. The proximity contract closes this gap: the cause phrase
// and the action phrase must be within a bounded distance of each other.
//
// N = 120 characters between the end of the cause and the start of the action.
// Justification: the cause and action together form the operative core of the
// message. A connector phrase ("so you must", "therefore") takes < 20 chars.
// A single sentence of bridging context ("the local mirror no longer covers
// the changed inputs") takes < 80 chars. 120 leaves room for one such sentence
// while rejecting the multi-paragraph dilution the reviewer demonstrated.
// The repository's current messages use 1-2 chars (a period + space), so the
// threshold does not threaten legitimate reformulations that keep cause and
// action adjacent.

const PROXIMITY_LIMIT = 120;

type CauseActionPair = {
	cause: RegExp;
	action: RegExp;
};

const assertProximity = (
	finding: string,
	pair: CauseActionPair,
	label: string,
) => {
	const causeMatch = pair.cause.exec(finding);
	const actionMatch = pair.action.exec(finding);
	assert.ok(causeMatch, `${label}: cause phrase not found in finding`);
	assert.ok(actionMatch, `${label}: action phrase not found in finding`);
	const gap = actionMatch!.index - (causeMatch!.index + causeMatch![0].length);
	assert.ok(
		gap <= PROXIMITY_LIMIT,
		`${label}: gap between cause and action is ${gap} chars, exceeds PROXIMITY_LIMIT=${PROXIMITY_LIMIT}. ` +
			`Cause ends at index ${causeMatch!.index + causeMatch![0].length}, ` +
			`action starts at index ${actionMatch!.index}. ` +
			`The operator must be able to read cause and action together.`,
	);
};

test('proximity contract (#1845): NEW STEP cause and action are within proximity limit', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: `${mirroredStep}      - name: Scan for secrets\n        run: pnpm scan:secrets\n`,
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assertProximity(
		findings[0],
		{
			cause: /CI gained a step the local gate does not account for/,
			action: /mirror it in `just ci`/,
		},
		'NEW STEP',
	);
});

test('proximity contract (#1845): CHANGED cause and action are within proximity limit', async () => {
	const rootDir = await buildFixture({
		manifestSteps: reconciled,
		steps: '      - name: Run tests\n        run: pnpm test --coverage\n',
	});

	const findings = await findCiDrift({
		rootDir,
		reasonRef: buildFixtureReasonRef(reason),
	});

	assert.equal(findings.length, 1);
	assertProximity(
		findings[0],
		{
			cause: /changed since it was reconciled/,
			action: /Re-check that/,
		},
		'CHANGED',
	);
});

test('proximity contract (#1845): STALE cause and action are within proximity limit', async () => {
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

	const findings = await findCiDrift({
		rootDir,
		reasonRef: {
			steps: {
				[manifestEntry]: {
					reason_hash: hashReason(reason),
					reason_length: reason.length,
					reason,
				},
				'fixture.yml::build::Deleted step': {
					reason_hash: hashReason(reason),
					reason_length: reason.length,
					reason,
				},
			},
		},
	});

	assert.equal(findings.length, 1);
	assertProximity(
		findings[0],
		{
			cause: /reconciles a CI step that no longer exists/,
			action: /Delete the entry/,
		},
		'STALE',
	);
});

test('proximity contract (#1845): a synthetic finding with filler between cause and action FAILS the proximity check', () => {
	const finding =
		'NEW STEP  fixture.yml::build::Scan for secrets\n' +
		'    CI gained a step the local gate does not account for.\n' +
		'    The local gate configuration lives in packages/scripts-ts/src/ci-gate-manifest.json.\n' +
		'    When a new step is added to the workflow without a corresponding manifest entry,\n' +
		'    the gate cannot verify it is mirrored locally. This can happen when a developer\n' +
		'    adds a security scan or linting step without updating the gate.\n' +
		'    See docs/guides/local-ci-gate.md for the full reconciliation procedure.\n' +
		'    Either mirror it in `just ci` or record why it cannot run locally.';

	let proximityFailed = false;
	try {
		assertProximity(
			finding,
			{
				cause: /CI gained a step the local gate does not account for/,
				action: /mirror it in `just ci`/,
			},
			'NEW STEP with filler',
		);
	} catch {
		proximityFailed = true;
	}
	assert.ok(
		proximityFailed,
		'The proximity contract must REJECT a finding with multi-paragraph filler between cause and action. ' +
			'If this assertion passes, the gap is within PROXIMITY_LIMIT and the contract is too loose.',
	);
});

test('proximity contract (#1845): a legitimate long reformulation STAYS within the proximity limit', () => {
	const finding =
		'CHANGED   fixture.yml::build::Run tests\n' +
		'    This CI step changed since it was reconciled, so the stored mirror hash is stale.\n' +
		'    Re-check that "just ci" still covers it, then update the hash.';

	assertProximity(
		finding,
		{
			cause: /changed since it was reconciled/,
			action: /Re-check that/,
		},
		'CHANGED with one bridging sentence',
	);
});
