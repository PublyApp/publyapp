import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { test } from 'vitest';

const execFileAsync = promisify(execFile);

// Absolute path to the script. Resolved from repo root (../../ from packages/scripts-ts).
const repoRoot = path.resolve(process.cwd(), '../..');
const scriptPath = path.resolve(
	repoRoot,
	'packages/scripts-ts/src/gen-reason-ref.ts',
);

const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
const outputPath = 'packages/scripts-ts/src/reason-guard-ref.json';
const removalsPath = 'packages/scripts-ts/src/ci-gate-removals.json';

/**
 * Builds a throwaway git repo with a manifest and optional reference file.
 * Returns the root directory.
 *
 * The repo is set up with an `origin/develop` ref pointing at the initial
 * commit, mirroring the production CI scenario where the merge-base resolves.
 * The generator reads the ratchet floor from the merge-base of origin/develop
 * and HEAD — this is the only way it can be exercised end-to-end. Tests that
 * want to assert the "no origin/develop" failure mode must NOT use this
 * helper; they construct a repo without the ref so the loud refusal fires.
 */
const buildRepo = async ({
	manifestSteps,
	reference,
	removals,
}: {
	manifestSteps: Record<string, unknown>;
	reference?: { pinned_step_ids?: string[]; steps?: Record<string, unknown> };
	removals?: { steps: Array<{ step_id: string; reason: string }> };
}): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-gen-ref-'));

	await mkdir(path.join(rootDir, '.git'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	// Initialize a git repo with one commit so `git show HEAD:` works.
	await execFileAsync('git', ['init'], { cwd: rootDir });
	await execFileAsync('git', ['config', 'user.email', 'test@test.test'], {
		cwd: rootDir,
	});
	await execFileAsync('git', ['config', 'user.name', 'Test'], {
		cwd: rootDir,
	});

	// Write the manifest.
	await writeFile(
		path.join(rootDir, manifestPath),
		JSON.stringify({ steps: manifestSteps }, null, '\t'),
	);

	// Write the reference file (optional).
	if (reference) {
		await writeFile(
			path.join(rootDir, outputPath),
			JSON.stringify(reference, null, '\t'),
		);
	}

	// Write the removals file (optional).
	if (removals) {
		await writeFile(
			path.join(rootDir, removalsPath),
			JSON.stringify(removals, null, '\t'),
		);
	}

	// Commit everything so HEAD exists.
	await execFileAsync('git', ['add', '.'], { cwd: rootDir });
	await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: rootDir });

	// Set up an `origin/develop` ref pointing at the initial commit so the
	// generator's `git merge-base origin/develop HEAD` resolves. This mirrors
	// what the production CI workflow does (fetches the base branch before
	// running the gate). Without this ref, the generator refuses to run —
	// which is the correct behavior in production, but here we want to
	// exercise the actual ratchet / integrity logic, not the loud-failure
	// path (which has its own dedicated test).
	await execFileAsync(
		'git',
		['update-ref', 'refs/remotes/origin/develop', 'HEAD'],
		{ cwd: rootDir },
	);

	return rootDir;
};

/**
 * Runs the gen-reason-ref.ts script in the given repo root.
 * The script reads from cwd, so we pass rootDir as cwd.
 * Returns { stdout, stderr, exitCode } — never throws on non-zero exit.
 */
const runScript = async (rootDir: string) => {
	try {
		const { stdout, stderr } = await execFileAsync('node', [scriptPath], {
			cwd: rootDir,
			encoding: 'utf8',
		});
		return { stdout, stderr, exitCode: 0 };
	} catch (error: unknown) {
		const e = error as { stdout?: string; stderr?: string; code?: number };
		return {
			stdout: e.stdout ?? '',
			stderr: e.stderr ?? '',
			exitCode: e.code ?? 1,
		};
	}
};

test('integrity assertion: fails when pinned_step_ids has ID missing from steps{}', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: ['fixture.yml::build::Step A', 'vanished-step'],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
			},
		},
	});

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('Integrity check failed') ||
			result.stdout.includes('Integrity check failed'),
		true,
		'Expected integrity check failure',
	);
});

test('integrity assertion: extra step in steps{} that IS in manifest is legitimate growth (regenerates)', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
			'fixture.yml::build::Step B': {
				hash: 'def456',
				mirror: 'just ci',
				reason: 'Step B reason text.',
			},
		},
		reference: {
			pinned_step_ids: ['fixture.yml::build::Step A'],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
	});

	const result = await runScript(rootDir);

	assert.equal(
		result.exitCode,
		0,
		'Expected success — extra step in steps{} is in the manifest, so this is legitimate growth',
	);
	assert.equal(
		result.stdout.includes('Regenerated'),
		true,
		'Expected regeneration',
	);
});

