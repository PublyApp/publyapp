/**
 * Unit test for the typecheck coverage guard (#1758 / #1760).
 *
 * The guard exists to stop the typecheck gates from going decorative again:
 * the production entry `server.mjs` sat in the main tsconfig `include` for
 * months while tsc silently ignored it (measured ZERO times in `tsc
 * --listFiles`, #1692/#1758), and `allowJs` on the main config measurably
 * breaks the gate (#1749).
 *
 * These tests pin the three load-bearing behaviours:
 *
 * - MISSING ARTIFACT: a config whose program lacks an expected real file is a
 *   finding the guard names. This is the red-side of the paired proof: the
 *   defect (an artifact not attended by its gate) is exactly an absent
 *   program entry, and CI replays it against the real tree below.
 * - REAL PROGRAM, REAL ARTIFACT: the guard replays the ACTUAL
 *   `tsconfig.server.json` with the workspace's real tsc and asserts the real
 *   `server.mjs` is in the program. A synthetic fixture would not count (rule:
 *   the guard must attend the real artifact); this test does exactly what the
 *   gate does, so a future edit that drops `server.mjs` from the config turns
 *   this test red before the coverage gate even runs.
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
	findMissingProgramFiles,
	runTscListFiles,
} from './check-typecheck-coverage.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontDir = path.resolve(here, '..', '..');
const serverEntry = path.resolve(frontDir, 'server.mjs');

void test('finding is empty when every expected file is in the program', () => {
	const missing = findMissingProgramFiles(
		[serverEntry, path.resolve(frontDir, 'package.json')],
		[serverEntry],
	);
	assert.deepEqual(missing, []);
});

void test('finding names each expected file absent from the program', () => {
	const missing = findMissingProgramFiles(
		[path.resolve(frontDir, 'package.json')],
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

void test('a config tsc cannot run fails loud', () => {
	assert.throws(
		() => runTscListFiles('tsconfig-does-not-exist.json'),
		/tsc failed for tsconfig-does-not-exist\.json/,
	);
});
