import path from 'node:path';

/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1844, round 3 (BLOQUANT 1).
 *
 * ## Context
 *
 * The comment-skip fix (`skip comment matches in mode:'source' rules`) was
 * judged by `match.index` alone. For no-single-star-route-glob pattern 2
 * (`...route\(\s*(?!['"`/])\S[^,)]*`) — the fail-closed branch with no
 * quote barrier — a match can START inside a comment range and lazily span
 * into a REAL `page.route(usersGlob, ...)` call on the same line. The
 * start-index-only skip dropped the whole match, hiding the real call.
 *
 * Before the r3 fix, the guard reported ZERO violations for this text
 * (a real `page.route(usersGlob, ...)` call preceded on the same line by a
 * comment that also contains `page.route(`):
 *
 * The fix only skips a match whose ENTIRE span lies inside ONE comment
 * range. With the fix in place, the guard reports the real call.
 *
 * ## What this proof does
 *
 * It asserts the BUG is present: the guard reports ZERO `no-single-star-route-glob`
 * violations for the comment-prefixed real call.
 *
 * - BUGGY code (r3 round 2 tip fa9fb36c1): the start-index skip drops the
 *   whole match → zero violations → `expect(zero).toBe(true)` PASSES.
 * - CORRECTED code (this PR): the span-wise skip keeps the real call →
 *   one violation → `expect(zero).toBe(true)` FAILS. Kept red.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1844/red-1844-route-glob-masked-by-comment-prefix.test.ts
 *
 * Expected: FAIL — on corrected code, the real call is detected.
 *
 * ## Mutation to introduce the red (restore the bug)
 *
 * In scripts/guards/check-design-system.mts, replace the span-wise skip
 * (`isMatchFullyInsideComment(match.index, match[0].length, commentRanges)`)
 * with the old start-index-only judge (`isInsideComment(match.index, ...)`).
 * The proof then passes because the whole match is dropped again.
 */
import { afterAll } from 'vitest';
import { expect, test } from 'vitest';

import {
	cleanupFixtures,
	makeFixture,
} from '../../../scripts/guards/check-design-system-fixtures.mts';
import { scanFront2DesignSystem } from '../../../scripts/guards/check-design-system.mts';

test('a real route glob call after a comment-prefixed match start is masked (issue #1844 r3)', async () => {
	const root = await makeFixture({
		'e2e/specs/route-comment-prefix.spec.ts': [
			'/* We call page.route( once per test to stub the API */ await page.route(usersGlob, (route) => route.abort());',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const routeGlobViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	// The BUG: the whole match (comment start + real call) is dropped, so
	// the real call is never reported.
	expect(routeGlobViolations).toHaveLength(0);
}, 30000);

afterAll(async () => {
	await cleanupFixtures();
});