test('integrity assertion: phantom step in steps{} (not in manifest) fails', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: ['fixture.yml::build::Step A'],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step PHANTOM': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
	});

	const result = await runScript(rootDir);

	assert.notEqual(
		result.exitCode,
		0,
		'Expected non-zero exit for phantom step',
	);
	assert.equal(
		result.stderr.includes('Integrity check failed') ||
			result.stdout.includes('Integrity check failed'),
		true,
		'Expected integrity check failure naming phantom step',
	);
	assert.equal(
		result.stderr.includes('phantom') || result.stdout.includes('phantom'),
		true,
		'Expected error naming the phantom step',
	);
});

test('integrity assertion: pinned step removed from steps{} (floor-lowering) fails', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
			},
		},
	});

	const result = await runScript(rootDir);

	assert.notEqual(
		result.exitCode,
		0,
		'Expected non-zero exit for floor-lowering',
	);
	assert.equal(
		result.stderr.includes('Integrity check failed') ||
			result.stdout.includes('Integrity check failed'),
		true,
		'Expected integrity check failure naming orphaned pinned step',
	);
	assert.equal(
		result.stderr.includes('floor-lowering') ||
			result.stdout.includes('floor-lowering'),
		true,
		'Expected error naming the floor-lowering attack',
	);
});

test('git floor: cannot lower pinned_step_ids in the same commit', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
	});

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('Refusing to regenerate') ||
			result.stdout.includes('Refusing to regenerate'),
		true,
		'Expected refusal to regenerate',
	);
});

test('git floor: confession with valid reason allows removal', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
		removals: {
			steps: [
				{
					step_id: 'fixture.yml::build::Step B',
					reason:
						'Step B was a duplicate verification step that was consolidated into Step A. The coverage is preserved.',
				},
			],
		},
	});

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('Refusing to regenerate'),
		false,
		'Expected success',
	);
	assert.equal(
		result.stdout.includes('Regenerated'),
		true,
		'Expected regeneration',
	);
});

test('confession quality bar: reason shorter than 24 chars fails', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
		removals: {
			steps: [
				{
					step_id: 'fixture.yml::build::Step B',
					reason: 'x',
				},
			],
		},
	});

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('shorter than 24 characters') ||
			result.stdout.includes('shorter than 24 characters'),
		true,
		'Expected quality bar failure',
	);
});

test('malformed confession: invalid JSON fails loudly', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
	});

	await writeFile(path.join(rootDir, removalsPath), '{ invalid json }');

	await execFileAsync('git', ['add', '.'], { cwd: rootDir });
	await execFileAsync('git', ['commit', '-m', 'malformed'], { cwd: rootDir });

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('Malformed JSON') ||
			result.stdout.includes('Malformed JSON'),
		true,
		'Expected malformed JSON error',
	);
});

test('malformed confession: missing steps array fails loudly', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: [
				'fixture.yml::build::Step A',
				'fixture.yml::build::Step B',
			],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
				'fixture.yml::build::Step B': {
					reason_hash: 'hash2',
					reason_length: 10,
				},
			},
		},
	});

	await writeFile(
		path.join(rootDir, removalsPath),
		JSON.stringify({ not_steps: [] }, null, '\t'),
	);

	await execFileAsync('git', ['add', '.'], { cwd: rootDir });
	await execFileAsync('git', ['commit', '-m', 'no-steps'], { cwd: rootDir });

	const result = await runScript(rootDir);

	assert.equal(
		result.stderr.includes('must have a `steps` array') ||
			result.stdout.includes('must have a `steps` array'),
		true,
		'Expected missing steps array error',
	);
});

// This test reads the ACTUAL reason-guard-ref.json from the repo — not a
// fixture. It proves the real file is intact and the ratchet would resist
// tampering. Without this, the other tests only prove the detection works
// when injected a floor, never that the real floor survives an alteration.
test('reads the REAL reason-guard-ref.json from disk and verifies integrity', async () => {
	const realRefPath = path.join(repoRoot, outputPath);
	const raw = await readFile(realRefPath, 'utf8');
	const ref = JSON.parse(raw) as {
		pinned_step_ids?: string[];
		steps?: Record<string, unknown>;
	};

	// The floor must be non-empty — there are real pinned steps.
	assert.ok(
		(ref.pinned_step_ids?.length ?? 0) > 0,
		'Expected at least one pinned step in the real reference file',
	);

	// The integrity assertion must hold: pinned_step_ids ⊆ steps{}.
	// Every pinned step must be tracked in steps{}. Extra steps in steps{}
	// that exist in the manifest are legitimate growth.
	const pinnedSet = new Set(ref.pinned_step_ids ?? []);
	const stepsSet = new Set(Object.keys(ref.steps ?? {}));
	for (const id of pinnedSet) {
		assert.ok(
			stepsSet.has(id),
			`Real reference file has integrity: pinned step "${id}" must be in steps{}`,
		);
	}
});

