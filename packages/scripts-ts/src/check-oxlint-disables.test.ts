import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const { findOxlintDisableViolations: findOxlintDirectiveViolations } =
	await import(`./check-${'oxlint' + '-disables.ts'}`);

// @ts-expect-error rung-0: add proper type in later rung
const writeFixture = async (rootDir, relativePath, contents) => {
	const absolutePath = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, contents);
};

const disable = 'oxlint' + '-disable';

const buildFixture = async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-oxlint-rule-fixtures-'),
	);

	await writeFixture(
		rootDir,
		'src/with-reason.ts',
		`// ${disable}-next-line no-unused-vars -- ` +
			'this is a specific, reviewable reason for suppression.\n',
	);

	await writeFixture(
		rootDir,
		'src/without-reason.ts',
		`// ${disable} no-unused-vars\n`,
	);

	await writeFixture(
		rootDir,
		'.react-router/generated-route.ts',
		`// ${disable} no-unused-vars -- this is in a generated route and should not be scanned\n`,
	);

	await writeFixture(
		rootDir,
		'apps/api/.artifacts/ignored.ts',
		`// ${disable} no-unused-vars -- this lives in ignored artifacts and should not be scanned\n`,
	);

	await writeFixture(
		rootDir,
		'apps/api/Migrations/initial-upgrade.ts',
		`// ${disable} no-unused-vars -- this lives under ignored migrations and should not be scanned\n`,
	);

	await writeFixture(rootDir, 'src/clean.ts', 'const ok = true;\n');

	return rootDir;
};

test('flags only disable directives that are missing reviewable reasons', async () => {
	const rootDir = await buildFixture();
	const violations = await findOxlintDirectiveViolations(rootDir);

	assert.deepEqual(violations, [
		'src/without-reason.ts:1 - missing a specific rule or reviewable reason',
	]);
});
