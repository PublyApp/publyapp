import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findTreeDrift } from './check-tree-clean.ts';

// @ts-expect-error rung-0: add proper type in later rung
const runGit = (cwd, args) => {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

	assert.equal(result.status, 0, result.stderr || result.stdout);

	return result.stdout.trim();
};

// @ts-expect-error rung-0: add proper type in later rung
const writeFixtureFile = async (rootDir, relativePath, contents) => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

// @ts-expect-error rung-0: add proper type in later rung
const writeGitConfig = (rootDir, name, email) => {
	runGit(rootDir, ['config', 'user.name', name]);
	runGit(rootDir, ['config', 'user.email', email]);
};

const createFixtureRepo = async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-tree-clean-'));

	runGit(rootDir, ['init']);
	writeGitConfig(rootDir, 'Script Test Runner', 'scripts@test.local');

	await writeFixtureFile(rootDir, 'generated/openapi.json', '{"ok":true}\n');
	await writeFixtureFile(rootDir, 'generated/schema.graphql', '{}\n');
	await writeFixtureFile(rootDir, 'untouched.txt', 'keep me\n');

	runGit(rootDir, ['add', '.']);
	runGit(rootDir, ['commit', '-m', 'initial fixture commit']);

	return rootDir;
};

test('passes when tracked files under a path are clean against HEAD', async () => {
	const rootDir = await createFixtureRepo();
	const drift = findTreeDrift(['generated/openapi.json'], { cwd: rootDir });

	assert.equal(drift, '');
});

test('detects a modified tracked file as drift', async () => {
	const rootDir = await createFixtureRepo();

	await writeFixtureFile(rootDir, 'generated/openapi.json', '{"ok":false}\n');

	const drift = findTreeDrift(['generated/openapi.json'], { cwd: rootDir });
	assert.ok(drift.includes(' M generated/openapi.json'));
});

test('detects new untracked files under a checked path', async () => {
	const rootDir = await createFixtureRepo();
	await writeFixtureFile(rootDir, 'generated/new-client.ts', 'new file\n');

	const drift = findTreeDrift(['generated'], { cwd: rootDir });
	assert.ok(drift.includes('?? generated/new-client.ts'));
});
