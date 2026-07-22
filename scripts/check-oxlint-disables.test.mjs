import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findOxlintDisableViolations } from './check-oxlint-disables.mjs';

const writeFixture = async (rootDir, relativePath, contents) => {
	await writeFile(path.join(rootDir, relativePath), contents);
};

const buildFixture = async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-oxlint-disables-'),
	);

	await mkdir(path.join(rootDir, '.react-router'), { recursive: true });
	await mkdir(path.join(rootDir, 'apps', 'api', '.artifacts'), {
		recursive: true,
	});
	await mkdir(path.join(rootDir, 'apps', 'api', 'Migrations'), { recursive: true });
	await mkdir(path.join(rootDir, 'src'), { recursive: true });

	await writeFixture(
		rootDir,
		'src/with-reason.ts',
		`// oxlint-disable-next-line no-unused-vars -- ` +
			'this is a specific, reviewable reason for suppression.\n',
	);

	await writeFixture(
		rootDir,
		'src/without-reason.ts',
		'// oxlint-disable no-unused-vars\n',
	);

	await writeFixture(
		rootDir,
		'.react-router/generated-route.ts',
		'// oxlint-disable no-unused-vars\n',
	);

	await writeFixture(
		rootDir,
		'apps/api/.artifacts/ignored.ts',
		'// oxlint-disable no-unused-vars\n',
	);

	await writeFixture(rootDir, 'src/clean.ts', 'const ok = true;\n');

	return rootDir;
};

test('flags only disable directives that are missing reviewable reasons', async () => {
	const rootDir = await buildFixture();
	const violations = await findOxlintDisableViolations(rootDir);

	assert.deepEqual(violations, [
		'src/without-reason.ts:1 - missing a specific rule or reviewable reason',
	]);
});
