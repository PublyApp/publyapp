/**
 * `assertIconIsVisible` — fails the test if the icon element inside a checkbox
 * (or any other surface that has a `data-icon` child) is visually hidden from
 * the user. Used by the row-selection integration test
 * (`data-table-selection-integration.test.tsx`) to guarantee the check state
 * the test asserts (checked / indeterminate) is actually painted, not just
 * declared on the DOM.
 *
 * # Background
 *
 * `data-icon` alone only proves an icon is *declared*, never that it is
 * *visible*. A mutation that hides the icon while keeping the attribute
 * present and readable would keep a `data-icon` test green while the user
 * sees an empty box. The function below is the guard against that family of
 * regressions.
 *
 * # Status
 *
 * This module currently hosts the ORIGINAL guard — a class-name enumeration
 * over `invisible` and `hidden` — so the kept-red proof at
 * `apps/front/tests/proofs/1799/` is genuinely RED against it
 * (`opacity-0` and `aria-hidden` slip through). The fix in the next commit
 * replaces the body with a real measurement; the public API
 * (`assertIconIsVisible(icon, context)`) and the failure-mode contract
 * (throw with a named reason when hidden) stay the same so the kept-red
 * proof is the only file that has to change between the red and green runs.
 */
import type { ComputedStyleReader } from './data-table-icon-visibility-guard-reader';

/**
 * The original buggy class-name enumeration. Catches `invisible`
 * (Tailwind → `visibility:hidden`) and `hidden` (Tailwind → `display:none`)
 * — and only those two. Misses `opacity-0` (Tailwind → `opacity:0`,
 * invisible but not display:none), `aria-hidden="true"` (a DOM attribute
 * with no CSS counterpart), `clip-path-*`, off-screen `translate-*`, etc.
 *
 * Kept verbatim from the PR #1796 implementation so the kept-red proof
 * reproduces the original defect on the current code.
 */
const isIconHidden = (iconElement: Element): boolean => {
	const classes = Array.from(iconElement.classList);
	return classes.includes('invisible') || classes.includes('hidden');
};

/**
 * Throws an `Error` whose message names the hiding reason. `vitest` reports
 * the message verbatim, so a test failure points at the exact mechanism
 * instead of a generic "icon is hidden".
 *
 * The two cases the original guard covered are the two this throws for.
 * Any other hiding mechanism (opacity-0, aria-hidden, clip-path, …) is
 * silently accepted — the original defect.
 */
export const assertIconIsVisible = (
	iconElement: Element | null,
	context: string,
	// Accepted for API stability with the fix that will replace this body.
	// The current enumeration ignores it; the fixed body will read it.
	_readComputed?: ComputedStyleReader,
): void => {
	if (iconElement === null) {
		throw new Error(`${context}: icon element is null`);
	}
	if (isIconHidden(iconElement)) {
		const classes = Array.from(iconElement.classList);
		const reason = classes.includes('invisible')
			? 'invisible'
			: 'hidden';
		throw new Error(`${context}: icon carries Tailwind "${reason}"`);
	}
};
