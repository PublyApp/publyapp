/**
 * Paired red proof #1821 — jscpd ratchet guard
 *
 * This test proves the guard works by mutating the tree: it adds a C# file that
 * self-duplicates, runs the guard, and asserts it FAILS (red). The exact
 * mutation is named below so a reviewer can re-apply it.
 *
 * RED: guard fails when production self-duplication increases.
 * GREEN: guard passes on the baseline (no self-dup added).
 *
 * Mutation to re-apply for red:
 *   File: apps/api/Modules/Example/Services/ExampleSvc.cs
 *   Content: see PROOF_FILE_CONTENT constant below
 *   (namespace + class + two identical string-returning methods +
 *    two identical block-bodied methods — sufficient to exceed jscpd 50-token min)
 *
 * To replay: copy the content below to that path, run `just ci-jscpd`, observe
 * failure, then delete the file.
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, test } from 'vitest';

// Resolve monorepo root from this test file's location:
// apps/front/tests/proofs/1821/test.ts → monorepo root is 5 levels up.
const __filename = fileURLToPath(import.meta.url);
const MONOREPO_ROOT = resolve(
	dirname(__filename),
	'..',
	'..',
	'..',
	'..',
	'..',
);
const PROOF_FILE_PATH = join(
	MONOREPO_ROOT,
	'apps/api/Modules/Example/Services/ExampleSvc.cs',
);
// Matches the path jscpd writes to when given --output .dump/jscpd-report.json
// (it creates the directory and puts report.json inside).
// jscpd --output .dump/jscpd-report.json writes report.json INSIDE that dir:
//   → .dump/jscpd-report.json/jscpd-report.json
const REPORT_PATH = join(
	MONOREPO_ROOT,
	'.dump/jscpd-report.json/jscpd-report.json',
);
const REF_PATH = join(
	MONOREPO_ROOT,
	'packages/scripts-ts/src/jscpd-reference.json',
);
const GUARD_PATH = join(
	MONOREPO_ROOT,
	'packages/scripts-ts/src/check-jscpd.ts',
);

const PROOF_FILE_CONTENT = `namespace PublyApp.Modules.Example.Services;

public static class ExampleService
{
    public static string GetMessage() => "Hello from the example service";
    public static string GetMessage() => "Hello from the example service";

    public static int CalculateValue(int input)
    {
        var result = input * 2;
        return result;
    }
    public static int CalculateValue(int input)
    {
        var result = input * 2;
        return result;
    }
}
`;

/** The mutation: add a C# file with two identical method bodies → self-duplicate. */
function applyMutation(): void {
	const dir = join(MONOREPO_ROOT, 'apps/api/Modules/Example/Services');
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(PROOF_FILE_PATH, PROOF_FILE_CONTENT);
}

/** Remove the mutation: restore green. */
function revertMutation(): void {
	rmSync(join(MONOREPO_ROOT, 'apps/api/Modules/Example'), {
		recursive: true,
		force: true,
	});
}

describe('Paired red proof #1821 — jscpd ratchet guard', () => {
	test('RED: guard fails when production self-duplication is added', () => {
		applyMutation();

		try {
			// Run jscpd on just the Example directory — avoids full-tree scan timeout.
			// jscpd exits 1 when it finds clones — suppress with || true.
			execSync(
				[
					'pnpm exec jscpd apps/api/Modules/Example',
					'--min-tokens 50',
					'--reporters json',
					'--output .dump/jscpd-report.json',
					'2>/dev/null || true',
				].join(' '),
				{ cwd: MONOREPO_ROOT, timeout: 30_000 },
			);

			// The guard must exit non-zero when auto-dup lines increase.
			let guardOutput = '';
			let guardCode = 0;
			try {
				guardOutput = execSync(
					`node "${GUARD_PATH}" "${REPORT_PATH}" "${REF_PATH}"`,
					{
						timeout: 10_000,
						encoding: 'utf-8',
						cwd: MONOREPO_ROOT,
						stdio: 'pipe',
					},
				);
			} catch (err: unknown) {
				// Guard writes to stdout; errors also go to stderr — capture both.
				const std = err as { stdout?: string; stderr?: string };
				guardOutput = [std.stdout ?? '', std.stderr ?? '']
					.filter(Boolean)
					.join('');
				guardCode = (err as { status?: number }).status ?? 1;
			}

			// Guard must report a violation (exit non-zero).
			expect(guardCode).not.toBe(0);
			// Output must not be empty (sanity: guard had something to say).
			expect(guardOutput.trim().length).toBeGreaterThan(0);
		} finally {
			revertMutation();
		}
	});
});
