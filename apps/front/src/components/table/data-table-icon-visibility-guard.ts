/**
 * `assertIconIsVisible` — fails the test if the icon element inside a checkbox
 * (or any other surface that has a `data-icon` child) is visually hidden from
 * the user. Used by the row-selection integration test
 * (`data-table-selection-integration.test.tsx`) and the real-browser
 * `e2e/data-table-icon-visibility-guard.spec.ts` to guarantee the
 * check state the test asserts (checked / indeterminate) is actually
 * painted, not just declared on the DOM.
 *
 * # Why a measurement, not a class enumeration
 *
 * An earlier version of this function checked for two specific Tailwind
 * utilities: `invisible` (→ `visibility:hidden`) and `hidden` (→
 * `display:none`). That is a class enumeration, and a class enumeration is,
 * by construction, never exhaustive. It did not catch `opacity-0`
 * (opacity:0 — the icon is painted but transparent), `aria-hidden="true"`
 * on the icon itself (a screen-reader-only hide that does not change CSS at
 * all), `clip-path-*`, `size-0`, or off-screen `translate-*` translations.
 * Each new entry would re-introduce the same design defect: the guard
 * asserted a list of strings, not the property it claims to assert.
 *
 * # The fix: MEASURE, not enumerate
 *
 * The body reads the icon's actual visibility from the user's perspective,
 * never from a list of class names. Four real measurements cover the four
 * mechanisms the brief at #1799 names:
 *
 * 1. `aria-hidden="true"` is a DOM attribute, not a CSS value. Direct read.
 * 2. `visibility:hidden` is the computed value Tailwind's `invisible`
 *    compiles to. Read via `getComputedStyle` (or an injected reader).
 * 3. `display:none` is the computed value Tailwind's `hidden` compiles to.
 *    Same reader.
 * 4. `opacity:0` is the computed value Tailwind's `opacity-0` compiles to.
 *    Same reader. This is the one the old enumeration missed.
 *
 * # The third case: INDETERMINABLE (#1899)
 *
 * #1842 measured — but the body had only two exits. When it could NOT
 * analyze the style (node detached from the document, or the reader returned
 * a value it had not resolved) it fell through to `null`, i.e. "visible". A
 * guard that answers "all fine" when it cannot see is worse than no guard at
 * all: the suite trusts a green verdict it never earned. House rule: an
 * unanalyzable input produces a LOUD failure naming the cause and the
 * expected action — never a plausible default. The body now distinguishes
 * three cases:
 *
 * 1. visible — every value resolved, nothing hides the icon.
 * 2. not visible — a named mechanism (`aria-hidden`, `visibility:hidden`,
 *    `display:none`, `opacity:0`) hides it.
 * 3. indeterminate — the measurement itself is not one:
 *    - the node is not connected to the document (an engine reading of a
 *      detached node is not a measurement of what a user sees — in a real
 *      browser `getComputedStyle` returns the unresolved `''`/`auto` for it),
 *      or
 *    - the reader returned a value it did not resolve (the engine's
 *      unresolvable marker: the empty string for these three properties).
 *    Both fail naming the cause AND the expected action.
 *
 * The `aria-hidden` attribute is a DOM read, not an engine measurement: it
 * is answerable even on a detached node, so it is checked BEFORE the
 * indeterminate gate. A node cannot be "indeterminate" about an attribute
 * that is plainly set on it.
 *
 * # The reader parameter
 *
 * The real measurement comes from `window.getComputedStyle`, but the helper
 * takes a `ComputedStyleReader` for two reasons:
 *
 *  - jsdom does not parse the Tailwind stylesheet: a unit test that applies
 *    the `invisible` utility class cannot expect jsdom to compute
 *    `visibility:hidden` for it. The tests under `tests/proofs/` and
 *    `src/.../data-table-icon-visibility-guard*.test.ts` therefore inject a
 *    reader that returns the values a real browser would compute for the
 *    class the test just applied, so the helper's measurement is exercised
 *    without a browser round-trip.
 *  - The real-browser spec under
 *    `e2e/data-table-icon-visibility-guard.spec.ts` bundles this module
 *    verbatim (esbuild, once per worker) and calls it in the page, so the
 *    default reader resolves to Chromium's own `getComputedStyle` — the
 *    guard sees the exact same values a user does, INCLUDING the
 *    unresolvable `''` Chromium returns for a detached node: the only lane
 *    that can prove the indeterminate gate on the real engine's own output.
 *
 * # What jsdom actually returns (measured, #1899)
 *
 * The pre-#1899 comment in this file claimed jsdom "returns `''` for every
 * `getComputedStyle` property". That is empirically false, and the fix is
 * built on the measurement instead (jsdom 30.0.1, this suite's version):
 *
 * - connected node, no style        → `visibility:"visible"`, `display:"inline"`, `opacity:"1"`
 * - connected node, inline hide     → `visibility:"hidden"`, `display:"inline"`, `opacity:"0"`
 * - DETACHED node, no style         → `visibility:"visible"`, `display:"inline"`, `opacity:"1"` (resolved defaults, identical to connected)
 * - DETACHED node, inline hide      → `visibility:"hidden"` (inline styles ARE read)
 *
 * jsdom never returns `''` for these properties. Two consequences:
 *
 * 1. In the jsdom lane, the connection check (`node.isConnected`) is the
 *    signal for a detached node — the default reader cannot see it, because
 *    jsdom's detached reading is a plausible visible default, which is
 *    exactly why the pre-#1899 body answered "visible" there.
 * 2. The unresolved-value case is exercised in jsdom by injecting the reader
 *    shape a real engine returns (`''`), and in the real-browser lane by the
 *    engine itself (detached node → Chromium's `''`/`auto`), which is the
 *    lane that can truly prove the gate (jsdom's CSS-side controls are
 *    structurally inert there — it does not resolve Tailwind utilities — so
 *    that lane only ever applied `aria-hidden` and the null case; the
 *    browser lane is where the real coverage lives, and it stays the home
 *    of the indeterminate case).
 */
