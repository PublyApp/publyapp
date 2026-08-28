import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { verifyComplexityBounds } from './check-cyclomatic-bound.ts';

// Helper to write a fixture file inside a temp root.
// @ts-expect-error rung-0: add proper type in later rung
const writeFixture = async (rootDir, relativePath, contents) => {
	const absolutePath = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, contents);
};

// Builds a throwaway repo with an .oxlintrc.json and a cyclomatic-bound-ref.json.
// @ts-expect-error rung-0: add proper type in later rung
const buildFixture = async (oxlintrcJson, refJson) => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-cyclomatic-bound-'),
	);

	await writeFixture(
		rootDir,
		'.oxlintrc.json',
		typeof oxlintrcJson === 'string'
			? oxlintrcJson
			: JSON.stringify(oxlintrcJson, null, '\t'),
	);
	await writeFixture(
		rootDir,
		'cyclomatic-bound-ref.json',
		typeof refJson === 'string' ? refJson : JSON.stringify(refJson, null, '\t'),
	);

	return {
		rootDir,
		oxlintrcPath: path.join(rootDir, '.oxlintrc.json'),
		refPath: path.join(rootDir, 'cyclomatic-bound-ref.json'),
	};
};

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

// The canonical reference values — the documented policy. The test independently
// asserts these, so relaxing a ceiling in cyclomatic-bound-ref.json alone is
// insufficient: the test assertions must also change.
const DOCUMENTED_POLICY = {
	__default__: 125,
	'apps/front/src/**': 60,
	'apps/front/scripts/**': 125,
	'apps/front/tools/**': 125,
	'packages/lint-ts/**': 125,
	'packages/scripts-ts/**': 125,
	'packages/shared-ts/**': 125,
	'**/*.test.ts': 90,
	'**/*.test.tsx': 90,
	'**/*.spec.ts': 90,
	'**/*.spec.tsx': 90,
	'apps/front/e2e/**': 90,
};

// A canonical, matching pair of configs (the nominal green case).
const canonicalOxlint = {
	rules: { complexity: ['error', { max: 125 }] },
	overrides: [
		{
			files: ['apps/front/src/**'],
			rules: { complexity: ['error', { max: 60 }] },
		},
		{
			files: [
				'apps/front/scripts/**',
				'apps/front/tools/**',
				'packages/lint-ts/**',
				'packages/scripts-ts/**',
				'packages/shared-ts/**',
			],
			rules: { complexity: ['error', { max: 125 }] },
		},
		{
			files: [
				'**/*.test.ts',
				'**/*.test.tsx',
				'**/*.spec.ts',
				'**/*.spec.tsx',
				'apps/front/e2e/**',
			],
			rules: { complexity: ['error', { max: 90 }] },
		},
	],
};

const canonicalRef = { ...DOCUMENTED_POLICY };

// ---------------------------------------------------------------------------
// Nominal green case
// ---------------------------------------------------------------------------

