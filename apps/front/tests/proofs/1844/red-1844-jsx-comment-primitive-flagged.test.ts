import path from 'node:path';

/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1844, round 3 (BLOQUANT 2).
 *
 * ## Context
 *
 * Round 2 of the review found that the PR's scope claim (`Closes #1844`)
 * overstated what was delivered: JSX comments (brace, slash-star, text,
 * star-slash, brace) were still flagged as violations. The original incident (#1827) that #1844 exists to
 * prevent was exactly a comment naming a forbidden primitive turning CI red
 * — and a JSX comment naming one did so too, because TypeScript's trivia
 * APIs never report JSX expression-container comments.
 *
 * Before the r3 fix, `scanFront2DesignSystem` reported a
 * `no-dialog-popup-primitives` violation for this component (the primitive
 * is cited inside a JSX comment — brace, slash-star, star-slash, brace):
 *
 * The fix scans each JsxExpression container with the compiler's own
 * scanner (trivia reporting on) and feeds those comment ranges into the
 * same skip rule.
 *
 * ## What this proof does
 *
 * It asserts the BUG is present: a forbidden primitive cited inside a JSX
 * comment IS reported as a violation.
 *
 * - BUGGY code (r3 round 2 tip fa9fb36c1): no JSX comment ranges are
 *   collected, so `DialogPrimitive.Popup` inside a JSX comment (brace,
 *   slash-star, text, star-slash, brace) trips the
 *   guard → one violation → `expect(hasViolation).toBe(true)` PASSES.
 * - CORRECTED code (this PR): JSX comments are skipped → zero violations →
 *   `expect(hasViolation).toBe(true)` FAILS. Kept red.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1844/red-1844-jsx-comment-primitive-flagged.test.ts
 *
 * Expected: FAIL — on corrected code, the JSX comment is a comment.
 *
 * ## Mutation to introduce the red (restore the bug)
 *
 * In scripts/guards/check-design-system.mts, disable the JSX scanner pass
 * in `collectCommentRanges` (remove the `if (scriptKind ===
 * ts.ScriptKind.TSX)` block). The proof then passes because the JSX comment
 * is invisible to the comment ranges again.
 */
import { afterAll } from 'vitest';
import { expect, test } from 'vitest';

import {
	cleanupFixtures,
	makeFixture,
} from '../../../scripts/guards/check-design-system-fixtures.mts';
import { scanFront2DesignSystem } from '../../../scripts/guards/check-design-system.mts';

test('a forbidden primitive inside a JSX comment is flagged (issue #1844 r3)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-jsx-comment.tsx': [
			'export const Component = () => (',
			'  <div>',
			'    {/* TODO: use DialogPrimitive.Popup for the modal */}',
			'    <span>Hello</span>',
			'  </div>',
			');',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const hasPrimitiveViolation = violations.some(
		(violation) => violation.ruleId === 'no-dialog-popup-primitives',
	);

	// The BUG: the JSX comment is not treated as a comment, so the
	// forbidden primitive it names is reported as a real usage.
	expect(hasPrimitiveViolation).toBe(true);
}, 30000);

afterAll(async () => {
	await cleanupFixtures();
});
