/**
 * @vitest-environment jsdom
 *
 * KEPT RED TEST — issue #1899.
 *
 * The icon visibility guard in
 * `apps/front/src/components/table/data-table-icon-visibility-guard.ts`
 * measured (#1842), but its body had only two exits: visible, not visible.
 * When it could NOT analyze the style — a node detached from the document,
 * or a reader that returned the engine's unresolved marker (the empty
 * string) — it fell through to "visible". A guard that answers "all fine"
 * when it cannot see is worse than no guard at all, because the suite
 * trusts it. #1899 demands the third case, INDETERMINATE: fail loud,
 * naming the cause (node not connected / style not resolved) and the
 * expected action.
 *
 * KEPT-RED SEMANTICS: this proof asserts the DEFECT is present — the guard
 * SILENTLY passes an unanalyzable input. Each of the two defect tests uses
 * `.not.toThrow()`:
 *
 * - Against the DEFECTED code (pre-#1899 body): both pass — the defect is
 *   present, the proof is intact.
 * - Against the FIXED code (three-case body): the guard raises, so the
 *   "defect present" expectation fails. That failure IS the proof; the
 *   `Verify paired red proofs` CI step (front-ci.yml, `pnpm --filter front
 *   test:preuves`) replays this file with inverted semantics.
 *
 * The third test pins the context so a stale proof is diagnosable: the
 * guard's normal verdicts (a hidden icon is caught, a visible one passes)
 * hold in BOTH worlds, so if this file ever stops failing on tests 1-2,
 * something besides the indeterminate gate has moved.
 *
 * MEASURED, not reasoned (the issue forbids building on the pre-#1899
 * comment claims): jsdom 30.0.1 in this suite resolves a plausible visible
 * DEFAULT for a detached node (`visibility:"visible"`, `display:"inline"`,
 * `opacity:"1"`) — it never returns `''` for these three properties. So:
 *
 * - the detached-node case is provable in this lane only because the
 *   connection check is a DOM property (`isConnected`), not an engine
 *   reading; the jsdom default reader is structurally incapable of showing
 *   the node as unresolvable;
 * - the unresolved-value case is proven here by injecting the reader shape
 *   a real engine returns (Chromium returns `''` for a detached node — the
 *   load-bearing real-engine proof of both cases lives in the browser lane,
 *   `e2e/data-table-icon-visibility-guard.spec.ts`, which runs the real
 *   guard bundle against the real engine's own unanalyzable output);
 * - the GREEN side of this pairing lives with the implementation:
 *   `src/components/table/data-table-icon-visibility-guard-indeterminable.test.ts`.
 *
 * Executed both directions during #1899:
 *
 * - defect body (guard at 0924167c3, the pre-#1899 measurement body):
 *   `pnpm exec vitest run --config vitest.preuves.config.ts
 *   tests/proofs/1899/` → 3/3 GREEN (defect present).
 * - fixed body (three-case): same command → 2/3 RED (the two defect tests
 *   fail on assertion — "expected not to throw"), 1/3 green (context).
 *   Via the runner: `pnpm --filter front test:preuves` → "Proof tests
 *   failed as expected: 2" → step green.
 */
import { describe, expect, test, vi } from 'vitest';

import { assertIconIsVisible } from '../../../src/components/table/data-table-icon-visibility-guard';
import type { ComputedStyleReader } from '../../../src/components/table/data-table-icon-visibility-guard-reader';

// The guard imports the `i18next` singleton for its error messages. The
// proof only asserts the throw/no-throw contract, so a `t` that returns the
// key is the smallest honest stand-in (deterministic, names the mechanism).
vi.mock('i18next', () => ({
	default: {
		t: (key: string): string => key,
	},
}));

const makeIcon = (): HTMLElement => {
	const icon = document.createElement('span');
	icon.setAttribute('data-icon', 'check');
	return icon;
};

describe('Icon visibility guard (#1899) — kept red proof: unanalyzable input answered "visible"', () => {
	test('DEFECT: a detached node silently passes the guard (unanalyzable input treated as visible)', () => {
		const icon = makeIcon();
		// Deliberately NOT attached to the document — the exact input the
		// issue names (a partially rendered tree, a torn-down component, a
		// poorly isolated test). The DEFECTED body reads the (plausible
		// visible) jsdom default, finds no hiding mechanism, and answers
		// "visible" without having seen anything. The FIXED body must raise
		// (indeterminate — node not connected), which makes this
		// expectation fail: the defect is gone, the proof is doing its job.
		expect(() =>
			assertIconIsVisible(icon, 'proof-1899 detached'),
		).not.toThrow();
	});

	test('DEFECT: unresolved (empty) computed values silently pass the guard (treated as "nothing hides it")', () => {
		// A CONNECTED icon, with a reader returning the engine's unresolved
		// marker (`''`) — the value Chromium returns when it cannot compute
		// (and the shape jsdom would have had, if its documented behavior
		// were true). The DEFECTED body finds no `hidden`, no `none`, no
		// `0` in the empty strings and answers "visible" — substituting a
		// plausible default for a value it cannot read. The FIXED body must
		// raise (indeterminate — style not resolved), failing this
		// expectation.
		const icon = makeIcon();
		document.body.appendChild(icon);
		const unresolvedReader: ComputedStyleReader = () => ({
			visibility: '',
			display: '',
			opacity: '',
		});
		expect(() =>
			assertIconIsVisible(icon, 'proof-1899 unresolved', unresolvedReader),
		).not.toThrow();
		icon.remove();
	});

	test('context: the guard still catches a hidden icon and passes a visible one (both worlds)', () => {
		// Pins the surroundings of the defect so a future re-shape of this
		// proof is diagnosable: the four hiding mechanisms and the visible
		// verdict are orthogonal to the indeterminate gate. Holds against
		// both the defected and the fixed body.
		const icon = makeIcon();
		document.body.appendChild(icon);
		expect(() =>
			assertIconIsVisible(icon, 'proof-1899 context-visible', () => ({
				visibility: 'visible',
				display: 'inline-block',
				opacity: '1',
			})),
		).not.toThrow();
		expect(() =>
			assertIconIsVisible(icon, 'proof-1899 context-hidden', () => ({
				visibility: 'hidden',
				display: 'inline-block',
				opacity: '1',
			})),
		).toThrow('icon-hidden-visibility');
		icon.remove();
	});
});
