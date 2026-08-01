import assert from 'node:assert/strict';
import test from 'node:test';

import { Scanner } from '@tailwindcss/oxide';

import {
	classifyZUtility,
	checkCompiledCssZIndex,
	KNOWN_RAW_Z_INDEX_DECLARATIONS,
	runZIndexGuard,
	scanZIndexFile,
	stripComments,
} from './check-zindex-guard.mjs';

// #987 — z-index scale guard. Every fixture below lives in `scripts/`, outside
// any path the Tailwind production scanner watches (`src/**`), so fixture
// literals can never reach the shipped stylesheet the way the withdrawn guard's
// did. The compiled-CSS gate in `runZIndexGuard` additionally proves nothing
// raw ships.

const scanner = new Scanner({ sources: [] });

const violationsFor = (relativePath, content) =>
	scanZIndexFile({ scanner, relativePath, content });

const assertRaw = (relativePath, content) => {
	const violations = violationsFor(relativePath, content);
	assert.ok(
		violations.length > 0,
		`expected a violation for ${relativePath}: ${JSON.stringify(content)}`,
	);
	return violations;
};

const assertClean = (relativePath, content) => {
	const violations = violationsFor(relativePath, content);
	assert.deepEqual(
		violations.map((violation) => violation.source),
		[],
		`expected no violations for ${relativePath}: ${JSON.stringify(content)}`,
	);
};

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------
test('classifier: every evasion shape is a raw z-index utility', () => {
	for (const candidate of [
		'z-50',
		'z-0',
		'z-[60]',
		'z-[50]',
		'-z-10',
		'!z-50',
		'z-50!',
		'md:z-50',
		'[&:hover]:z-50',
		'hover:-z-10',
		'z-[var(--publy-z-menu,50)]',
		'z-[50px]',
	]) {
		assert.equal(classifyZUtility(candidate), 'raw', candidate);
	}
});

test('classifier: scale-routed and inert utilities are allowed', () => {
	for (const candidate of [
		'z-auto',
		'z-(--publy-z-raised)',
		'z-(--publy-z-shell-topbar)',
		'z-[--publy-z-menu]',
		'z-[var(--publy-z-menu)]',
		'md:z-(--publy-z-menu)',
		'!z-(--publy-z-raised)',
		'z-(--publy-z-raised)!',
		'z-[inherit]',
		'z-[initial]',
		'z-[unset]',
		'z-[revert]',
	]) {
		assert.equal(classifyZUtility(candidate), 'allowed', candidate);
	}
});

test('classifier: non-utilities are null', () => {
	for (const candidate of [
		'z-index',
		'--publy-z-menu',
		'block',
		'fixed',
		'px-2',
		'text-foreground',
		'[&>svg]:size-3!',
	]) {
		assert.equal(classifyZUtility(candidate), null, candidate);
	}
});

// ---------------------------------------------------------------------------
// Evasions — the withdrawn guard was green on all of these.
// ---------------------------------------------------------------------------
test('evasion: template literal with substitution still yields the z-50 candidate', () => {
	assertRaw(
		'fixture.tsx',
		'const x = "px-2"; export const view = <div className={`fixed z-50 ${x}`} />;',
	);
});

test('evasion: @apply terminal and mid tokens are scanned directly', () => {
	assertRaw('fixture.css', '.x { @apply block z-50; }');
	assertRaw('fixture.css', '.x { @apply z-50; }');
	assertRaw('fixture.css', '.x { @apply block !z-50; }');
});

test('evasion: cross-module constant class string is a delivery position', () => {
	assertRaw('constants.ts', "export const layers = 'z-50 fixed top-0';");
});

test('evasion: important modifier and variants are stripped before classifying', () => {
	assertRaw(
		'fixture.tsx',
		'<div className="!z-50 z-50! md:z-50 [&:hover]:z-50" />',
	);
	assertRaw('fixture.tsx', '<div className="hover:-z-10" />');
});

test('evasion: utility spanning a substitution boundary has no candidate', () => {
	assertRaw('fixture.tsx', 'const view = <div className={`z-${level}`} />;');
	assertRaw('fixture.tsx', 'const view = <div className={`z-[${value}]`} />;');
	assertRaw('fixture.tsx', 'const view = <div className={`-z-${value}`} />;');
	assertRaw(
		'fixture.tsx',
		'const view = <div className={`${prefix}z-${value}`} />;',
	);
	assertRaw('fixture.tsx', 'const view = <div className={`md:z-${level}`} />;');
	assertRaw(
		'fixture.tsx',
		'const view = <div className={`fixed z-${level} block`} />;',
	);
});