test('passes when .oxlintrc.json matches cyclomatic-bound-ref.json exactly', async () => {
	const { oxlintrcPath, refPath } = await buildFixture(
		canonicalOxlint,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// The four mutations from ronde 2, each must fail
// ---------------------------------------------------------------------------

test('ronde-2 mutation 1: raising the default ceiling to 200 fails clearly', async () => {
	const oxlintWithRaisedDefault = {
		...canonicalOxlint,
		rules: { complexity: ['error', { max: 200 }] },
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintWithRaisedDefault,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /__default__/);
	assert.match(errors[0], /the ceiling was RAISED from 125 to 200/);
});

test('ronde-2 mutation 2: raising apps/front/src/** ceiling to 200 fails clearly', async () => {
	const oxlintWithRaisedFront = {
		...canonicalOxlint,
		overrides: canonicalOxlint.overrides.map((override) =>
			override.files[0] === 'apps/front/src/**'
				? { ...override, rules: { complexity: ['error', { max: 200 }] } }
				: override,
		),
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintWithRaisedFront,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /apps\/front\/src\/\*\*/);
	assert.match(errors[0], /the ceiling was RAISED from 60 to 200/);
});

test('ronde-2 mutation 3: removing an overrides block fails (reference pattern missing from .oxlintrc.json)', async () => {
	const oxlintRemovedBlock = {
		...canonicalOxlint,
		overrides: canonicalOxlint.overrides.filter(
			(o) => o.files[0] !== 'apps/front/src/**',
		),
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintRemovedBlock,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /apps\/front\/src\/\*\*/);
	assert.match(errors[0], /not present in .oxlintrc\.json/);
});

test('ronde-2 mutation 4: adding an overrides block at 500 for a known pattern fails', async () => {
	const oxlintAddedBlock = {
		...canonicalOxlint,
		overrides: [
			...canonicalOxlint.overrides,
			{
				files: ['apps/front/src/**'],
				rules: { complexity: ['error', { max: 500 }] },
			},
		],
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintAddedBlock,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	// "Last declared wins" means the 500 overrides the 60. The guard must catch
	// that the effective value (500) does not match the reference (60).
	assert.ok(errors.length >= 1);
	assert.match(errors.join('\n'), /apps\/front\/src\/\*\*/);
	assert.match(errors.join('\n'), /the ceiling was RAISED from 60 to 500/);
});

// ---------------------------------------------------------------------------
// Constat 1: unknown override patterns must fail
// ---------------------------------------------------------------------------

test('Constat 1: an override for an unknown pattern fails (the bypass)', async () => {
	const oxlintWithUnknownPattern = {
		...canonicalOxlint,
		overrides: [
			...canonicalOxlint.overrides,
			{
				files: ['apps/front/src/lib/**'],
				rules: { complexity: ['error', { max: 200 }] },
			},
		],
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintWithUnknownPattern,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.ok(
		errors.some((e) =>
			/Unknown override pattern "apps\/front\/src\/lib\/\*\*"/.test(e),
		),
		`expected an unknown-pattern finding, got: ${errors.join('\n')}`,
	);
});

// ---------------------------------------------------------------------------
// Malformed JSON must fail loudly with SyntaxError
// ---------------------------------------------------------------------------

test('a truncated .oxlintrc.json fails with a SyntaxError (no silent false negative)', async () => {
	const { oxlintrcPath, refPath } = await buildFixture(
		'{\n  "rules": {\n    "complexity": ',
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /Cannot parse/);
	assert.match(errors[0], /SyntaxError/);
});

test('a truncated cyclomatic-bound-ref.json fails with a SyntaxError', async () => {
	const { oxlintrcPath, refPath } = await buildFixture(
		canonicalOxlint,
		'{\n  "__default__": 125,\n  "apps/',
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /Cannot parse/);
	assert.match(errors[0], /SyntaxError/);
});

// ---------------------------------------------------------------------------
// Value mismatch: lowering a ceiling also fails
// ---------------------------------------------------------------------------

test('lowering a ceiling below the reference value fails', async () => {
	const oxlintWithLoweredDefault = {
		...canonicalOxlint,
		rules: { complexity: ['error', { max: 100 }] },
	};

	const { oxlintrcPath, refPath } = await buildFixture(
		oxlintWithLoweredDefault,
		canonicalRef,
	);

	const errors = verifyComplexityBounds(oxlintrcPath, refPath);

	assert.equal(errors.length, 1);
	assert.match(errors[0], /the ceiling was LOWERED from 125 to 100/);
});

// ---------------------------------------------------------------------------
// Reference-level self-check: the committed cyclomatic-bound-ref.json must
// encode the documented policy constants. This is the Constat 2 defense: even
// if someone edits cyclomatic-bound-ref.json and .oxlintrc.json together,
// the test still catches the change because these values are asserted here.
// ---------------------------------------------------------------------------

test('the committed reference file encodes the documented policy constants', async () => {
	const refPath = path.resolve(
		repoRoot,
		'packages/scripts-ts/src/cyclomatic-bound-ref.json',
	);

	const content = await readFile(refPath, 'utf-8');
	const reference = JSON.parse(content);

	for (const [pattern, expectedMax] of Object.entries(DOCUMENTED_POLICY)) {
		assert.equal(
			reference[pattern],
			expectedMax,
			`reference file must encode ${pattern} = ${expectedMax} (documented policy)`,
		);
	}
});

// ---------------------------------------------------------------------------
// Real-tree green: the actual repo files must pass.
// ---------------------------------------------------------------------------

test('the real repository .oxlintrc.json and cyclomatic-bound-ref.json are reconciled', async () => {
	const realOxlintPath = path.resolve(repoRoot, '.oxlintrc.json');
	const realRefPath = path.resolve(
		repoRoot,
		'packages/scripts-ts/src/cyclomatic-bound-ref.json',
	);

	const errors = verifyComplexityBounds(realOxlintPath, realRefPath);

	assert.deepEqual(
		errors,
		[],
		`the real .oxlintrc.json must match cyclomatic-bound-ref.json\n${errors.join('\n')}`,
	);
});
