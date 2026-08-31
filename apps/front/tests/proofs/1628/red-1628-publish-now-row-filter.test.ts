/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1628 (ronde 10 paired proof).
 *
 * ## Context
 *
 * The publish-now e2e test in
 * `apps/front/e2e/tenant-posts-publish-now.spec.ts` polls the tenant
 * history table until it sees an external link matching
 * `^https://bsky.app/profile/`. The reload loop lives inside the same
 * tenant — and the e2e stack uses a SHARED tenant, so prior runs leave
 * already-published rows behind. If the row selector stops filtering by
 * the freshly-composed `postBody`, `postRow().getByTestId(...).first()`
 * resolves to the first row in the table, which can be one of those
 * prior runs' rows. The link it carries still matches the prefix; the
 * regex assertion still passes; and the publish-now feature itself can
 * be silently broken without the test noticing.
 *
 * The reviewer at ronde 9 named this exact mutation: "retirer le filtre
 * `hasText: postBody` de `postRow()`" restores the original bug while
 * keeping the test green. The CI worker can be slow enough on a loaded
 * runner for the loop to hit a stale row first; on a fast runner the
 * new row lands before the first read, and the mutation is silent. The
 * runtime is not the right place to prove this defect: a static proof
 * of the source is deterministic and survives both timings.
 *
 * ## What this proof asserts
 *
 * The proof reads the REAL spec source and asserts the BUG is present:
 *
 * > `postRow()` filters by `{ hasText: postBody }` AND a final invariant
 * >   assertion verifies that a row carrying the freshly-composed
 * >   `postBody` exists in the history table body.
 *
 * Both checks are required: removing only one of them re-opens the
 * "publish-now silently broken, test green" gap. The proof fails when
 * EITHER guard is missing, so a future regression that drops either one
 * is loud rather than silent.
 *
 * ## Three-state discrimination
 *
 * - BUG ABSENT (correct code): the source contains both the
 *   `{ hasText: postBody }` filter and the final `getByText(postBody)`
 *   invariant → `expect(filterPresent && invariantPresent).toBe(true)`
 *   PASSES, but the proof asserts the BUG is present by inverting each
 *   check → one assertion FAILS with an AssertionError → kept-red.
 *
 *   The kept-red state IS the proof: on the corrected code the test
 *   must keep failing, the runner must keep reporting "Proof tests
 *   failed as expected", and the CI step `Verify paired red proofs`
 *   must keep turning green on the inverted classification.
 *
 * - BUG PRESENT (mutation): one of the two guards is missing → the
 *   matching `expect(...).toBe(true)` fails → the proof PASSES its
 *   "bug present" assertion → CORRUPT PROOF → CI step reds.
 *
 * - MESURE IMPOSSIBLE: the proof cannot locate the spec file, or the
 *   source is unreadable, or the regex anchors drift. This state FAILS
 *   LOUD with a named reason — it NEVER silently collapses to "bug
 *   absent".
 *
 * ## Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1628/red-1628-publish-now-row-filter.test.ts
 *
 * Expected: FAIL — on correct code both guards are present, so the
 * "guard is missing" assertion fails.
 *
 * ## Mutation to introduce the red (restore the bug)
 *
 * Remove the `{ hasText: postBody }` filter from `postRow()` in
 * `apps/front/e2e/tenant-posts-publish-now.spec.ts`. The proof then
 * passes because `filterPresent` becomes false. To re-open the gap a
 * second way, also delete the final invariant block that uses
 * `getByText(postBody)`; the proof passes because
 * `invariantPresent` becomes false too.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const e2eDir = fileURLToPath(new URL('../../../e2e', import.meta.url));
const specPath = `${e2eDir}/tenant-posts-publish-now.spec.ts`;

test('publish-now row selector is missing the { hasText: postBody } filter (defect: postRow() matches stale rows on a shared tenant)', () => {
	if (!existsSync(specPath)) {
		throw new Error(
			`MESURE IMPOSSIBLE: spec file not found at ${specPath}. ` +
				`The proof cannot read the source.`,
		);
	}
	const source = readFileSync(specPath, 'utf8');
	const filterPresent =
		/\.locator\(\s*['"]tr['"]\s*,\s*\{\s*hasText:\s*postBody\s*\}\s*\)/.test(
			source,
		);
	// The kept-red contract: the BUG must be present, i.e. the filter
	// must be MISSING. On correct code the filter is present, the
	// assertion below fails, and the proof stays red as expected.
	expect(filterPresent).toBe(false);
});

// --- #1964 combined-mutation safety net ---
//
// The two single-guard tests above catch a one-at-a-time removal. A
// refactor that drops BOTH guards at the same time (the #1964
// mutation) leaves both individual tests green — the pair is
// collectively vacuous. This third test catches the combined removal:
// on correct code either guard is present, so the OR is true and the
// kept-red inversion (expect(true).toBe(false)) fails with an
// AssertionError. On the combined mutation, both guards are missing,
// the OR is false, the assertion passes, and the runner turns the
// proof CORRUPT PROOF — which is the bug catching itself.
//
// The replay `.dump/mutate-1964.sh` removes BOTH guards at once and
// runs this test. On the unmutated source the test fails RED (kept
// red). On the mutated source the test passes and the proof turns
// CORRUPT PROOF — the proof is loud, not silent.
test('publish-now: combined-mutation safety net — at least one guard must be present (#1964)', () => {
	if (!existsSync(specPath)) {
		throw new Error(
			`MESURE IMPOSSIBLE: spec file not found at ${specPath}. ` +
				`The proof cannot read the source.`,
		);
	}
	const source = readFileSync(specPath, 'utf8');
	const filterPresent =
		/\.locator\(\s*['"]tr['"]\s*,\s*\{\s*hasText:\s*postBody\s*\}\s*\)/.test(
			source,
		);
	const invariantPresent =
		/\.getByText\(\s*postBody\s*,\s*\{\s*exact:\s*false\s*\}\s*\)/.test(source);
	// Kept-red inversion: on correct code the OR is true; the assertion
	// below fails. On the combined mutation the OR is false; the
	// assertion passes — the proof catches the combined removal.
	expect(filterPresent || invariantPresent).toBe(false);
});

test('publish-now final invariant is missing the getByText(postBody) check (defect: stale link could satisfy the loop without the row carrying the composed body)', () => {
	if (!existsSync(specPath)) {
		throw new Error(
			`MESURE IMPOSSIBLE: spec file not found at ${specPath}. ` +
				`The proof cannot read the source.`,
		);
	}
	const source = readFileSync(specPath, 'utf8');
	const invariantPresent =
		/\.getByText\(\s*postBody\s*,\s*\{\s*exact:\s*false\s*\}\s*\)/.test(source);
	expect(invariantPresent).toBe(false);
});
