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
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scanFrontSrcForSharedTsReExports } from './check-shared-ts-import-paths.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const realFrontSrc = path.resolve(here, '../../src');

const SHIM_SPECIFIER = '@org/shared-ts/lib/should-logout-for-failure';
const SHIM_BODY = `// Re-export shim recreating the R1 violation (#1533).
export * from '${SHIM_SPECIFIER}';
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
	cpSync(realFrontSrc, path.join(dir, 'src'), {
		recursive: true,
	});
	return dir;
};

test('RED: a front-side re-export of a shared-ts module is detected', () => {
	const root = makeSandbox();
	// Recreate the R1 shim exactly where it lived.
	writeFileSync(path.join(root, 'src/lib/should-logout-for-failure.ts'), SHIM_BODY);

	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'src'));
	assert.ok(findings.length >= 1, 'expected the shim re-export to be found');
	const hit = findings.find(
		(f) => f.file === 'lib/should-logout-for-failure.ts',
	);
	assert.ok(hit, `expected a finding in lib/should-logout-for-failure.ts, got ${JSON.stringify(findings)}`);
	assert.ok(hit.text.includes(SHIM_SPECIFIER), `finding text should name the shared-ts module: ${hit.text}`);
});

test('GREEN: without the shim, no shared-ts re-export is found', () => {
	const root = makeSandbox();
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'src'));
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
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'src'));
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
	mkdirSync(path.join(root, 'src/lib/sub'), { recursive: true });
	writeFileSync(
		path.join(root, 'src/lib/sub/barrel.ts'),
		"export * from './thing';\n",
	);
	const findings = scanFrontSrcForSharedTsReExports(path.join(root, 'src'));
	assert.ok(
		!findings.some((f) => f.file === 'lib/sub/barrel.ts'),
		'front-local re-exports must not be flagged',
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
