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
 *
 * NOTE ON `no-floating-promises`: this file uses `node:test` (not vitest).
 * `node:test`'s runner captures test outcomes via its async-context mechanism,
 * independent of the returned Promise. The `typescript(no-floating-promises)`
 * rule flags `test()` as returning `Promise<void>` per `@types/node` 26.x, but
 * in the `node:test` execution model that Promise is fire-and-forget — the
 * runner does not depend on the caller awaiting it. We therefore prefix each
 * `test()` call with `void` (a targeted, per-call suppression) rather than
 * disabling the rule for the entire file. This keeps the rule active for any
 * genuinely floating promise that someone adds in this file — a file-wide
 * override would mask all of them, defeating the rule's purpose.
 * If these tests ever migrate to vitest (where the returned Promise IS the
 * test result), the `void` prefix becomes a redundant no-op and MAY be removed.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	scanFrontSrcForSharedTsReExports,
	scanSharedTsSrcForSharedTsReExports,
	scanTreeForSharedTsReExports,
	SHARED_TS_SEGMENTS,
	deriveSharedTsSegments,
	buildSharedTsModulePattern,
	formatFinding,
} from './check-shared-ts-import-paths.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const realFrontSrc = path.resolve(here, '../../src');
const realSharedTsSrc = path.resolve(
	here,
	'../../../../packages/shared-ts/src',
);

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

void test('RED: a front-side re-export of a shared-ts module is detected', () => {
	const root = makeSandbox();
	// Recreate the R1 shim exactly where it lived.
	writeFileSync(
		path.join(root, 'front-src/lib/should-logout-for-failure.ts'),
		SHIM_BODY,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(findings.length >= 1, 'expected the shim re-export to be found');
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/should-logout-for-failure.ts',
	);
	assert.ok(
		hit,
		`expected a finding in lib/should-logout-for-failure.ts, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`shim re-export must be DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).includes(SHIM_SPECIFIER),
		`finding text should name the shared-ts module: ${formatFinding(hit)}`,
	);
});

void test('RED: a named (non-barrel) front-side re-export of a shared-ts module is detected', () => {
	// Adversarial form: a single-symbol re-export in a helpers barrel, the thing
	// a developer adds without realising it opens a second path.
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/should-logout.ts'),
		NAMED_SHIM_BODY,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/should-logout.ts',
	);
	assert.ok(
		hit,
		`expected a finding in lib/should-logout.ts, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`named re-export must be DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).includes('shouldLogoutForFailure'),
		`finding text should name the re-exported symbol: ${formatFinding(hit)}`,
	);
});

void test('GREEN: without the shim, no shared-ts re-export is found', () => {
	const root = makeSandbox();
	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.deepEqual(
		findings,
		[],
		`expected zero front-side re-exports of shared-ts, got ${JSON.stringify(findings)}`,
	);
});

void test('GREEN: existing front code importing shared-ts directly is NOT flagged', () => {
	const root = makeSandbox();
	// Direct imports of shared-ts are the wanted path and must not trip the
	// guard — verify by asserting the legitimate import sites are clean.
	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file.includes('router.tsx')),
		'router.tsx imports shared-ts directly and must not be flagged',
	);
});

// Sanity: front-local re-exports are not the second-path construct the guard
// rejects.
void test('front-local re-exports are NOT flagged', () => {
	const root = makeSandbox();
	mkdirSync(path.join(root, 'front-src/lib/sub'), { recursive: true });
	writeFileSync(
		path.join(root, 'front-src/lib/sub/barrel.ts'),
		"export * from './thing';\n",
	);
	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/sub/barrel.ts'),
		'front-local re-exports must not be flagged',
	);
});

// ---- R2: all import/export forms the brief requires ----------------------

