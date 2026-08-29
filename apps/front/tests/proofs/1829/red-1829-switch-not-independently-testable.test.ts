import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1829.
 *
 * ## Context
 *
 * The `switch` in run-preuves.mts that consumes classifyProof's verdict and
 * decides which counter to increment is the load-bearing decision point of the
 * guard: misclassifying a verdict here is exactly the defect class #1784 was
 * designed to eliminate (a crashed vitest process → ERROR verdict → counted
 * as an expected failure, a silent green that measured nothing).
 *
 * Before the fix, the `switch` was embedded in run-preuves.mts and had NO test
 * coverage. The adverse mutation the issue calls out — changing
 * `unexpectedPasses++` to `failures++` in the ERROR branch — kept the entire
 * suite green, because there was no test exercising the switch at all.
 *
 * ## What this proof does
 *
 * This proof asserts the BUG is present: the verdict-to-counter switch is NOT
 * independently testable (no separate module exists for it). On the corrected
 * code, the switch IS extracted into a pure, independently testable module —
 * so this assertion FAILS, which is the kept-red state.
 *
 * ## Why this is a kept-red proof
 *
 * - BUGGY code (original): the switch is inline in run-preuves.mts, no separate
 *   module exists → `expect(moduleExists).toBe(true)` FAILS → the proof
 *   asserts the bug is present → PASSES (bug detected).
 *
 * - CORRECT code (fixed): the switch is extracted to consume-verdict.mts →
 *   `expect(moduleExists).toBe(true)` PASSES → the proof asserts the bug is
 *   present → FAILS (kept-red, the expected state).
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1829/red-1829-switch-not-independently-testable.test.ts
 *
 * Expected: FAIL — on corrected code, the switch IS independently testable.
 *
 * ## Mutation to introduce the red (restore the bug)
 *
 * Inline the switch back into run-preuves.mts and delete consume-verdict.mts.
 * The proof then passes because the module it checks for no longer exists.
 */
import { test, expect } from 'vitest';

const scriptsDir = fileURLToPath(
	new URL('../../../scripts/ci', import.meta.url),
);
const consumeVerdictPath = `${scriptsDir}/consume-verdict.mts`;

test('the verdict-to-counter switch is NOT independently testable (issue #1829)', () => {
	// The BUG: the switch is embedded in run-preuves.mts with no separate module.
	// A separate module would let the switch be unit-tested independently —
	// its absence is the gap this issue closes.
	expect(existsSync(consumeVerdictPath)).toBe(false);
});