// #1809 r11 finding 2: the reference file's $comment used to claim generation
// "falls back to HEAD (still committed) when the merge-base is unavailable",
// the exact opposite of the code (readFloorFromGit REFUSES to run and exits
// non-zero without touching the file). The comment was wrong because the
// generator source that writes it was regenerated from a stale copy. This test
// reads the REAL committed reference and pins the truth, so a regeneration
// that reintroduces the false claim goes red.
test('reads the REAL reason-guard-ref.json $comment and verifies it does not claim a HEAD fallback', async () => {
	const realRefPath = path.join(repoRoot, outputPath);
	const raw = await readFile(realRefPath, 'utf8');
	const ref = JSON.parse(raw) as { $comment?: string[] };

	const comment = (ref.$comment ?? []).join('\n');

	assert.equal(
		/Generation falls? back to HEAD/i.test(comment),
		false,
		'$comment must not claim generation falls back to HEAD when the merge-base is unavailable — the generator refuses to run (exits non-zero without touching the file)',
	);
	assert.equal(
		comment.includes('exits non-zero without'),
		true,
		'$comment must state that generation refuses to run when the merge-base is unavailable',
	);
});

// BYPASS: a 24-char filler confession ("x".repeat(24)) clears the bar length
// check and lets a contributor lower the ratchet floor with garbage. The
// quality bar must reject filler regardless of length — and (r11) not just
// a single repeated character: two-character cycles ("ab".repeat(12)),
// repeated pairs ("x " with a truncated tail), and longer cycles are all
// zero-information strings that clear a length bar. A reason that is an
// exact repetition of a short block is a bypass in every one of those cases.
test('confession quality bar: repeated-block filler is rejected', async () => {
	const fillerCases = [
		{ label: 'repeated single character', reason: 'x'.repeat(24) },
		{ label: 'two-character cycle', reason: 'ab'.repeat(12) },
		{
			label: 'repeated pair with truncated tail',
			reason: 'x '.repeat(12) + 'x',
		},
		{ label: 'three-character cycle', reason: 'abc'.repeat(8) },
	];

	for (const { label, reason: fillerReason } of fillerCases) {
		const rootDir = await buildRepo({
			manifestSteps: {
				'fixture.yml::build::Step A': {
					hash: 'abc123',
					mirror: 'just ci',
					reason: 'Step A reason text.',
				},
			},
			reference: {
				pinned_step_ids: [
					'fixture.yml::build::Step A',
					'fixture.yml::build::Step B',
				],
				steps: {
					'fixture.yml::build::Step A': {
						reason_hash: 'hash',
						reason_length: 10,
					},
					'fixture.yml::build::Step B': {
						reason_hash: 'hash2',
						reason_length: 10,
					},
				},
			},
			removals: {
				steps: [
					{
						step_id: 'fixture.yml::build::Step B',
						reason: fillerReason,
					},
				],
			},
		});

		const result = await runScript(rootDir);

		// The script must refuse — filler is not a reviewable reason.
		assert.notEqual(
			result.exitCode,
			0,
			`Expected non-zero exit for filler confession: ${label}`,
		);
		assert.equal(
			result.stderr.includes('filler') ||
				result.stdout.includes('filler') ||
				result.stderr.includes('reviewable') ||
				result.stdout.includes('reviewable'),
			true,
			`Expected rejection naming the filler/reviewable bar: ${label}`,
		);
	}
});
test('bypass 5: deleting the reference file does NOT silently reset the floor', async () => {
	const rootDir = await buildRepo({
		manifestSteps: {
			'fixture.yml::build::Step A': {
				hash: 'abc123',
				mirror: 'just ci',
				reason: 'Step A reason text.',
			},
		},
		reference: {
			pinned_step_ids: ['fixture.yml::build::Step A'],
			steps: {
				'fixture.yml::build::Step A': {
					reason_hash: 'hash',
					reason_length: 10,
				},
			},
		},
	});

	// Delete the reference file from git and working tree.
	await execFileAsync('git', ['rm', outputPath], { cwd: rootDir });
	await execFileAsync('git', ['commit', '-m', 'delete ref'], { cwd: rootDir });

	const result = await runScript(rootDir);

	// The new contract (r10): the generator reads the ratchet floor from the
	// merge-base, not HEAD or the working tree. Deleting the reference file
	// at HEAD therefore cannot silently lower the floor — the floor still
	// comes from the merge-base commit (the one `buildRepo` pinned into
	// `origin/develop`), which still has Step A pinned. The generator may
	// succeed (rc=0) and regenerate the reference from the merge-base state,
	// as long as the regenerated `pinned_step_ids` is NOT shorter than what
	// the merge-base had. The protection the r10 fix actually adds is: the
	// merge-base floor is the only thing that can lower pinned_step_ids, and
	// that requires an explicit confession. A silent reset to [] is no longer
	// possible.
	assert.equal(
		result.exitCode === 0,
		true,
		'Generator should succeed by reading the floor from the merge-base — the merge-base commit still has the reference, so the floor is not silently reset',
	);
	const regenerated = JSON.parse(
		await readFile(path.join(rootDir, outputPath), 'utf8'),
	) as { pinned_step_ids: string[] };
	assert.equal(
		regenerated.pinned_step_ids.includes('fixture.yml::build::Step A'),
		true,
		'After deletion+regeneration, the floor must still pin Step A (read from merge-base, not silently reset)',
	);
});

