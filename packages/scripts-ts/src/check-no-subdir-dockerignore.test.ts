import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findSubdirDockerignores } from './check-no-subdir-dockerignore.ts';

// Fixture helpers.

const writeFixtureFile = async (
	rootDir: string,
	relativePath: string,
	contents = '',
): Promise<void> => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

const buildFixtureTree = async (): Promise<string> => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-subdir-dockerignore-'),
	);

	// A root .dockerignore is the only legitimate one — same shape as the
	// shadow guard's fixture, here to ensure it stays accepted by THIS guard.
	await writeFixtureFile(rootDir, '.dockerignore', 'node_modules\n');

	return rootDir;
};

// GREEN case: a tree with only the root .dockerignore passes.
test('GREEN: root .dockerignore alone yields no findings', async () => {
	const rootDir = await buildFixtureTree();

	const findings = await findSubdirDockerignores({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no findings when only the root .dockerignore exists',
	);
});

// RED case: a `.dockerignore` placed in a subdirectory IS in the same
// divergence family as the shadow file (#1849/#1891). With this guard, a
// single subdirectory `.dockerignore` is enough to fail loud and tell the
// user the cause. The probe that motivated this guard is documented in
// `.dump/preuve-grpctxdiverge.md` (probes 1+2+4): a `sub/.dockerignore`
// excludes NOTHING when context = repo root, excludes EVERYTHING it lists
// when context = sub/.
test('RED: a single subdirectory `.dockerignore` is reported loud', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.dockerignore', 'node_modules\n');

	const findings = await findSubdirDockerignores({ rootDir });

	assert.deepEqual(
		findings,
		['apps/api/.dockerignore'],
		`expected the guard to name apps/api/.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: every subdirectory `.dockerignore` is named, not just the first.
test('RED: multiple subdirectory .dockerignore files are all named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.dockerignore', 'node_modules\n');
	await writeFixtureFile(rootDir, 'apps/front/.dockerignore', '.next/\n');

	const findings = await findSubdirDockerignores({ rootDir });

	assert.deepEqual(
		findings,
		['apps/api/.dockerignore', 'apps/front/.dockerignore'],
		`expected the guard to name every subdirectory .dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// GREEN case: the SKIP_DIRS escape hatch — `.git/` and `node_modules/` are
// not real build contexts for this guard's purpose (the root .dockerignore
// already excludes node_modules from every build context, and .git is tool
// metadata outside any context). Pinning the boundary so a future
// refactor does not start reporting them.
test('GREEN: subdirectory .dockerignore inside .git or node_modules is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.git/.dockerignore', 'noise\n');
	await writeFixtureFile(
		rootDir,
		'node_modules/left-pad/.dockerignore',
		'noise\n',
	);

	const findings = await findSubdirDockerignores({ rootDir });

	assert.deepEqual(
		findings,
		[],
		`expected the guard to skip SKIP_DIRS contents, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: paired proof — the case-insensitive acquisition belongs to the
// SHADOW guard (`check-dockerignore-shadow`), not to this guard. A
// case-variant file like `apps/api/.DockerIgnore` is NOT in scope here
// (this guard flags exact `.dockerignore` only). Pinning the boundary: the
// shadow guard flags it, this guard does not.
test("GREEN: case variants like `apps/api/.DockerIgnore` are NOT in this guard's scope (the shadow guard covers them)", async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.DockerIgnore', 'node_modules\n');

	const findings = await findSubdirDockerignores({ rootDir });

	assert.deepEqual(
		findings,
		[],
		`expected this guard to ignore case variants (shadow guard's job), got: ${JSON.stringify(findings)}`,
	);
});

// FAIL-LOUD contract: a missing root directory rejects, not silently greens.
test('RED: missing root directory fails loud (rejects)', async () => {
	const missingRoot = path.join(
		os.tmpdir(),
		`publyapp-subdir-dockerignore-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);

	let thrown: unknown;
	try {
		await findSubdirDockerignores({ rootDir: missingRoot });
	} catch (error) {
		thrown = error;
	}

	assert.ok(
		thrown instanceof Error,
		'expected the guard to reject on a missing root directory',
	);
});
