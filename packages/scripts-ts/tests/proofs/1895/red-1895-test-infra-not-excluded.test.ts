/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1895, proof 1 of 2.
 *
 * ## Context
 *
 * Issue #1895: C# test-infrastructure files under Lib/Testing/ and Tests/
 * are compiled ONLY into the test project and never ship, so their
 * duplication is normal and must be reported, not gated. Before the fix,
 * these files were counted as production because they carry no .Spec.cs
 * suffix.
 *
 * The fix: isTestInfraDir() excludes files by directory path
 * (/Lib/Testing/, /Tests/) regardless of suffix.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: a file under Lib/Testing/ is NOT
 * excluded by isSpecFile() — it would be counted as production.
 *
 * - CORRECTED code: isSpecFile() returns true (excluded by directory).
 *   `expect(result).toBe(false)` FAILS — the kept-red state.
 * - BUG re-introduced (directory check removed): isSpecFile() returns false
 *   → the assertion PASSES → replay red.
 *
 * ## Replay
 *   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1895/red-1895-test-infra-not-excluded.test.ts
 *
 * Expected: FAIL — on corrected code the file is excluded, so
 * `expect(result).toBe(false)` fails.
 */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSpecFile } from '../../../src/check-jscpd.ts';

test('RED: without directory exclusion, C# test infra files count as production', () => {
	// A file under Lib/Testing/ with no .Spec.cs suffix — test-only code.
	const testInfraFile = 'apps/api/Lib/Testing/Helpers/TenantTestHelper.cs';

	const result = isSpecFile(testInfraFile);

	// BUGGY condition (asserted): the file is NOT excluded.
	// On corrected code, isSpecFile returns true (excluded by directory),
	// so this assertion FAILS — the kept-red state.
	assert.strictEqual(
		result,
		false,
		'RED proof: without directory exclusion, test infra files count as production',
	);
});
