/**
 * @vitest-environment node
 *
 * GREEN TEST — issue #1895, proof 2 of 2.
 *
 * ## Context
 *
 * Issue #1895: C# test-infrastructure files under Lib/Testing/ and Tests/
 * are compiled ONLY into the test project and never ship, so their
 * duplication is normal and must be reported, not gated.
 *
 * The fix: isTestInfraDir() excludes files by directory path
 * (/Lib/Testing/, /Tests/) regardless of suffix.
 *
 * ## What the proof asserts (green direction)
 *
 * The proof asserts the CORRECT outcome: files under Lib/Testing/ and
 * Tests/ ARE excluded by isSpecFile().
 *
 * ## Replay
 *   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1895/green-1895-test-infra-excluded.test.ts
 *
 * Expected: PASS — the files are excluded by directory.
 */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSpecFile } from '../../../src/check-jscpd.ts';

test('GREEN: with directory exclusion, C# test infra files are excluded', () => {
	const testInfraFiles = [
		'apps/api/Lib/Testing/Helpers/TenantTestHelper.cs',
		'apps/api/Lib/Testing/Fixtures/SomeFixture.cs',
		'apps/api/Tests/SomeTest.cs',
	];

	for (const file of testInfraFiles) {
		assert.strictEqual(
			isSpecFile(file),
			true,
			`GREEN proof: ${file} must be excluded from production`,
		);
	}
});
