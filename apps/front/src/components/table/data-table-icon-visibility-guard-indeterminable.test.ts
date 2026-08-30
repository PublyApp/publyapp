/**
 * @vitest-environment jsdom
 *
 * #1899 — the third case of the icon visibility guard: INDETERMINABLE.
 *
 * The measurement fix (#1842) replaced the classList enumeration with a read
 * of the computed style. But when the guard CANNOT analyze the style — a node
 * detached from the document, a value the reader did not resolve — the body
 * falls through to `return null`, i.e. "visible". A guard that answers "all
 * fine" when it cannot see is worse than no guard at all, because the suite
 * trusts it. House rule (this issue): an unanalyzable input must produce a
 * LOUD failure naming the cause (node not connected, style not resolved) and
 * the expected action — never a plausible default.
 *
 * This file is the GREEN side of the paired proof. The RED side is the kept-red
 * file at `tests/proofs/1899/red-1899-icon-visibility-indeterminable.test.ts`,
 * which asserts the DEFECT is present (`assertIconIsVisible` SILENTLY passes
 * on a detached node with the default reader); against the fixed code it fails
 * by construction and is replayed with inverted semantics by the `Verify
 * paired red proofs` CI step.
 *
 * MEASURED, not reasoned (the issue forbids building on the file's comment
 * claims — jsdom 30.0.1 in this suite was probed directly):
 *
 * - `window.getComputedStyle` in jsdom returns RESOLVED defaults for a
 *   detached node with no inline style:
 *   `visibility:"visible"`, `display:"inline"`, `opacity:"1"` — identical to
 *   a connected node, and never `''`.
 * - It does read inline styles on a detached node
 *   (`el.style.visibility = 'hidden'` → computed `visibility:"hidden"`).
 *
 * Two consequences for this test's design:
 *
 * 1. The DEFAULT-reader lane cannot prove the detached-node case: jsdom
 *    resolves a plausible visible default, so `getConnected` (the real
 *    connection check) is the only connection signal, and the engine probe
 *    below PINS that jsdom's detached reading resolves to a healthy visible
 *    value. If jsdom ever started returning unresolved `''` for detached
 *    nodes, the probe itself goes red: the lane would have changed the
 *    meaning of the unresolvable check, and this file must be re-argued —
 *    silently keeping it would let the jsdom lane keep claiming coverage it
 *    does not have.
 * 2. The load-bearing lane for the detached-node case is the BROWSER one
 *    (`e2e/data-table-icon-visibility-guard.spec.ts`, a real detached node +
 *    the real guard bundle + Chromium): Chromium's `getComputedStyle` returns
 *    the UNRESOLVED `''`/`auto` for a detached node, so the real reader
 *    really cannot see — the only lane where the fix is exercised on the
 *    real engine's own unanalyzable output.
 *
 * Executed against the pre-fix guard: 3/3 RED
 * (`pnpm exec vitest run --config vitest.config.ts
 * src/components/table/data-table-icon-visibility-guard-indeterminable.test.ts`).
 * Restored to the three-case body: 3/3 GREEN.
 */
import { describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { assertIconIsVisible } from './data-table-icon-visibility-guard';
import type { ComputedStyleReader } from './data-table-icon-visibility-guard-reader';

// The guard imports the `i18next` singleton for its error messages. The
// indeterminate cases must fail LOUD with a message that NAMES the cause and
// the expected action — the issue's own acceptance criterion — so this mock
// maps the guard's keys to their real `en` texts (same pattern as the
// TestLabelMap in `tests/proofs/1799/`). The other hidden-mechanism keys map
// to the bare key: their wording is not under test here.
vi.mock('i18next', () => ({
	default: {
		t: (key: string, options?: Record<string, unknown>): string => {
			const labels: TestLabelMap = {
				'icon-guard-indeterminate-detached':
					'{{context}}: icon element is not connected to the document, so its visibility cannot be measured. Expected action: attach the element to the document (render it in a live container) and re-run the guard.',
				'icon-guard-indeterminate-unresolved':
					"{{context}}: computed style value is unresolved (empty), so the icon's visibility cannot be measured. Expected action: make sure the element's computed style can be read (connected node, resolved stylesheet), then re-run the guard.",
			};
			let text = labels[key] ?? key;
			if (!options) {
				return text;
			}
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
	},
}));

const visibleReader: ComputedStyleReader = () => ({
	visibility: 'visible',
	display: 'inline-block',
	opacity: '1',
});

const captureThrown = (
	icon: HTMLElement,
	context: string,
	reader?: ComputedStyleReader,
): string => {
	try {
		assertIconIsVisible(icon, context, reader);
		return '';
	} catch (error) {
		if (error instanceof Error) {
			return error.message;
		}
		return '';
	}
};

describe('icon visibility guard — indeterminable input (#1899)', () => {
	test('default reader on a DETACHED node fails loudly, naming the cause', () => {
		// The exact input the issue describes: a node built in isolation,
		// never attached to the document. The guard's own default reader
		// (window.getComputedStyle) cannot be trusted here: jsdom resolves a
		// healthy visible default for detached nodes (see file header), so
		// the connection check itself must be the trigger.
		const icon = document.createElement('span');
		icon.setAttribute('data-icon', 'check');
		expect(() =>
			assertIconIsVisible(icon, 'ctx-detached-default', undefined),
		).toThrow(/not connected to the document/);
		// The message must name the cause (node not connected) AND the
		// expected action — a bare "unanalyzable" is not loud enough. The
		// full thrown text is captured and checked as one unit so neither
		// half can quietly disappear.
		const thrown = captureThrown(icon, 'ctx-detached-default', undefined);
		expect(thrown).toContain('not connected to the document');
		expect(thrown).toContain(
			'Expected action: attach the element to the document',
		);
	});

	test('a reader that returns UNRESOLVED values fails loudly, naming the cause', () => {
		// Chromium's `getComputedStyle` on a detached node (and a real engine
		// failing to resolve a value) returns the UNRESOLVED empty string.
		// The jsdom default reader never does (see header), so this case
		// injects the reader shape a real engine produces — the value the
		// guard must refuse to treat as a measurement. The node is
		// CONNECTED here on purpose: the connection gate must pass first,
		// so this case isolates the value gate and not the connection gate.
		const icon = document.createElement('span');
		icon.setAttribute('data-icon', 'check');
		icon.setAttribute('aria-hidden', 'false');
		document.body.appendChild(icon);
		expect(() =>
			assertIconIsVisible(icon, 'ctx-unresolved', () => ({
				visibility: '',
				display: '',
				opacity: '',
			})),
		).toThrow(/unresolved \(empty\)/);
		icon.remove();
	});

	test('NO false positive: healthy connected visible / hidden verdicts are unchanged', () => {
		// The other half of the paired exchange demanded by the issue: the
		// fix must not turn the silent defect into a loud false positive on
		// perfectly healthy elements. Every connected, resolvable input
		// keeps its current verdict, executed against the real jsdom engine:
		const connected = document.createElement('span');
		connected.setAttribute('data-icon', 'check');
		document.body.appendChild(connected);

		// 1. The real default reader on a connected node: jsdom resolves a
		//    healthy visible style → VISIBLE. (Before the fix this was green
		//    for the wrong reason — indistinguishable from the defect. After
		//    the fix it is green because the reading IS a measurement.)
		expect(() =>
			assertIconIsVisible(connected, 'ctx-connected-visible'),
		).not.toThrow();

		// 2. Hidden via the real engine's inline style, measured by the real
		//    default reader: still HIDDEN, same named mechanism as before
		//    the fix (css-visibility).
		connected.style.visibility = 'hidden';
		expect(() =>
			assertIconIsVisible(connected, 'ctx-connected-hidden'),
		).toThrow('icon-hidden-visibility');
		connected.style.visibility = '';

		// 3. Hidden by an injected reader (display:none): unchanged reason.
		expect(() =>
			assertIconIsVisible(connected, 'ctx-connected-display-none', () => ({
				visibility: 'visible',
				display: 'none',
				opacity: '1',
			})),
		).toThrow('icon-hidden-display');

		// 4. Visible by an injected reader: unchanged verdict.
		expect(() =>
			assertIconIsVisible(
				connected,
				'ctx-connected-visible-reader',
				visibleReader,
			),
		).not.toThrow();

		// 5. The null-element case keeps its own loud failure — it already
		//    existed and must not be swallowed into the new cases.
		expect(() => assertIconIsVisible(null, 'ctx-null')).toThrow(
			'icon-guard-context-null',
		);
	});
});
