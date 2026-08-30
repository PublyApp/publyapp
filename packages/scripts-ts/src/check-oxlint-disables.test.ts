import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

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

test('ignores fixture text that merely mentions the token, still flags a real directive in the same file', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-oxlint-rule-fixtures-'),
	);

	await writeFixture(
		rootDir,
		'src/func-style-config.test.ts',
		[
			"import { it } from 'vitest';",
			'',
			"const markers = ['oxlint-disable-next-line func-style', 'oxlint-disable func-style'];",
			'',
			'/**',
			' * - oxlint-disable func-style — the oxlint variant, block-start',
			' * - oxlint-disable — bare, silences all oxlint rules',
			' */',
			'',
			'// eslint-disable-next-line / oxlint-disable-next-line: extract next-line symbol',
			"if (trimmed === 'oxlint-disable') {",
			'\treturn true;',
			'}',
			'',
			'// oxlint-disable-next-line func-style',
			'export function probe() {}',
		].join('\n') + '\n',
	);

	// The fixture mimics the exact shape of the real func-style spec file:
	// every token mention is string/prose EXCEPT the real directive on line
	// 15 (1-based). The guard must flag exactly that line and nothing else.
	const violations = await findOxlintDirectiveViolations(rootDir);

	assert.deepEqual(violations, [
		'src/func-style-config.test.ts:15 - missing a specific rule or reviewable reason',
	]);
});
