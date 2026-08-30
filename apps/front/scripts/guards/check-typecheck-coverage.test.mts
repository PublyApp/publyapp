/**
 * Unit test for the typecheck coverage guard (#1758 / #1760).
 *
 * The guard exists to stop the typecheck gates from going decorative again:
 * the production entry `server.mjs` sat in the main tsconfig `include` for
 * months while tsc silently ignored it (measured ZERO times in `tsc
 * --listFiles`, #1692/#1758), `allowJs` on the main config measurably breaks
 * the gate (#1749), and `deploy/` + the tooling `.cjs` matched nothing at all
 * (#1760).
 *
 * These tests pin the three load-bearing behaviours against the REAL tree and
 * the REAL tsc — a synthetic fixture would not count (rule: the guard must
 * attend the real artifact):
 *
 * - MISSING ARTIFACT: a config whose program lacks an expected real file is a
 *   finding the guard names. This is the red-side of the paired proof: the
 *   defect (an artifact not attended by its gate) is exactly an absent
 *   program entry.
 * - REAL PROGRAMS, REAL ARTIFACTS: the guard replays the ACTUAL
 *   `tsconfig.server.json`, `tsconfig.js-surfaces.json`, and main
 *   `tsconfig.json` with the workspace's real tsc and asserts the real files
 *   (the entry, the four JS surfaces, every `e2e/**` TypeScript file) are in
 *   the programs. The e2e assertion pins the #1760 measurement: the surface
 *   is already inside the main program, and this test turns red the day an
 *   edit excludes it.
 * - UNREADABLE INPUT: a config tsc cannot run is a loud throw, never a
 *   compliant empty.
 *
 * NOTE ON `no-floating-promises`: this file uses `node:test` (not vitest).
 * Same `void test(...)` convention as
 * `check-shared-ts-node-resolution.test.mts` — see its header.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	EXPECTED_JS_SURFACE_FILES,
	findMissingProgramFiles,
	listTypeScriptFiles,
	runTscListFiles,
} from './check-typecheck-coverage.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontDir = path.resolve(here, '..', '..');
const e2eDir = path.join(frontDir, 'e2e');
const resolveInFront = (file: string): string => path.resolve(frontDir, file);
const serverEntry = resolveInFront('server.mjs');

void test('finding is empty when every expected file is in the program', () => {
	const missing = findMissingProgramFiles(
		[serverEntry, resolveInFront('package.json')],
		[serverEntry],
	);
	assert.deepEqual(missing, []);
});

void test('finding names each expected file absent from the program', () => {
	const missing = findMissingProgramFiles(
		[resolveInFront('package.json')],
		[serverEntry],
	);
	assert.deepEqual(missing, [serverEntry]);
});

void test('the REAL tsconfig.server.json program attends the REAL server.mjs', () => {
	// Exported so the test can replay the exact invocation the typecheck gate
	// runs. This is the durable "guard attends the real artifact" assertion:
	// it fails (throws) if server.mjs stops typechecking clean, and the
	// coverage check below fails if the file leaves the program.
	const programFiles = runTscListFiles('tsconfig.server.json');
	assert.ok(
		programFiles.includes(serverEntry),
		`server.mjs must be in the tsconfig.server.json program. ` +
			`Program listed ${programFiles.length} files, none of them ` +
			`${serverEntry}.`,
	);
});

void test('the REAL tsconfig.js-surfaces.json program attends all four JS surfaces', () => {
	const programFiles = runTscListFiles('tsconfig.js-surfaces.json');
	const missing = findMissingProgramFiles(
		programFiles,
		EXPECTED_JS_SURFACE_FILES.map(resolveInFront),
	);
	assert.deepEqual(
		missing,
		[],
		`deploy scripts and the tooling .cjs must be in the ` +
			`tsconfig.js-surfaces.json program; missing: ${missing.join(', ')}.`,
	);
});

void test('the REAL main program attends EVERY real e2e TypeScript file (#1760 measurement)', () => {
	const e2eFiles = listTypeScriptFiles(e2eDir);
	assert.ok(
		e2eFiles.length > 0,
		'the e2e tree must not be empty — examining nothing must never pass.',
	);
	const programFiles = runTscListFiles('tsconfig.json');
	const missing = findMissingProgramFiles(programFiles, e2eFiles);
	assert.deepEqual(
		missing,
		[],
		`every e2e TypeScript file must stay inside the main tsconfig program; ` +
			`${missing.length} missing (${missing
				.slice(0, 5)
				.map((file) => path.relative(frontDir, file))
				.join(', ')}...).`,
	);
});

void test('a config tsc cannot run fails loud', () => {
	assert.throws(
		() => runTscListFiles('tsconfig-does-not-exist.json'),
		/tsc failed for tsconfig-does-not-exist\.json/,
	);
});
