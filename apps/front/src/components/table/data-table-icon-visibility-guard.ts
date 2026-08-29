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
 * The fixed body reads the icon's actual visibility from the user's
 * perspective, never from a list of class names. Four real measurements
 * cover the four mechanisms the brief at #1799 names:
 *
 * 1. `aria-hidden="true"` is a DOM attribute, not a CSS value. Direct read.
 * 2. `visibility:hidden` is the computed value Tailwind's `invisible`
 *    compiles to. Read via `getComputedStyle` (or an injected reader).
 * 3. `display:none` is the computed value Tailwind's `hidden` compiles to.
 *    Same reader.
 * 4. `opacity:0` is the computed value Tailwind's `opacity-0` compiles to.
 *    Same reader. This is the one the old enumeration missed.
 *
 * # The reader parameter
 *
 * The real measurement comes from `window.getComputedStyle`, but the
 * helper takes a `ComputedStyleReader` for two reasons:
 *
 *  - jsdom returns `''` for every `getComputedStyle` property when the
 *    class is a Tailwind utility (jsdom does not parse the stylesheet).
 *    The unit tests under `tests/proofs/1799/` inject a reader that
 *    returns the values a real browser would compute for the class the
 *    test just applied, so the helper's measurement is exercised
 *    end-to-end without a browser round-trip.
 *  - The real-browser spec under
 *    `e2e/data-table-icon-visibility-guard.spec.ts` bundles this module
 *    verbatim (esbuild, once per worker) and calls it in the page, so the
 *    default reader resolves to Chromium's own `getComputedStyle` — the
 *    guard sees the exact same values a user does.
 */
import i18n from 'i18next';

import type { ComputedStyleReader } from './data-table-icon-visibility-guard-reader';

/**
 * The reason an icon was declared hidden. The message is the same one the
 * thrown `Error` from `assertIconIsVisible` uses. Internal to this module:
 * `assertIconIsVisible` is the only public entry point.
 */
type IconHiddenReason =
	| { kind: 'aria-hidden'; message: string }
	| { kind: 'css-visibility'; value: string; message: string }
	| { kind: 'css-display'; value: string; message: string }
	| { kind: 'css-opacity'; value: number; message: string };

const defaultReader: ComputedStyleReader = (element) => {
	const computed = window.getComputedStyle(element);
	return {
		visibility: computed.visibility,
		display: computed.display,
		opacity: computed.opacity,
	};
};

/**
 * Inspects the icon element and returns the reason it is hidden, or `null`
 * if it is visible. Pure: does not throw. The caller decides whether a
 * hidden reason is a test failure.
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
	// 1. aria-hidden: a DOM attribute, not a CSS value. Direct read.
	if (iconElement.getAttribute('aria-hidden') === 'true') {
		return {
			kind: 'aria-hidden',
			message: i18n.t('icon-hidden-aria', { context }),
		};
	}

	// 2-4. CSS-side measurement. The real values come from the reader;
	// this body never inspects `classList`, so a mutation that hides the
	// icon without touching the class list (an inline style, a global
	// stylesheet, a runtime stylesheet swap) is caught exactly the same
	// way as a Tailwind utility class.
	const computed = readComputed(iconElement);
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
 * `display:none`, `opacity:0`). Fails the current test with a named
 * reason when the icon is hidden.
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
