/**
 * Paired proof for the dual-path guard (#1533, R2).
 *
 * The guard exists to stop one shared-ts module being reachable from
 * apps/front through two import specifiers (the `~/lib/...` shim path and the
 * `@org/shared-ts/lib/...` path). These tests recreate the violating shim, run
 * the guard, and assert it is RED; then remove the shim and assert it is GREEN.
 *
 * `scanFrontSrcForSharedTsReExports` is imported from the guard and pointed at a
 * temp copy of `apps/front/src` so we never have to write the shim into the
 * real tree (which would itself be caught by `pnpm test`).
 *
 * The guard also scans `packages/shared-ts/src` (#1612): a file *inside* the
 * shared package that re-exports a sibling shared-ts module under a second
 * `@org/shared-ts/...` specifier creates a second published path to the same
 * module. The two shared-ts tests rebuild that case against a mirror of the
 * real `packages/shared-ts/src` so the proof is permanent and never touches the
 * real source.
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

// Sanity: the matcher is what the guard relies on; prove it rejects a
// front-local re-export (no shared-ts specifier) so we know the contract is
// specific, not "any re-export".
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

// ---- packages/shared-ts/src scope (#1612) ---------------------------------

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

test('regex sanity: only shared-ts re-exports match', async () => {
	const { REEXPORT_SHARED_TS } = (await import(
		'./check-shared-ts-import-paths.mts'
	)) as { REEXPORT_SHARED_TS: RegExp };
	assert.ok(
		REEXPORT_SHARED_TS.test("export * from '@org/shared-ts/lib/should-logout-for-failure';"),
		'shim body must match',
	);
	assert.ok(
		!REEXPORT_SHARED_TS.test("export * from './local';\n"),
		'front-local re-export must not match',
	);
});
