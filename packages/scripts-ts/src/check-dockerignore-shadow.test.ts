import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { findDockerignoreShadows } from './check-dockerignore-shadow.ts';

// Fixture helpers: plain temp trees (the guard walks the filesystem, so no
// git repo is needed).

const cliPath = fileURLToPath(
	new URL('./check-dockerignore-shadow.ts', import.meta.url),
);

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
		path.join(os.tmpdir(), 'publyapp-dockerignore-shadow-'),
	);

	// A root .dockerignore is the one legitimately allowed file.
	await writeFixtureFile(rootDir, '.dockerignore', 'node_modules\n');

	return rootDir;
};

// GREEN case: a tree with only the root .dockerignore passes.
test('GREEN: root .dockerignore alone yields no findings', async () => {
	const rootDir = await buildFixtureTree();

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no findings when only the root .dockerignore exists',
	);
});

// RED case, the exact #1832 shape: an empty apps/api/Dockerfile.dockerignore
// must be detected and named with its path.
test('RED: apps/api/Dockerfile.dockerignore (empty) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore', '');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.dockerignore'),
		`expected the guard to name apps/api/Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: a root-level shadow file is also a replacement risk.
test('RED: root-level Dockerfile.dockerignore is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.dockerignore'),
		`expected the guard to name Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: the shadow can derive from a named Dockerfile (Dockerfile.prod),
// not only the default-named Dockerfile.
test('RED: Dockerfile.prod.dockerignore (named Dockerfile variant) is detected', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/front/Dockerfile.prod.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/front/Dockerfile.prod.dockerignore'),
		`expected the guard to name the named-Dockerfile shadow, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: every shadow file is named, not just the first.
test('RED: multiple shadow files are all named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore');
	await writeFixtureFile(rootDir, 'apps/front/Dockerfile.dockerignore');
	await writeFixtureFile(rootDir, 'packages/x.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[
			'apps/api/Dockerfile.dockerignore',
			'apps/front/Dockerfile.dockerignore',
			'packages/x.dockerignore',
		],
		'expected every shadow file to be named',
	);
});

// GREEN case: a subdirectory file named exactly `.dockerignore` is NOT a
// shadow file — Docker only replaces the root file with a `<name>.dockerignore`
// shadow, and a plain `.dockerignore` is the separate additive BuildKit
// per-directory feature.
test('GREEN: subdirectory `.dockerignore` is not a shadow file', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected a subdirectory .dockerignore (exact basename) to be allowed',
	);
});

// MUTATION AGAINST THE GUARD: a shadow file inside node_modules cannot reach
// a build context (the root .dockerignore excludes node_modules from every
// context), so flagging it would be a false positive on third-party packages.
// This test pins the deliberate scope boundary.
test('GREEN: shadow file inside node_modules is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(
		rootDir,
		'node_modules/left-pad/Dockerfile.dockerignore',
	);

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected node_modules to be skipped (excluded from every build context)',
	);
});

// MUTATION AGAINST THE GUARD: a shadow file inside .git never enters a build
// context either; the walk must not descend into tool metadata.
test('GREEN: shadow file inside .git is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.git/Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected .git to be skipped (tool metadata, never in a context)',
	);
});

// FAIL-LOUD contract: an unreadable/missing root must reject, never report a
// silent "nothing to flag".
test('RED: missing root directory fails loud (rejects)', async () => {
	const missingDir = path.join(os.tmpdir(), 'publyapp-does-not-exist-1849');

	await assert.rejects(
		findDockerignoreShadows({ rootDir: missingDir }),
		/nonexistent|ENOENT/,
	);
});

// CLI RED proof: the real CLI exits 1, names the offending path and states
// the replacement semantics in plain words.
test('RED: CLI exits non-zero, names the file and explains REPLACES', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore', '');

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when a shadow file exists',
	);
	assert.ok(
		(result.stderr ?? '').includes('apps/api/Dockerfile.dockerignore'),
		`expected stderr to name the file, got: ${result.stderr}`,
	);
	assert.ok(
		(result.stderr ?? '').toUpperCase().includes('REPLACES'),
		`expected stderr to explain that Docker replaces instead of adds, got: ${result.stderr}`,
	);
});

// CLI GREEN proof: the real CLI exits 0 on a clean tree with only the root
// .dockerignore.
test('GREEN: CLI exits 0 on a clean tree', async () => {
	const rootDir = await buildFixtureTree();

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.equal(result.status, 0, `expected exit 0, got ${result.status}`);
	assert.ok(
		(result.stdout ?? '').includes('[OK]'),
		`expected an explicit OK line, got: ${result.stdout}`,
	);
});

// RED case, round 2 of #1873: Docker matches the `.dockerignore` basename
// case-INSENSITIVELY, so every case variant of a shadow name replaces the
// root file too. The exact-case guard was green on all four of these —
// four false negatives, i.e. the exact defect #1849 closes.

test('RED: Dockerfile.DOCKERIGNORE (all-caps variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DOCKERIGNORE'),
		`expected the guard to name Dockerfile.DOCKERIGNORE, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: mixed case is a replacement risk too.
test('RED: Dockerfile.DockerIgnore (mixed-case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DockerIgnore'),
		`expected the guard to name Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: the bare dotfile name with a different case
// is still a `<...>.dockerignore` shadow (its basename is not exactly
// `.dockerignore`).
test('RED: .DockerIgnore (dotfile case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('.DockerIgnore'),
		`expected the guard to name .DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: a case variant sitting next to a real
// Dockerfile is the exact #1832 shape in another spelling.
test('RED: apps/api/Dockerfile.DockerIgnore (subdirectory case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.DockerIgnore'),
		`expected the guard to name apps/api/Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// CLI RED proof, round 2 of #1873: the real binary must exit 1 on a case
// variant and name it — the reviewer's four files are the regression that
// this test pins against the shipped artifact, not just the library.
test('RED: CLI exits non-zero on a case-variant shadow file (Dockerfile.DOCKERIGNORE)', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DOCKERIGNORE');

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when a case-variant shadow file exists',
	);
	assert.ok(
		(result.stderr ?? '').includes('Dockerfile.DOCKERIGNORE'),
		`expected stderr to name the case-variant file, got: ${result.stderr}`,
	);
});

// GREEN case, round 2 of #1873: making the match case-insensitive must NOT
// open a new hole. A subdirectory file whose basename is exactly
// `.dockerignore` in any case is the additive per-directory BuildKit
// feature, not a shadow — a legitimate root .dockerignore stays accepted in
// any spelling, so does this one.
test('GREEN: subdirectory .DOCKERIGNORE (case variant, exact basename) is not a shadow file', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected a subdirectory .dockerignore case variant (exact basename) to be allowed',
	);
});