test('bypass 6: 3-part committed regeneration attack IS CAUGHT by the merge-base floor', async () => {
	// THE KEY PROOF for the gen side: the attacker commits a manifest step
	// removal AND a reference regeneration (lowering pinned_step_ids) in ONE
	// commit on a PR branch. With the r7 fix (read floor from HEAD), HEAD IS
	// the attacker's commit — the floor agrees with the removal, and the
	// script happily regenerates without the vanished step. With the r8 fix
	// (read floor from merge-base), the floor is read from origin/develop's
	// state, which still pins the vanished step, so regeneration REFUSES.
	//
	// This test sets up:
	//   1. base commit: manifest + reference pin Step A and Step B
	//   2. origin/develop -> base commit (the floor)
	//   3. feature branch: commit the attack — remove Step B from manifest,
	//      remove Step B from pinned_step_ids, all in one commit
	//   4. run gen-reason-ref — should REFUSE (exit non-zero)

	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-gen-attack-'));

	await mkdir(path.join(rootDir, '.github/workflows'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	const execFile = (cmd: string, args: string[]) =>
		new Promise<string>((resolve, reject) => {
			require('node:child_process').execFile(
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
	await execFile('git', ['config', 'user.name', 'Test']);
	await execFile('git', ['remote', 'add', 'origin', rootDir]);

	const manifestSteps = {
		'fixture.yml::build::Step A': {
			hash: 'ab12cd34',
			mirror: 'just ci',
			reason:
				'Mirrored locally by the fixture gate for testing purposes in Step A.',
		},
		'fixture.yml::build::Step B': {
			hash: 'ef56ab78',
			mirror: 'just ci',
			reason:
				'Mirrored locally by the fixture gate for testing purposes in Step B.',
		},
	};

	// --- Step 1: base commit with both steps pinned ---
	await writeFile(
		path.join(rootDir, manifestPath),
		JSON.stringify({ steps: manifestSteps }, null, '\t'),
	);

	await writeFile(
		path.join(rootDir, outputPath),
		JSON.stringify(
			{
				pinned_step_ids: [
					'fixture.yml::build::Step A',
					'fixture.yml::build::Step B',
				],
				steps: {
					'fixture.yml::build::Step A': {
						reason_hash: 'hashA',
						reason_length:
							manifestSteps['fixture.yml::build::Step A'].reason.length,
					},
					'fixture.yml::build::Step B': {
						reason_hash: 'hashB',
						reason_length:
							manifestSteps['fixture.yml::build::Step B'].reason.length,
					},
				},
			},
			null,
			'\t',
		),
	);

	await execFile('git', ['add', '.']);
	await execFile('git', ['commit', '-q', '-m', 'base: both steps pinned']);

	// Set origin/develop to the base commit (the floor).
	const baseSha = (await execFile('git', ['rev-parse', 'HEAD'])).trim();
	await execFile('git', ['update-ref', 'refs/remotes/origin/develop', baseSha]);

	// --- Step 3: the 3-part COMMITTED attack on a feature branch ---
	await execFile('git', ['checkout', '-q', '-b', 'feature']);

	// Attack part 1: remove Step B from the manifest
	await writeFile(
		path.join(rootDir, manifestPath),
		JSON.stringify(
			{
				steps: {
					'fixture.yml::build::Step A':
						manifestSteps['fixture.yml::build::Step A'],
				},
			},
			null,
			'\t',
		),
	);

	// Attack part 2: remove Step B from pinned_step_ids (committed regeneration)
	await writeFile(
		path.join(rootDir, outputPath),
		JSON.stringify(
			{
				pinned_step_ids: ['fixture.yml::build::Step A'],
				steps: {
					'fixture.yml::build::Step A': {
						reason_hash: 'hashA',
						reason_length:
							manifestSteps['fixture.yml::build::Step A'].reason.length,
					},
				},
			},
			null,
			'\t',
		),
	);

	await execFile('git', ['add', '.']);
	await execFile('git', [
		'commit',
		'-q',
		'-m',
		'attack: remove Step B entirely',
	]);

	// Run the generator — it reads the floor from merge-base (base commit),
	// which still pins Step B. The "vanished without confession" check must
	// fire and refuse to regenerate.
	const result = await runScript(rootDir);

	assert.notEqual(
		result.exitCode,
		0,
		'gen-reason-ref must refuse when the 3-part committed attack lowers the floor',
	);
	assert.equal(
		result.stderr.includes('vanished') || result.stdout.includes('vanished'),
		true,
		'Expected "vanished" message from the ratchet floor check',
	);
	assert.equal(
		result.stderr.includes('ci-gate-removals.json') ||
			result.stdout.includes('ci-gate-removals.json'),
		true,
		'Expected message naming ci-gate-removals.json as the escape hatch',
	);
});

// THE KEY PROOF for the r10 defect 2 fix: the generator must REFUSE to run
// when `git merge-base origin/develop HEAD` cannot resolve. Before the r10
// fix, the generator silently fell back to `git show HEAD:`, which let a
// contributor whose HEAD already had a lowered pinned_step_ids regenerate
// the reference at the lower value with rc=0. After the fix, the loud
// refusal is the only path. This test exercises that refusal end-to-end:
// a repo with no origin/develop (the exact CI failure mode that the
// workflow fix for defect 1 addresses on its side) makes the generator
// fail with a named cause, not silently degrade.
//
// If anyone re-introduces a HEAD fallback in `readFloorFromGit`, this test
// will redden — exactly the "test that reddens if the refusal is removed"
// property the r10 brief requires.
test('bypass 7: generator REFUSES to run without origin/develop (loud, not silent)', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-gen-noorigin-'),
	);

	await mkdir(path.join(rootDir, '.git'), { recursive: true });
	await mkdir(path.join(rootDir, 'packages/scripts-ts/src'), {
		recursive: true,
	});

	await execFileAsync('git', ['init'], { cwd: rootDir });
	await execFileAsync('git', ['config', 'user.email', 'test@test.test'], {
		cwd: rootDir,
	});
	await execFileAsync('git', ['config', 'user.name', 'Test'], {
		cwd: rootDir,
	});

	// Floor pre-populated at HEAD (this is the attacker's committed state).
	await writeFile(
		path.join(rootDir, outputPath),
		JSON.stringify(
			{
				pinned_step_ids: ['fixture.yml::build::Step A'],
				steps: {
					'fixture.yml::build::Step A': {
						reason_hash: 'hashA',
						reason_length: 56,
					},
				},
			},
			null,
			'\t',
		),
	);
	await writeFile(
		path.join(rootDir, manifestPath),
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

	await execFileAsync('git', ['add', '.'], { cwd: rootDir });
	await execFileAsync(
		'git',
		['commit', '-q', '-m', 'attack: pre-lowered floor at HEAD'],
		{
			cwd: rootDir,
		},
	);

	// DELIBERATELY do NOT set up `origin/develop`. This is the exact CI
	// scenario the workflow fix (r10 defect 1) makes impossible in production
	// by fetching the base branch — but the generator's loud refusal must
	// hold even if the workflow regression comes back. A HEAD fallback would
	// happily regenerate at the lowered value, masking the regression.

	const result = await runScript(rootDir);

	assert.notEqual(
		result.exitCode,
		0,
		'gen-reason-ref must refuse to run when merge-base cannot resolve — a silent HEAD fallback would mask the regression that removed the base fetch from the workflow',
	);
	assert.equal(
		result.stderr.includes('REFUSING TO RUN') ||
			result.stdout.includes('REFUSING TO RUN'),
		true,
		'Expected loud refusal naming the cause (no merge-base)',
	);
	assert.equal(
		result.stderr.includes('merge-base') ||
			result.stdout.includes('merge-base'),
		true,
		'Expected message naming the merge-base command that failed',
	);
});