test('innocent: custom class with -z- mid-token is not a z-index assembly', () => {
	assertClean(
		'fixture.tsx',
		'const view = <div className={`foo-z-${suffix}`} />;',
	);
	assertClean(
		'fixture.tsx',
		'const view = <div className={`grid-cols-${count}`} />;',
	);
});

// ---------------------------------------------------------------------------
// Innocent constructs — must stay green.
// ---------------------------------------------------------------------------
test('innocent: type literal in a .d.ts and interface member', () => {
	assertClean('types.d.ts', "type Layer = 'z-50';");
	assertClean(
		'types.ts',
		"type Layer = 'z-50';\ninterface Foo { layer: 'z-50'; }",
	);
});

test('innocent: non-class JSX attributes', () => {
	assertClean('fixture.tsx', '<div data-example="z-50" aria-label="z-50" />');
});

test('innocent: comparand that can never reach className', () => {
	assertClean(
		'fixture.tsx',
		"const view = <div className={kind === 'z-50' ? 'active' : 'idle'} />;",
	);
	assertClean('fixture.ts', 'export const a = kind !== `z-50`;');
});

test('innocent: CSS attribute-selector value', () => {
	assertClean('fixture.css', '[data-example=".z-50"] { color: red; }');
	assertClean('fixture.css', '[data-example="z-50"] { color: red; }');
});

test('innocent: z-auto is a legitimate non-stacking reset', () => {
	assertClean('fixture.tsx', '<div className="z-auto" />');
	assertClean('fixture.css', '.x { @apply z-auto; }');
});

test('innocent: z-fragment template outside a delivery position', () => {
	assertClean('fixture.tsx', 'const x = <div data-tip={`z-${level}`} />;');
});

test('innocent: class templates without a z fragment', () => {
	assertClean(
		'fixture.tsx',
		'const view = <div className={`px-${size} mt-${margin}`} />;',
	);
});

// ---------------------------------------------------------------------------
// Comment stripping is string-aware and position-preserving.
// ---------------------------------------------------------------------------
test('stripComments: removes comments but not strings or templates', () => {
	assert.equal(
		stripComments('const a = 1; // z-50\nconst b = 2;'),
		'const a = 1;        \nconst b = 2;',
	);
	assert.equal(stripComments('const s = "z-50";'), 'const s = "z-50";');
	assert.equal(
		stripComments('const t = `z-50 ${x}`;'),
		'const t = `z-50 ${x}`;',
	);
	assert.equal(
		stripComments('const u = "https://x/z-50";'),
		'const u = "https://x/z-50";',
	);
	assert.equal(
		stripComments('/* z-50 */ const c = 3;'),
		'           const c = 3;',
	);
	assert.equal(
		stripComments('const a = `${x // z-50\n}`;'),
		`const a = \`\${x${' '.repeat(1 + '// z-50'.length)}\n}\`;`,
	);
});

// ---------------------------------------------------------------------------
// Compiled-CSS gate.
// ---------------------------------------------------------------------------
test('compiled-CSS gate: only scale-routed or inert declarations pass', () => {
	const css = [
		'.a { z-index: var(--publy-z-menu); }',
		'.b { z-index: var(--publy-z-raised); }',
		'.c { z-index: auto; }',
		':root { --publy-z-menu: 100; }',
	].join('\n');
	assert.deepEqual(checkCompiledCssZIndex(css), []);
});

test('compiled-CSS gate: raw numeric declarations are flagged', () => {
	const css = '.a { z-index: 50; }\n.b { z-index: 10; }\n.c { z-index: 60; }';
	const violations = checkCompiledCssZIndex(css);
	assert.equal(violations.length, 3);
	assert.ok(
		violations.every(
			(violation) => violation.ruleId === 'z-index-declaration-not-on-scale',
		),
	);
});

test('compiled-CSS gate: allowlisted declarations are seen and permitted', () => {
	const css = '.thead { z-index: 5; }';
	assert.equal(
		checkCompiledCssZIndex(css, KNOWN_RAW_Z_INDEX_DECLARATIONS).length,
		0,
	);
	assert.equal(checkCompiledCssZIndex(css, []).length, 1);
});

// ---------------------------------------------------------------------------
// The live repository check — zero violations on the tree under test.
// ---------------------------------------------------------------------------
test('unmodified repository passes with zero violations', async () => {
	const { violations, candidateCount, fileCount } = await runZIndexGuard();
	assert.deepEqual(
		violations,
		[],
		`unexpected violations: ${JSON.stringify(violations, null, 2)}`,
	);
	assert.ok(fileCount > 300, `expected a real scan, got ${fileCount} files`);
	assert.ok(
		candidateCount > 10000,
		`expected real candidates, got ${candidateCount}`,
	);
});