import i18n from 'i18next';

import type { ComputedStyleReader } from './data-table-icon-visibility-guard-reader';

/**
 * The reason an icon is hidden or indeterminate. `message` is the same one
 * the thrown `Error` from `assertIconIsVisible` uses. Internal to this
 * module: `assertIconIsVisible` is the only public entry point.
 */
type IconHiddenReason =
	| { kind: 'aria-hidden'; message: string }
	| { kind: 'css-visibility'; value: string; message: string }
	| { kind: 'css-display'; value: string; message: string }
	| { kind: 'css-opacity'; value: number; message: string }
	| { kind: 'indeterminate-detached'; message: string }
	| { kind: 'indeterminate-unresolved'; message: string };

/**
 * A computed property value the engine did NOT resolve. For these three
 * properties a resolved value is always a non-empty string (`visible` /
 * `hidden` / `collapse`, any `display` keyword, a numeric opacity); the
 * engine's marker for "I could not compute this" is the empty string.
 */
const isUnresolved = (value: string): boolean => value === '';

const defaultReader: ComputedStyleReader = (element) => {
	const computed = window.getComputedStyle(element);
	return {
		visibility: computed.visibility,
		display: computed.display,
		opacity: computed.opacity,
	};
};

/**
 * Is the node connected to a document? A reading of a detached node is not
 * a measurement of what a user sees: in a real browser the engine returns
 * the unresolved value for it, and in jsdom it returns a plausible visible
 * default — either way the engine cannot answer the question the guard is
 * supposed to answer.
 */
const isConnected = (element: Element): boolean => element.isConnected;

