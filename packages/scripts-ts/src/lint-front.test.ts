import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { normalizeRelativePath } from './lint-front.ts';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const wrapperPath = path.join(
	repoRoot,
	'packages/scripts-ts/src/lint-front.ts',
);

// @ts-expect-error rung-0: add proper type in later rung
const writeFixtureFile = async (rootDir, relativePath, contents) => {
	const absolutePath = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, contents);
};

const createFixture = async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-lint-front-'));

	await writeFixtureFile(
		rootDir,
		'.oxlintrc.json',
		JSON.stringify({
			// Keep auto-discovery type-blind: only the wrapper's explicit
			// --type-aware flags may enable the planted diagnostics below.
			options: { typeAware: false },
			rules: {
				'no-unused-vars': 'error',
				'typescript/no-deprecated': 'error',
				'typescript/no-floating-promises': 'error',
			},
		}),
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/tsconfig.lint.json',
		JSON.stringify({
			compilerOptions: {
				allowJs: false,
				noEmit: true,
				strict: true,
			},
			include: ['src/**/*.ts', 'src/**/*.tsx'],
		}),
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/tsconfig.json',
		JSON.stringify({
			compilerOptions: { allowJs: true, noEmit: true, strict: true },
			include: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
		}),
	);
	await writeFixtureFile(
		rootDir,
		'packages/shared-ts/tsconfig.json',
		JSON.stringify({ compilerOptions: { allowJs: true, noEmit: true } }),
	);
	await writeFixtureFile(
		rootDir,
		'packages/scripts-ts/tsconfig.json',
		JSON.stringify({
			compilerOptions: { allowJs: true, noEmit: true },
			include: ['**/*.mjs'],
		}),
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/src/problem.ts',
		'const unusedValue = 1;\n',
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/e2e/tooling.ts',
		'export const tooling = true;\n',
	);
	await writeFixtureFile(
		rootDir,
		'packages/shared-ts/problem.ts',
		'export const shared = true;\n',
	);
	await writeFixtureFile(
		rootDir,
		'packages/scripts-ts/src/problem.ts',
		'const scriptsUnusedValue = 1;\n',
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/scripts/helper.mjs',
		"export const helper = 'helper';\n",
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/src/legacy.d.ts',
		'/** @deprecated Use replacement instead. */\nexport declare const oldValue: string;\n',
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/src/deprecated.ts',
		"import { oldValue } from './deprecated';\nexport const currentValue = oldValue;\n\nconst promise = async () => 'value';\npromise();\n",
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/scripts/deprecated.mjs',
		"import { oldValue } from '../src/legacy';\nconsole.log(oldValue);\n\nconst promise = async () => 'value';\npromise();\n",
	);

	return rootDir;
};

// @ts-expect-error rung-0: add proper type in later rung
const runLint = (rootDir) => {
	const result = spawnSync(process.execPath, [wrapperPath, '--root', rootDir], {
		cwd: repoRoot,
		encoding: 'utf8',
	});

	return {
		status: result.status,
		stderr: result.stderr,
		stdout: result.stdout,
	};
};

// @ts-expect-error rung-0: add proper type in later rung
const getSection = (output, heading, nextHeading) => {
	const start = output.indexOf(heading);
	const end = output.indexOf(nextHeading);

	assert.notEqual(start, -1, `missing heading: ${heading}`);
	assert.notEqual(end, -1, `missing heading: ${nextHeading}`);

	return output.slice(start, end);
};

// @ts-expect-error rung-0: add proper type in later rung
const assertHasHeadings = (output) => {
	assert.equal((output.match(/^type-aware TypeScript:$/gm) ?? []).length, 1);
	assert.equal((output.match(/^syntax JavaScript:$/gm) ?? []).length, 1);
	assert.equal((output.match(/^type-aware JavaScript:$/gm) ?? []).length, 1);
};

// @ts-expect-error rung-0: add proper type in later rung
const combinedOutput = ({ stderr, stdout }) => `${stdout}\n${stderr}`;

