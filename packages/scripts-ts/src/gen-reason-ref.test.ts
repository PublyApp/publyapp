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

test('integrity assertion: fails when steps{} has ID missing from pinned_step_ids', async () => {
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
		result.stderr.includes('Integrity check failed') ||
			result.stdout.includes('Integrity check failed'),
		true,
		'Expected integrity check failure',
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

	// The integrity assertion must hold: pinned_step_ids and steps{} match.
	// If a contributor tampers with the real file (removes an ID from one list
	// but not the other), this assertion fails — proving the real file is
	// protected.
	const pinnedSet = new Set(ref.pinned_step_ids ?? []);
	const stepsSet = new Set(Object.keys(ref.steps ?? {}));
	assert.deepEqual(
		[...pinnedSet].sort(),
		[...stepsSet].sort(),
		'Real reference file has integrity: pinned_step_ids matches steps{}',
	);
});

// Bypass 5: delete the reference file entirely. The old code fell back to
// reading the working-tree file, and when that also failed, returned [] —
// silently resetting the floor. The fix must make this fail loudly.
test('bypass 5: deleting the reference file does NOT reset the floor', async () => {
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

	// The script must fail — it must NOT silently reset the floor.
	assert.equal(
		result.exitCode !== 0,
		true,
		'Expected non-zero exit when reference file is deleted',
	);
	assert.equal(
		result.stderr.includes('Cannot read the ratchet floor') ||
			result.stdout.includes('Cannot read the ratchet floor'),
		true,
		'Expected loud error about missing reference file',
	);
});