/**
 * Inspects the icon element and returns the reason it is hidden or
 * indeterminate, or `null` if it is visible. Pure: does not throw. The
 * caller decides whether a hidden/indeterminate reason is a test failure.
 *
 * @param iconElement The `data-icon` element to inspect.
 * @param context A short label identifying the icon (used in error
 * messages).
 * @param readComputed Optional injected computed-style reader. Defaults to
 * `window.getComputedStyle`. Tests inject a fake reader; the real-browser
 * spec runs the module in the page, so its default reader is Chromium's own.
 */
const detectIconHidden = (
	iconElement: Element,
	context: string,
	readComputed: ComputedStyleReader = defaultReader,
): IconHiddenReason | null => {
	// 1. aria-hidden: a DOM attribute, not an engine measurement. Answerable
	// even on a detached node, so it is decided BEFORE the indeterminate
	// gate — a node is not "indeterminate" about an attribute plainly set
	// on it.
	if (iconElement.getAttribute('aria-hidden') === 'true') {
		return {
			kind: 'aria-hidden',
			message: i18n.t('icon-hidden-aria', { context }),
		};
	}

	// 2. The measurement itself must be a measurement. A node not connected
	// to the document cannot have its visibility measured the way a user
	// sees it — the engine's reading of it is not an answer (unresolved in a
	// real browser, a plausible visible default in jsdom). Fail loud, naming
	// the cause and the expected action.
	if (!isConnected(iconElement)) {
		return {
			kind: 'indeterminate-detached',
			message: i18n.t('icon-guard-indeterminate-detached', { context }),
		};
	}

	// 3-5. CSS-side measurement. The real values come from the reader;
	// this body never inspects `classList`, so a mutation that hides the
	// icon without touching the class list (an inline style, a global
	// stylesheet, a runtime stylesheet swap) is caught exactly the same
	// way as a Tailwind utility class.
	const computed = readComputed(iconElement);

	// 6. A value the engine did not resolve is not a measurement. Treating
	// it as "nothing hides the icon" is the defect this issue removes:
	// a guard that cannot read must fail, naming the cause and the
	// expected action.
	if (
		isUnresolved(computed.visibility) ||
		isUnresolved(computed.display) ||
		isUnresolved(computed.opacity)
	) {
		return {
			kind: 'indeterminate-unresolved',
			message: i18n.t('icon-guard-indeterminate-unresolved', { context }),
		};
	}

	if (computed.visibility === 'hidden') {
		return {
			kind: 'css-visibility',
			value: computed.visibility,
			message: i18n.t('icon-hidden-visibility', { context }),
		};
	}
	if (computed.display === 'none') {
		return {
			kind: 'css-display',
			value: computed.display,
			message: i18n.t('icon-hidden-display', { context }),
		};
	}
	const parsedOpacity = Number.parseFloat(computed.opacity);
	if (Number.isFinite(parsedOpacity) && parsedOpacity === 0) {
		return {
			kind: 'css-opacity',
			value: parsedOpacity,
			message: i18n.t('icon-hidden-opacity', { context }),
		};
	}

	return null;
};

/**
 * Asserts that the icon element is NOT hidden by any of the four
 * mechanisms the brief names (`aria-hidden="true"`, `visibility:hidden`,
 * `display:none`, `opacity:0`), and that the measurement itself was a
 * measurement (connected node, resolved values). Fails the current test
 * with a named reason when the icon is hidden, and with a named cause plus
 * the expected action when the guard cannot analyze the input at all.
 *
 * Throws an `Error` whose message names the hiding reason — `vitest`
 * reports the message verbatim, so a test failure points at the exact
 * mechanism instead of a generic "icon is hidden".
 */
export const assertIconIsVisible = (
	iconElement: Element | null,
	context: string,
	readComputed?: ComputedStyleReader,
): void => {
	if (iconElement === null) {
		throw new Error(i18n.t('icon-guard-context-null', { context }));
	}
	const reason = detectIconHidden(iconElement, context, readComputed);
	if (reason !== null) {
		throw new Error(reason.message);
	}
};