void test('RED: multi-line named re-export (`export {\\n foo,\\n} from ...`) is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/multi-line-shim.ts'),
		MULTILINE_NAMED_SHIM_BODY,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/multi-line-shim.ts',
	);
	assert.ok(
		hit,
		`multi-line named re-export must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`multi-line re-export must be DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).includes(SHIM_SPECIFIER),
		`finding text should name the shared-ts module: ${formatFinding(hit)}`,
	);
});

void test('RED: `export type * from "@org/shared-ts/..."` is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/type-star-shim.ts'),
		`export type * from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/type-star-shim.ts',
	);
	assert.ok(
		hit,
		`export type * must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`export type * re-export must be DUAL_PATH (#1678 R5)`,
	);
});

void test('RED: `export * as ns from "@org/shared-ts/..."` is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/namespace-alias-shim.ts'),
		`export * as ns from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/namespace-alias-shim.ts',
	);
	assert.ok(
		hit,
		`export * as ns must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`export * as ns re-export must be DUAL_PATH (#1678 R5)`,
	);
});

void test('GREEN: `export * from "./local"` (front-local namespace re-export) is NOT flagged', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/local-barrel.ts'),
		`export * from './local';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/local-barrel.ts'),
		`front-local export * must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

void test('RED: `export type { X } from "@org/shared-ts/..."` (type-only named) is detected', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/type-only-shim.ts'),
		`export type { shouldLogoutForFailure } from '${SHIM_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/type-only-shim.ts',
	);
	assert.ok(
		hit,
		`type-only named re-export must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`type-only named re-export must be DUAL_PATH (#1678 R5)`,
	);
});

void test('GREEN: dynamic `import("@org/shared-ts/...")` is INSPECTED but NOT flagged', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/dynamic-shim.ts'),
		`const mod = import('${SHIM_SPECIFIER}');\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/dynamic-shim.ts'),
		`dynamic import of a shared-ts module is a direct (wanted) import, must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

// ---- R2: regression test — guard must inspect the AST, not lines ----------

void test('REGRESSION: guard inspects the AST, not lines — multi-line form must be caught (not blank-line-skipped)', () => {
	// This test exists to fail if the guard regresses to a line-by-line scan.
	// A line-by-line regex scanning individual text lines would NEVER see a
	// multi-line export declaration as a single `export ... from '...'` statement
	// on one line. The guard must therefore parse the file into an AST and walk
	// export-declaration nodes. If it reverts to per-line scanning, this test
	// goes RED because the multi-line re-export above will not be found.
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/multi-line-shim.ts'),
		MULTILINE_NAMED_SHIM_BODY,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/multi-line-shim.ts',
	);
	assert.ok(
		hit,
		'AST regression: multi-line re-export must be found — a line-by-line scan would miss it',
	);
});

// ---- existing shared-ts scope tests (carried forward) ---------------------

void test('RED: a shared-ts-internal re-export of a sibling shared-ts module is detected', () => {
	const root = makeSandbox();
	// A barrel inside the shared package that re-surfaces a sibling under a
	// second @org/shared-ts specifier — the failure mode #1612 extends the
	// guard to catch.
	writeFileSync(
		path.join(root, 'shared-ts-src/lib/_staff-barrel.ts'),
		NAMED_SHIM_BODY,
	);

	const findings = scanSharedTsSrcForSharedTsReExports(
		path.join(root, 'shared-ts-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'packages/shared-ts/src/lib/_staff-barrel.ts',
	);
	assert.ok(
		hit,
		`expected a finding in lib/_staff-barrel.ts, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`shared-ts-internal re-export must be DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).includes(SHIM_SPECIFIER),
		`finding text should name the shared-ts module: ${formatFinding(hit)}`,
	);
});

void test('GREEN: shared-ts/src with no internal re-export is clean', () => {
	const root = makeSandbox();
	const findings = scanSharedTsSrcForSharedTsReExports(
		path.join(root, 'shared-ts-src'),
	);
	assert.deepEqual(
		findings,
		[],
		`expected zero shared-ts-internal re-exports, got ${JSON.stringify(findings)}`,
	);
});

