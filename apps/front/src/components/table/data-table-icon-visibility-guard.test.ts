/**
 * @vitest-environment jsdom
 *
 * MEASUREMENT-vs-ENUMERATION contract tests for the icon visibility guard
 * (issue #1799, PR #1842 round 4).
 *
 * The kept-red proof at `tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`
 * proves the ORIGINAL defect (a classList enumeration missing `opacity-0` and
 * `aria-hidden`), but a read-and-discard enumeration — a body that still reads
 * `classList` and merely *calls* `readComputed` without using its result — is
 * byte-for-byte indistinguishable from the fix in that proof's outcomes. These
 * tests close that gap: they build cases where the class list and the computed
 * style DIVERGE, so only a body that actually measures can answer correctly.
 *
 * - Case 1: the icon carries NONE of the enumerated classes (`invisible`,
 *   `hidden`, `opacity-0`) but the reader says `visibility:hidden`. A class
 *   enumeration answers "visible" (wrong — the test expects a throw, and the
 *   enumeration does not throw → RED). A measurement answers "hidden" (throw —
 *   GREEN).
 * - Case 2: the icon DOES carry `opacity-0` but the reader says `opacity:1`
 *   (the class is present; the stylesheet rule is not — e.g. the utility was
 *   purged, overridden, or the element is inside an inert shadow that never
 *   applied it). A class enumeration answers "hidden" (throws — RED against
 *   the expected no-throw). A measurement answers "visible" (no throw —
 *   GREEN).
 *
 * Both go red under any classList-based body, including the lethal
 * read-and-discard form. Executed against the actual mutation in round 4:
 * `pnpm exec vitest run --config vitest.config.ts
 * src/components/table/data-table-icon-visibility-guard.test.ts`
 * rendered 2/2 red, restored to the measurement body 2/2 green.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { assertIconIsVisible } from './data-table-icon-visibility-guard';
import type { ComputedStyleReader } from './data-table-icon-visibility-guard-reader';

// The guard imports the `i18next` singleton for its error messages. These
// tests only assert the throw contract, so a `t` that returns the key is the
// smallest honest stand-in — it keeps the message deterministic (the key) and
// lets the assertions pin WHICH mechanism the guard measured.
vi.mock('i18next', () => ({
	default: {
		t: (key: string): string => key,
	},
}));

const visibleReader: ComputedStyleReader = () => ({
	visibility: 'visible',
	display: 'inline-block',
	opacity: '1',
});

// #1899: these fixtures are ATTACHED. The contract under test is class list
// vs measured style; its assumed input is a healthy, connected icon whose
// computed style the injected reader represents. A detached node is now a
// verdict of its own (indeterminate — see
// `data-table-icon-visibility-guard-indeterminable.test.ts`), and leaving
// these fixtures detached would let the indeterminate gate answer before
// the measurement the contract is about.
const attachedIcons: HTMLElement[] = [];

const makeIcon = (): HTMLElement => {
	const icon = document.createElement('span');
	icon.setAttribute('data-icon', 'check');
	document.body.appendChild(icon);
	attachedIcons.push(icon);
	return icon;
};

describe('icon visibility guard measurement vs enumeration (#1799 r4)', () => {
	afterEach(() => {
		for (const icon of attachedIcons.splice(0)) {
			icon.remove();
		}
		vi.clearAllMocks();
	});

	test('computed visibility:hidden with NO enum class is caught — only a measurement sees it', () => {
		const icon = makeIcon();
		// The element carries none of `invisible` / `hidden` / `opacity-0`;
		// the reader (what a real browser would compute) says hidden. A
		// classList enumeration answers "visible" and does not throw — this
		// test goes RED under it. The measurement answers "hidden" and throws.
		expect(() =>
			assertIconIsVisible(icon, 'ctx', () => ({
				visibility: 'hidden',
				display: 'inline-block',
				opacity: '1',
			})),
		).toThrow('icon-hidden-visibility');
	});

	test('opacity-0 class with computed opacity:1 is NOT hidden — class list is not the measurement', () => {
		const icon = makeIcon();
		// The Tailwind utility class is present, but the computed style says
		// the icon is fully painted (the rule never applied). A classList
		// enumeration answers "hidden" and throws — this test goes RED under
		// it. The measurement answers "visible" and passes.
		icon.classList.add('opacity-0');
		expect(() =>
			assertIconIsVisible(icon, 'ctx-opacity-class-visible', visibleReader),
		).not.toThrow();
	});

	test('baseline sanity: a class-named reader result still drives the measurement', () => {
		// Guards the reader contract itself: the guard must consume the
		// reader's values, so a style change (here via the reader) flips the
		// verdict in both directions.
		const icon = makeIcon();
		const hiddenReader: ComputedStyleReader = () => ({
			visibility: 'visible',
			display: 'inline-block',
			opacity: '0',
		});
		expect(() =>
			assertIconIsVisible(icon, 'ctx-opacity-reader', hiddenReader),
		).toThrow('icon-hidden-opacity');
		expect(() =>
			assertIconIsVisible(icon, 'ctx-opacity-reader', visibleReader),
		).not.toThrow();
	});
});
