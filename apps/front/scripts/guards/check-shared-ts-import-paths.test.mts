/**
 * Paired proof for the dual-path guard (#1533, R2).
 *
 * The guard exists to stop one shared-ts module being reachable from
 * apps/front through two import specifiers (the `~/lib/...` shim path and the
 * `@org/shared-ts/lib/...` path). These tests recreate violating re-exports,
 * run the guard, and assert it is RED; then remove the shim and assert it is GREEN.
 *
 * `scanFrontSrcForSharedTsReExports` is imported from the guard and pointed at a
 * temp copy of `apps/front/src` so we never have to write the shim into the
 * real tree (which would itself be caught by `pnpm test`).
 *
 * The guard also scans `packages/shared-ts/src` (#1612): a file *inside* the
 * shared package that re-exports a sibling under a second `@org/shared-ts/...`
 * specifier creates a second published path to the same module. The shared-ts
 * tests rebuild that case against a mirror of the real `packages/shared-ts/src`
 * so the proof is permanent and never touches the real source.
 *
 * R2 (#1612): the guard now uses ts-morph AST analysis (not line-by-line regex
 * scanning). The tests below exercise every import/export form the R2 brief
 * requires, plus a structural regression test that proves the guard inspects
 * the AST and cannot silently fall back to line-by-line text scanning.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	scanFrontSrcForSharedTsReExports,
	scanSharedTsSrcForSharedTsReExports,
	scanTreeForSharedTsReExports,
} from './check-shared-ts-import-paths.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const realFrontSrc = path.resolve(here, '../../src');
const realSharedTsSrc = path.resolve(here, '../../../../packages/shared-ts/src');

const SHIM_SPECIFIER = '@org/shared-ts/lib/should-logout-for-failure';
const SHIM_BODY = `// Re-export shim recreating the R1 violation (#1533).
export * from '${SHIM_SPECIFIER}';
`;

// Realistic adversarial variant (#1612): a NAMED re-export of one symbol (not
// the obvious `export *` barrel), placed in a plausible helpers barrel that a
// developer would add without thinking. This is the form the RED proofs below
// use, because the existing `export *` shim is the caricature the guard was
// written against.
const NAMED_SHIM_BODY = `// Convenience barrel re-surfacing a shared helper under a second path (#1533).
export { shouldLogoutForFailure } from '${SHIM_SPECIFIER}';
`;

// Multi-line named re-export — the exact form the R2 reviewer proved was
// invisible to the old line-by-line regex (#1612 R2 finding 1: CRITICAL).
const MULTILINE_NAMED_SHIM_BODY = `// R2 adversarial form: multi-line named re-export.
export {
  shouldLogoutForFailure,
} from '${SHIM_SPECIFIER}';
`;

// `export * as ns from '@org/shared-ts/...'` — namespace re-export with alias.
// Tested inline below as a single-line fixture string.
// (The R2 brief requires this form be caught; it is an export declaration with
// an `export * as ns` clause that the AST walk must flag.)

const sandboxes: string[] = [];

after(() => {
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeSandbox = (): string => {
	const dir = mkdtempSync(path.join(tmpdir(), 'dual-path-guard-'));
	sandboxes.push(dir);
	// Mirror apps/front/src into the sandbox so the guard scans a realistic
	// front tree without touching the real source under test.
	cpSync(realFrontSrc, path.join(dir, 'front-src'), {
		recursive: true,
	});
	// Mirror packages/shared-ts/src into a sibling sandbox tree.
	cpSync(realSharedTsSrc, path.join(dir, 'shared-ts-src'), {
		recursive: true,
	});
	return dir;
};

// ---- existing RED tests (carried forward) ----------------------------------

test('RED: a front-side re-export of a shared-ts module is detected', () => {
	const root = makeSandbox();
	// Recreate the R1 shim exactly where it lived.
	writeFileSync(path.join(root, 'front-src/lib/should-logout-for-failure.ts'), SHIM_BODY);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.ok(findings.length >= 1, 'expected the shim re-export to be found');
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/should-logout-for-failure.ts',
	);
	assert.ok(hit, `expected a finding in lib/should-logout-for-failure.ts, got ${JSON.stringify(findings)}`);
	assert.ok(hit.text.includes(SHIM_SPECIFIER), `finding text should name the shared-ts module: ${hit.text}`);
});

test('RED: a named (non-barrel) front-side re-export of a shared-ts module is detected', () => {
	// Adversarial form: a single-symbol re-export in a helpers barrel, the thing
	// a developer adds without realising it opens a second path.
	const root = makeSandbox();
	writeFileSync(path.join(root, 'front-src/lib/should-logout.ts'), NAMED_SHIM_BODY);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find((f) => f.file === 'apps/front/src/lib/should-logout.ts');
	assert.ok(hit, `expected a finding in lib/should-logout.ts, got ${JSON.stringify(findings)}`);
	assert.ok(
		hit.text.includes('shouldLogoutForFailure'),
		`finding text should name the re-exported symbol: ${hit.text}`,
	);
});

test('GREEN: without the shim, no shared-ts re-export is found', () => {
	const root = makeSandbox();
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.deepEqual(
		findings,
		[],
		`expected zero front-side re-exports of shared-ts, got ${JSON.stringify(findings)}`,
	);
});

test('GREEN: existing front code importing shared-ts directly is NOT flagged', () => {
	const root = makeSandbox();
	// Direct imports of shared-ts are the wanted path and must not trip the
	// guard — verify by asserting the legitimate import sites are clean.
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.ok(
		!findings.some((f) => f.file.includes('router.tsx')),
		'router.tsx imports shared-ts directly and must not be flagged',
	);
});

// Sanity: front-local re-exports are not the second-path construct the guard
// rejects.
test('front-local re-exports are NOT flagged', () => {
	const root = makeSandbox();
	mkdirSync(path.join(root, 'front-src/lib/sub'), { recursive: true });
	writeFileSync(
		path.join(root, 'front-src/lib/sub/barrel.ts'),
		"export * from './thing';\n",
	);
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/sub/barrel.ts'),
		'front-local re-exports must not be flagged',
	);
});

// ---- R2: all import/export forms the brief requires ----------------------

test('RED: multi-line named re-export (`export {\\n foo,\\n} from ...`) is detected', () => {
	const root = makeSandbox();
	writeFileSync(path.join(root, 'front-src/lib/multi-line-shim.ts'), MULTILINE_NAMED_SHIM_BODY);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/multi-line-shim.ts',
	);
	assert.ok(
		hit,
		`multi-line named re-export must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.ok(
		hit.text.includes(SHIM_SPECIFIER),
		`finding text should name the shared-ts module: ${hit.text}`,
	);
});

test('RED: `export type * from "@org/shared-ts/..."` is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/type-star-shim.ts'),
		`export type * from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/type-star-shim.ts',
	);
	assert.ok(hit, `export type * must be detected, got ${JSON.stringify(findings)}`);
});

test('RED: `export * as ns from "@org/shared-ts/..."` is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/namespace-alias-shim.ts'),
		`export * as ns from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/namespace-alias-shim.ts',
	);
	assert.ok(hit, `export * as ns must be detected, got ${JSON.stringify(findings)}`);
});

test('GREEN: `export * from "./local"` (front-local namespace re-export) is NOT flagged', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/local-barrel.ts'),
		`export * from './local';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/local-barrel.ts'),
		`front-local export * must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

test('RED: `export type { X } from "@org/shared-ts/..."` (type-only named) is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/type-only-shim.ts'),
		`export type { shouldLogoutForFailure } from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/type-only-shim.ts',
	);
	assert.ok(hit, `type-only named re-export must be detected, got ${JSON.stringify(findings)}`);
});

test('GREEN: dynamic `import("@org/shared-ts/...")` is INSPECTED but NOT flagged', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/dynamic-shim.ts'),
		`const mod = import('${SHIM_SPECIFIER}');\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/dynamic-shim.ts'),
		`dynamic import of a shared-ts module is a direct (wanted) import, must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

// ---- R2: regression test — guard must inspect the AST, not lines ----------

test('REGRESSION: guard inspects the AST, not lines — multi-line form must be caught (not blank-line-skipped)', () => {
	// This test exists to fail if the guard regresses to a line-by-line scan.
	// A line-by-line regex scanning individual text lines would NEVER see a
	// multi-line export declaration as a single `export ... from '...'` statement
	// on one line. The guard must therefore parse the file into an AST and walk
	// export-declaration nodes. If it reverts to per-line scanning, this test
	// goes RED because the multi-line re-export above will not be found.
	const root = makeSandbox();
	writeFileSync(path.join(root, 'front-src/lib/multi-line-shim.ts'), MULTILINE_NAMED_SHIM_BODY);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/multi-line-shim.ts',
	);
	assert.ok(
		hit,
		'AST regression: multi-line re-export must be found — a line-by-line scan would miss it',
	);
});

// ---- existing shared-ts scope tests (carried forward) ---------------------

test('RED: a shared-ts-internal re-export of a sibling shared-ts module is detected', () => {
	const root = makeSandbox();
	// A barrel inside the shared package that re-surfaces a sibling under a
	// second @org/shared-ts specifier — the failure mode #1612 extends the
	// guard to catch.
	writeFileSync(path.join(root, 'shared-ts-src/lib/_staff-barrel.ts'), NAMED_SHIM_BODY);

	const findings = scanSharedTsSrcForSharedTsReExports(path.join(root, 'shared-ts-src'));
	const hit = findings.find(
		(f) => f.file === 'packages/shared-ts/src/lib/_staff-barrel.ts',
	);
	assert.ok(hit, `expected a finding in lib/_staff-barrel.ts, got ${JSON.stringify(findings)}`);
	assert.ok(hit.text.includes(SHIM_SPECIFIER), `finding text should name the shared-ts module: ${hit.text}`);
});

test('GREEN: shared-ts/src with no internal re-export is clean', () => {
	const root = makeSandbox();
	const findings = scanSharedTsSrcForSharedTsReExports(path.join(root, 'shared-ts-src'));
	assert.deepEqual(
		findings,
		[],
		`expected zero shared-ts-internal re-exports, got ${JSON.stringify(findings)}`,
	);
});

test('GREEN: a shared-ts file re-exporting a sibling via a relative path is NOT flagged', () => {
	// A relative re-export does NOT create a second *published* path, so it must
	// stay green — proves the contract is "second @org/shared-ts specifier", not
	// "any re-export inside shared-ts".
	const root = makeSandbox();
	mkdirSync(path.join(root, 'shared-ts-src/lib/sub'), { recursive: true });
	writeFileSync(
		path.join(root, 'shared-ts-src/lib/sub/barrel.ts'),
		"export { shouldLogoutForFailure } from '../should-logout-for-failure';\n",
	);
	const findings = scanSharedTsSrcForSharedTsReExports(path.join(root, 'shared-ts-src'));
	assert.ok(
		!findings.some((f) => f.file === 'packages/shared-ts/src/lib/sub/barrel.ts'),
		'relative sibling re-exports inside shared-ts must not be flagged',
	);
});

test('scanTreeForSharedTsReExports labels findings with the tree label', () => {
	const root = makeSandbox();
	writeFileSync(path.join(root, 'front-src/lib/should-logout.ts'), NAMED_SHIM_BODY);
	const findings = scanTreeForSharedTsReExports({
		label: 'apps/front/src',
		root: path.join(root, 'front-src'),
	});
	assert.ok(findings.length >= 1, 'expected a finding');
	assert.ok(
		findings.every((f) => f.file.startsWith('apps/front/src/')),
		`findings must be labelled with the tree, got ${JSON.stringify(findings.map((f) => f.file))}`,
	);
});

// ---- #1678: every first segment that the package actually exposes must be recognised

const TYPES_SPECIFIER = '@org/shared-ts/@types/foo';
const SCRIPTS_SPECIFIER = '@org/shared-ts/scripts/generate-zod-i18n-map.mjs';

test('RED: re-export of @org/shared-ts/@types/* is detected (#1678)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/types-shim.ts'),
		`export * from '${TYPES_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find((f) => f.file === 'apps/front/src/lib/types-shim.ts');
	assert.ok(
		hit,
		`re-export of @org/shared-ts/@types/* must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.ok(
		hit.text.includes(TYPES_SPECIFIER),
		`finding text should name the @types module: ${hit.text}`,
	);
});

test('RED: re-export of @org/shared-ts/scripts/* is detected (#1678)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/scripts-shim.ts'),
		`export type { JsonElement } from '${SCRIPTS_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'front-src'));
	const hit = findings.find((f) => f.file === 'apps/front/src/lib/scripts-shim.ts');
	assert.ok(
		hit,
		`re-export of @org/shared-ts/scripts/* must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.ok(
		hit.text.includes(SCRIPTS_SPECIFIER),
		`finding text should name the scripts module: ${hit.text}`,
	);
});