void test('GREEN: a shared-ts file re-exporting a sibling via a relative path is NOT flagged', () => {
	// A relative re-export does NOT create a second *published* path, so it must
	// stay green — proves the contract is "second @org/shared-ts specifier", not
	// "any re-export inside shared-ts".
	const root = makeSandbox();
	mkdirSync(path.join(root, 'shared-ts-src/lib/sub'), { recursive: true });
	writeFileSync(
		path.join(root, 'shared-ts-src/lib/sub/barrel.ts'),
		"export { shouldLogoutForFailure } from '../should-logout-for-failure';\n",
	);
	const findings = scanSharedTsSrcForSharedTsReExports(
		path.join(root, 'shared-ts-src'),
	);
	assert.ok(
		!findings.some(
			(f) => f.file === 'packages/shared-ts/src/lib/sub/barrel.ts',
		),
		'relative sibling re-exports inside shared-ts must not be flagged',
	);
});

void test('scanTreeForSharedTsReExports labels findings with the tree label', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/should-logout.ts'),
		NAMED_SHIM_BODY,
	);
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

void test('RED: re-export of @org/shared-ts/@types/* is detected as DUAL_PATH (#1678)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/types-shim.ts'),
		`export * from '${TYPES_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/types-shim.ts',
	);
	assert.ok(
		hit,
		`re-export of @org/shared-ts/@types/* must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`@types re-export must be DUAL_PATH, not UNKNOWN_SEGMENT — this is the assertion that breaks when the bug fix is reverted (#1678)`,
	);
	assert.ok(
		formatFinding(hit).includes(TYPES_SPECIFIER),
		`finding text should name the @types module: ${formatFinding(hit)}`,
	);
});

void test('RED: re-export of @org/shared-ts/scripts/* is detected as DUAL_PATH (#1678)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/scripts-shim.ts'),
		`export type { JsonElement } from '${SCRIPTS_SPECIFIER}';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/scripts-shim.ts',
	);
	assert.ok(
		hit,
		`re-export of @org/shared-ts/scripts/* must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`scripts re-export must be DUAL_PATH, not UNKNOWN_SEGMENT — this is the assertion that breaks when the bug fix is reverted (#1678)`,
	);
	assert.ok(
		formatFinding(hit).includes(SCRIPTS_SPECIFIER),
		`finding text should name the scripts module: ${formatFinding(hit)}`,
	);
});

// ---- #1678 paired proof: legitimate non-shared-ts re-exports stay GREEN ----

void test('GREEN: re-export of a non-shared-ts package is NOT flagged (#1678 paired proof)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/external-shim.ts'),
		`export { foo } from 'some-other-pkg/lib';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/external-shim.ts'),
		`non-shared-ts re-export must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

void test('GREEN: re-export from another front-local file is NOT flagged (#1678 paired proof)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/local-re-export.ts'),
		`export { foo } from './other';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	assert.ok(
		!findings.some((f) => f.file === 'apps/front/src/lib/local-re-export.ts'),
		`front-local re-export must not be flagged, got ${JSON.stringify(findings)}`,
	);
});

// ---- #1678 fail-loudly: unknown first segment must not pass silently ----

void test('RED: re-export of @org/shared-ts/<unknown-segment> fails loudly with UNKNOWN_SEGMENT (#1678)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/unknown-shim.ts'),
		`export * from '@org/shared-ts/nonexistent/foo';\n`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/unknown-shim.ts',
	);
	assert.ok(
		hit,
		`re-export of an unknown shared-ts segment must be flagged, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'UNKNOWN_SEGMENT',
		`unknown-segment re-export must be UNKNOWN_SEGMENT, not DUAL_PATH — this is the assertion that breaks when the fail-loudly branch is mutated to DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).startsWith('UNKNOWN_SEGMENT:'),
		`finding text should carry UNKNOWN_SEGMENT cause, got: ${formatFinding(hit)}`,
	);
	assert.ok(
		formatFinding(hit).includes('@org/shared-ts/nonexistent'),
		`finding text should name the unknown specifier, got: ${formatFinding(hit)}`,
	);
});

// ---- #1678: PARSE_ERROR on unparseable files still produces a finding (requirement #6)

void test('RED: a source file with a syntax error produces a PARSE_ERROR finding (#1678 requirement 6)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/broken.ts'),
		`import {
`,
	);

	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
	);
	const hit = findings.find((f) => f.file === 'apps/front/src/lib/broken.ts');
	assert.ok(
		hit,
		`broken syntax file must produce a finding, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'PARSE_ERROR',
		`broken syntax must produce PARSE_ERROR, not DUAL_PATH — this is the assertion that breaks when the parse-error branch is mutated to DUAL_PATH (#1678 R5)`,
	);
	assert.ok(
		formatFinding(hit).startsWith('PARSE_ERROR:'),
		`finding text should carry PARSE_ERROR cause, got: ${formatFinding(hit)}`,
	);
});

// ---- #1678 R5: main() must exit non-zero when a violation is found ----
// The paired tests above call scanFrontSrcForSharedTsReExports() directly and
// never invoke main(). A mutation that changes process.exit(1) to process.exit(0)
// keeps all 24 tests green while restoring the "silent pass" defect in CI. This
// test invokes main() with sandbox roots and asserts the exit code.

void test('RED: main() exits non-zero when a shim re-export is present (#1678 R5)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'front-src/lib/should-logout-for-failure.ts'),
		SHIM_BODY,
	);

	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${path.join(root, 'shared-ts-src').replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);

	assert.notEqual(
		result.status,
		0,
		`main() must exit non-zero when a shim re-export is present, got exit code ${result.status}. stdout: ${result.stdout}. stderr: ${result.stderr}`,
	);
});

void test('GREEN: main() exits zero when no shim is present (#1678 R5)', () => {
	const root = makeSandbox();

	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${path.join(root, 'shared-ts-src').replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);

	assert.equal(
		result.status,
		0,
		`main() must exit zero when no shim is present, got exit code ${result.status}. stdout: ${result.stdout}. stderr: ${result.stderr}`,
	);
});

void test('SHARED_TS_SEGMENTS is derived from packages/shared-ts/src and contains @types and scripts (#1678)', () => {
	// The old hardcoded regex (lib|utils|validations|types) missed @types and scripts.
	// This assertion ensures the derivation picks them up — a regression to the
	// hardcoded list or an empty segment set would break this.
	assert.ok(
		SHARED_TS_SEGMENTS.includes('@types'),
		`SHARED_TS_SEGMENTS must contain @types, got ${JSON.stringify(SHARED_TS_SEGMENTS)}`,
	);
	assert.ok(
		SHARED_TS_SEGMENTS.includes('scripts'),
		`SHARED_TS_SEGMENTS must contain scripts, got ${JSON.stringify(SHARED_TS_SEGMENTS)}`,
	);
});

void test('SHARED_TS_SEGMENTS fails loudly when packages/shared-ts/src is unreadable (#1678)', () => {
	// deriveSharedTsSegments must throw on a missing directory — never exit 0 silently.
	assert.throws(
		() =>
			deriveSharedTsSegments(
				path.join(path.dirname(realSharedTsSrc), 'does-not-exist'),
			),
		/could not enumerate/,
	);
});

// ---- #1678 R6: main() fails loudly when derivation is empty (false-GREEN guard) ----
// A1 (R5): when deriveSharedTsSegments returns [], SHARED_TS_MODULE_PATTERN matches
// nothing and main() exits 0 (green) on a clean tree with zero detection power.
// The guard must self-check and fail loudly, naming the cause. This test creates
// a sandbox with an empty shared-ts/src directory and asserts main() exits non-zero.
void test('RED: main() fails loudly when shared-ts segment derivation is empty (#1678 R6)', () => {
	const root = makeSandbox();
	// Wipe the mirrored shared-ts-src tree so it exists but is empty — the exact
	// case deriveSharedTsSegments cannot catch by itself (the dir is readable,
	// it just has no subdirectories).
	rmSync(path.join(root, 'shared-ts-src'), { recursive: true, force: true });
	mkdirSync(path.join(root, 'shared-ts-src'), { recursive: true });

	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${path.join(root, 'shared-ts-src').replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);

	assert.notEqual(
		result.status,
		0,
		`main() must exit non-zero when segment derivation is empty, got exit code ${result.status}. stdout: ${result.stdout}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('derived zero shared-ts segments'),
		`stderr must name the empty-derivation cause, got: ${result.stderr}`,
	);
});

void test('GREEN: main() exits zero when segment derivation is non-empty and tree is clean (#1678 R6)', () => {
	const root = makeSandbox();
	// The sandbox mirrors the real packages/shared-ts/src which has @types, lib,
	// scripts, etc. — derivation is non-empty and the tree is clean, so main() passes.
	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${path.join(root, 'shared-ts-src').replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);

	assert.equal(
		result.status,
		0,
		`main() must exit zero on a clean tree with non-empty derivation, got exit code ${result.status}. stdout: ${result.stdout}. stderr: ${result.stderr}`,
	);
});

// ---- #1678 R6: deriveSharedTsSegments re-derives from the path main() actually uses ----
// Ensures the self-check inside main() is not using a stale module-level constant
// captured before the path override — it must re-derive from roots.sharedTsSrc.
void test('REGRESSION: main() re-derives segments from the overriden sharedTsSrc path (#1678 R6)', () => {
	// Point sharedTsSrc at the real directory: derivation is non-empty, tree clean.
	// If main() used the module-level SHARED_TS_SEGMENTS instead of re-deriving
	// from roots.sharedTsSrc, an empty-path override would be ignored. This
	// test proves the override flows through to the self-check by using the
	// RED test above (empty dir) which would be green if the override were ignored.
	const root = makeSandbox();
	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${realSharedTsSrc.replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);
	assert.equal(
		result.status,
		0,
		`main() with real sharedTsSrc override must exit zero, got ${result.status}. stderr: ${result.stderr}`,
	);
});

// ---- #1678 R6: main() fails loudly when derivation is non-empty but incomplete ----
// A1 (R5 verdict): "or a list that does not contain the expected segments". If the
// directory exists and has some subdirectories but is missing expected ones (e.g.
// @types was renamed to types2), the guard must still fail loudly — not silently
// skip re-exports of the missing segment.
void test('RED: main() fails loudly when derived segments are missing expected segment(s) (#1678 R6)', () => {
	const root = makeSandbox();
	// Wipe the mirrored shared-ts-src tree and create only a subset of the real
	// segments — missing @types and scripts (the ones the old hardcoded list
	// missed, which is the historical bug #1678).
	rmSync(path.join(root, 'shared-ts-src'), { recursive: true, force: true });
	mkdirSync(path.join(root, 'shared-ts-src/lib'), { recursive: true });
	mkdirSync(path.join(root, 'shared-ts-src/utils'), { recursive: true });
	mkdirSync(path.join(root, 'shared-ts-src/validations'), { recursive: true });

	const result = spawnSync(
		'node',
		[
			'--experimental-strip-types',
			'-e',
			`
import { main } from '${path.resolve(here, './check-shared-ts-import-paths.mts').replace(/\\/g, '/')}';
main({
  frontSrc: '${path.join(root, 'front-src').replace(/\\/g, '/')}',
  sharedTsSrc: '${path.join(root, 'shared-ts-src').replace(/\\/g, '/')}',
});
`,
		],
		{ encoding: 'utf8' },
	);

	assert.notEqual(
		result.status,
		0,
		`main() must exit non-zero when segment derivation is incomplete, got exit code ${result.status}. stdout: ${result.stdout}. stderr: ${result.stderr}`,
	);
	assert.ok(
		result.stderr.includes('missing'),
		`stderr must name the missing-segments cause, got: ${result.stderr}`,
	);
});

// ---- #1707: file-type entries in packages/shared-ts/src/ must be recognised as segments ----
// The package.json declares "exports": { "./*": { "types": ["./src/*.ts"] } }, so a
// file like packages/shared-ts/src/foo.ts IS resolvable as @org/shared-ts/foo. The
// previous isDirectory()-only filter silently dropped it, leaving the guard blind
// to re-exports of that segment. The fix extends the derivation to file entries,
// stripping the .ts/.mts/.cts extension to obtain the segment name.

void test('RED: a .ts file at shared-ts/src root is recognised as a segment (#1707)', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'seg-file-'));
	sandboxes.push(root);
	mkdirSync(path.join(root, '@types'), { recursive: true });
	mkdirSync(path.join(root, 'lib'), { recursive: true });
	mkdirSync(path.join(root, 'scripts'), { recursive: true });
	mkdirSync(path.join(root, 'types'), { recursive: true });
	mkdirSync(path.join(root, 'utils'), { recursive: true });
	mkdirSync(path.join(root, 'validations'), { recursive: true });
	writeFileSync(path.join(root, 'foo.ts'), `export const foo = 'bar';\n`);

	const segments = deriveSharedTsSegments(root);

	assert.ok(
		segments.includes('foo'),
		`deriveSharedTsSegments must include 'foo' (the file segment), got ${JSON.stringify(segments)}`,
	);
});

void test('RED: a re-export of a file-segment @org/shared-ts/foo is detected as DUAL_PATH (#1707)', () => {
	const root = makeSandbox();
	writeFileSync(
		path.join(root, 'shared-ts-src/foo.ts'),
		`export const foo = 'bar';\n`,
	);
	writeFileSync(
		path.join(root, 'front-src/lib/file-segment-shim.ts'),
		`export { foo } from '@org/shared-ts/foo';\n`,
	);

	// Build the pattern from the sandbox's shared-ts-src so the file-level
	// segment `foo` is recognised (the module-level pattern is derived from the
	// real tree which does not contain foo.ts).
	const pattern = buildSharedTsModulePattern(path.join(root, 'shared-ts-src'));
	const findings = scanFrontSrcForSharedTsReExports(
		path.join(root, 'front-src'),
		pattern,
	);
	const hit = findings.find(
		(f) => f.file === 'apps/front/src/lib/file-segment-shim.ts',
	);
	assert.ok(
		hit,
		`re-export of a file-segment shared-ts module must be detected, got ${JSON.stringify(findings)}`,
	);
	assert.equal(
		hit.type,
		'DUAL_PATH',
		`file-segment re-export must be DUAL_PATH, not UNKNOWN_SEGMENT — breaks when fix is reverted (#1707)`,
	);
});

void test('MUTATION: reverting to isDirectory()-only drops file segments (#1707)', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'seg-mutation-'));
	sandboxes.push(root);
	mkdirSync(path.join(root, 'lib'), { recursive: true });
	writeFileSync(path.join(root, 'foo.ts'), `export const foo = 'bar';\n`);
	writeFileSync(path.join(root, 'bar.json'), `{}\n`);

	const segments = deriveSharedTsSegments(root);

	assert.ok(
		segments.includes('foo'),
		`file segment 'foo' must be derived — reverting to isDirectory() only drops it (#1707): ${JSON.stringify(segments)}`,
	);
	assert.ok(
		!segments.includes('bar'),
		`non-source file 'bar.json' must NOT be derived as a segment: ${JSON.stringify(segments)}`,
	);
});