test(
	'keeps TypeScript diagnostics stable when import-heavy JavaScript is added',
	{ timeout: 30_000 },
	async () => {
		const rootDir = await createFixture();

		try {
			const firstRun = runLint(rootDir);
			const secondRun = runLint(rootDir);

			assert.equal(firstRun.status, secondRun.status);
			assert.equal(
				// @ts-expect-error rung-0: TS2345
				JSON.parse(await readFile(path.join(rootDir, '.oxlintrc.json'))).options
					.typeAware,
				false,
			);
			const oxlintPath = path.join(repoRoot, 'node_modules/oxlint/bin/oxlint');
			const blindTypeScript = spawnSync(
				process.execPath,
				[
					oxlintPath,
					'--config',
					path.join(rootDir, '.oxlintrc.json'),
					'--tsconfig',
					path.join(rootDir, 'apps/front/tsconfig.lint.json'),
					'--format',
					'unix',
					path.join(rootDir, 'apps/front/src/deprecated.ts'),
				],
				{ encoding: 'utf8' },
			);
			const blindJavaScript = spawnSync(
				process.execPath,
				[
					oxlintPath,
					'--config',
					path.join(rootDir, '.oxlintrc.json'),
					'--tsconfig',
					path.join(rootDir, 'apps/front/tsconfig.json'),
					'--format',
					'unix',
					path.join(rootDir, 'apps/front/scripts/deprecated.mjs'),
				],
				{ encoding: 'utf8' },
			);
			assert.doesNotMatch(
				`${blindTypeScript.stdout}${blindTypeScript.stderr}`,
				/typescript\(no-floating-promises\)/,
			);
			assert.doesNotMatch(
				`${blindJavaScript.stdout}${blindJavaScript.stderr}`,
				/typescript\(no-floating-promises\)/,
			);
			assertHasHeadings(firstRun.stdout);
			assertHasHeadings(secondRun.stdout);
			assert.notEqual(firstRun.status, 0);
			assert.match(combinedOutput(firstRun), /no-unused-vars/);
			assert.ok(
				(
					combinedOutput(firstRun).match(
						/typescript\(no-floating-promises\)/g,
					) ?? []
				).length >= 2,
			);
			assert.match(combinedOutput(firstRun), /typescript\(no-deprecated\)/);
			assert.match(firstRun.stdout, /project front-source:/);
			assert.match(firstRun.stdout, /project front-tooling:/);
			assert.match(firstRun.stdout, /project shared-ts:/);
			assert.match(firstRun.stdout, /project scripts:/);
			assert.match(
				combinedOutput(firstRun),
				/packages\/scripts-ts\/src\/problem\.ts/,
			);

			const baselineTypeScript = getSection(
				firstRun.stdout,
				'type-aware TypeScript:',
				'syntax JavaScript:',
			);
			assert.match(baselineTypeScript, /problem\.ts/);
			assert.match(baselineTypeScript, /deprecated\.ts/);
			assert.match(baselineTypeScript, /typescript\(no-floating-promises\)/);
			assert.equal(
				baselineTypeScript,
				getSection(
					secondRun.stdout,
					'type-aware TypeScript:',
					'syntax JavaScript:',
				),
			);

			const imports = Array.from(
				{ length: 64 },
				(_, index) =>
					`import { helper as helper${index} } from './helper.mjs';`,
			).join('\n');
			await writeFixtureFile(
				rootDir,
				'apps/front/scripts/import-heavy.mjs',
				`${imports}\nexport const importedHelpers = [${Array.from(
					{ length: 64 },
					(_, index) => `helper${index}`,
				).join(', ')}];\n`,
			);

			const variantFirstRun = runLint(rootDir);
			const variantSecondRun = runLint(rootDir);

			assert.equal(variantFirstRun.status, variantSecondRun.status);
			assertHasHeadings(variantFirstRun.stdout);
			assertHasHeadings(variantSecondRun.stdout);
			assert.notEqual(variantFirstRun.status, 0);
			assert.match(combinedOutput(variantFirstRun), /deprecated\.mjs/);

			const variantTypeScript = getSection(
				variantFirstRun.stdout,
				'type-aware TypeScript:',
				'syntax JavaScript:',
			);
			assert.match(variantTypeScript, /problem\.ts/);
			assert.equal(baselineTypeScript, variantTypeScript);
			assert.equal(
				variantTypeScript,
				getSection(
					variantSecondRun.stdout,
					'type-aware TypeScript:',
					'syntax JavaScript:',
				),
			);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	},
);

test('normalizes Windows separators before project classification', () => {
	assert.equal(
		normalizeRelativePath('apps\\front\\src\\problem.ts'),
		'apps/front/src/problem.ts',
	);
	assert.equal(
		normalizeRelativePath('scripts\\problem.ts'),
		'scripts/problem.ts',
	);
});

// Issue #1909 — paired executed proof against a REAL git repo (git init'ed
// fixture with its own .gitignore). Leg 1: the wrapper must stay GREEN while a
// func-style violation sits inside a git-ignored directory. Adversarial leg 2:
// the SAME violation in a NOT-ignored directory must still be caught — a fix
// that "simply stops walking" would pass leg 1 while blinding the gate.
const funcStyleViolation =
	'export function hidden1909() {\n\treturn 1;\n}\nhidden1909();\n';

// @ts-expect-error rung-0: add proper type in later rung
const writeConfigFiles = async (rootDir) => {
	await writeFixtureFile(
		rootDir,
		'.oxlintrc.json',
		JSON.stringify({
			options: { typeAware: false },
			rules: { 'func-style': ['error', 'expression'] },
		}),
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/tsconfig.lint.json',
		JSON.stringify({
			compilerOptions: {
				allowJs: false,
				noEmit: true,
				strict: true,
			},
			include: ['src/**/*.ts', 'src/**/*.tsx'],
		}),
	);
	await writeFixtureFile(
		rootDir,
		'apps/front/tsconfig.json',
		JSON.stringify({
			compilerOptions: { allowJs: true, noEmit: true, strict: true },
			include: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
		}),
	);
	await writeFixtureFile(
		rootDir,
		'packages/shared-ts/tsconfig.json',
		JSON.stringify({ compilerOptions: { allowJs: true, noEmit: true } }),
	);
	await writeFixtureFile(
		rootDir,
		'packages/scripts-ts/tsconfig.json',
		JSON.stringify({
			compilerOptions: { allowJs: true, noEmit: true },
			include: ['**/*.mjs'],
		}),
	);
};

const createGitIgnoreFixture = async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-lint-front-gitignore-'),
	);

	await writeConfigFiles(rootDir);
	await writeFixtureFile(rootDir, '.gitignore', 'ignored-output/\n');
	await writeFixtureFile(
		rootDir,
		'apps/front/src/clean.ts',
		'export const clean = (): number => 1;\nclean();\n',
	);
	// The planted violation: git-ignored directory, file would fail func-style.
	await writeFixtureFile(
		rootDir,
		'apps/front/ignored-output/hidden.ts',
		funcStyleViolation,
	);

	// Make the fixture a REAL git repository so the wrapper's git-ignore
	// authority (`git check-ignore`) is exercised for real.
	spawnSync('git', ['init', '-q'], { cwd: rootDir, encoding: 'utf8' });

	return rootDir;
};

test(
	'git-ignored directories are skipped by the walk (issue #1909)',
	{ timeout: 30_000 },
	async () => {
		const rootDir = await createGitIgnoreFixture();

		try {
			const result = runLint(rootDir);

			assert.equal(result.status, 0, combinedOutput(result));
			assert.doesNotMatch(
				combinedOutput(result),
				/ignored-output/,
				'the git-ignored directory must not reach oxlint',
			);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	},
);

test(
	'adversarial: the same violation in a NON-ignored directory is still caught (issue #1909)',
	{ timeout: 30_000 },
	async () => {
		const rootDir = await createGitIgnoreFixture();

		try {
			await writeFixtureFile(
				rootDir,
				'apps/front/not-ignored-1909/hidden.ts',
				funcStyleViolation,
			);

			const result = runLint(rootDir);

			assert.notEqual(result.status, 0, combinedOutput(result));
			assert.match(
				combinedOutput(result),
				/not-ignored-1909[/\\]hidden\.ts/,
				'the non-ignored violation must still name its file',
			);
			assert.match(combinedOutput(result), /func-style/);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	},
);
