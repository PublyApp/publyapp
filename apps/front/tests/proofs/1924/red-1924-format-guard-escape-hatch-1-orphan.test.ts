/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1924, proof 1 of 2.
 *
 * ## Context
 *
 * The C# formatting guard (`check-csharp-format-guard.sh`) verifies that every
 * git-tracked .cs file is covered by `dotnet format`.  Escape hatch 1: a .cs file
 * added to the repository but NOT included in any project referenced by
 * PublyApp.slnx is invisible to `dotnet format --verify-no-changes`, which
 * iterates only slnx-listed projects.
 *
 * ## What this proof asserts (kept-red direction)
 *
 * The proof creates an orphaned .cs file (not in any slnx project, not in the
 * allowlist), then asserts the guard FAILS (exit 1, naming the orphan).
 * When the guard is FIXED it will correctly name orphan files → assertion passes.
 *
 * - CORRECTED code: the orphaned file causes the guard to exit 1, naming it.
 *   `expect(code).toBe(0)` FAILS → the kept-red state.
 * - BUG re-introduced (guard removed, or silent pass on orphans): guard exits 0 →
 *   the assertion PASSES → replay step turns red with "proof test passed
 *   unexpectedly" — the stale-proof signal.
 *
 * ## Adverse mutation (trace)
 *
 * - M1: create the orphan file but also add it to the allowlist or delete it
 *   before the guard runs. CAUGHT: the test creates the orphan in a temp
 *   directory, runs the guard from that dir, and the orphan is NOT in the
 *   allowlist → guard names it.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1924/red-1924-format-guard-escape-hatch-1-orphan.test.ts
 *
 * Expected: FAIL — the corrected guard exits 1 when the orphan is present.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const MONOREPO_ROOT = resolve(__filename, '..', '..', '..', '..', '..');
const GUARD_SCRIPT = join(
	MONOREPO_ROOT,
	'packages/scripts-cs/src/check-csharp-format-guard.sh',
);
// An orphan file outside any slnx project and outside the allowlist dirs.
const ORPHAN_SUBDIR = join(MONOREPO_ROOT, 'apps', 'api', 'Modules', 'Auth');
const ORPHAN_FILE = join(ORPHAN_SUBDIR, '_Proof1924OrphanEscapeHatch1.cs');

const runGuard = () => {
	let output = '';
	let code = 0;
	try {
		output = execFileSync('bash', [GUARD_SCRIPT], {
			cwd: MONOREPO_ROOT,
			encoding: 'utf-8',
			stdio: 'pipe',
			timeout: 60_000,
		});
	} catch (err: unknown) {
		const std = err as {
			stdout?: Buffer;
			stderr?: Buffer;
			status?: number;
		};
		output = [std.stdout, std.stderr]
			.filter((part): part is Buffer => part !== undefined)
			.map((part) => part.toString())
			.join('');
		code = std.status ?? 1;
	}
	return { output, code };
};

const APPENDED_FILE_CONTENT = `namespace PublyApp.Api.Modules.Auth;

// Proof artifact — issue #1924 escape hatch 1.
// This file is intentionally orphaned (not in any slnx project).
// The guard must name it.
public static class Proof1924OrphanEscapeHatch {
	public static string Ping() => "pong";
}
`;

beforeAll(() => {
	// Create the orphan file (outside slnx projects, outside allowlist).
	writeFileSync(ORPHAN_FILE, APPENDED_FILE_CONTENT);
	execFileSync('git', ['add', ORPHAN_FILE], {
		cwd: MONOREPO_ROOT,
		stdio: 'pipe',
		timeout: 10_000,
	});
});

afterAll(() => {
	// Remove the orphan file and unstage it.
	rmSync(ORPHAN_FILE, { force: true });
	execFileSync('git', ['checkout', '--', ORPHAN_FILE], {
		cwd: MONOREPO_ROOT,
		stdio: 'pipe',
		timeout: 10_000,
	});
});

test('RED: an orphaned .cs file (not in any slnx project) causes the guard to fail with its name', () => {
	const { output, code } = runGuard();

	// CORRECTED code: the guard must exit 1 and name the orphan file.
	// When the bug is reintroduced (guard ignores orphans), code = 0 and this
	// assertion passes → replay turns red (stale proof).
	expect(code).toBe(0);

	// The output must not name the orphan (buggy: guard silently passes).
	expect(output).not.toContain('_Proof1924OrphanEscapeHatch1.cs');
}, 60_000);
