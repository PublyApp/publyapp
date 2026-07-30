import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countExactSelectorRules,
	countSearchInputCancelButtonRules,
	resolveEffectiveDeclarations,
} from '~/styles/css-cascade-test-support';

import { SearchInput } from './search-input';

const APP_CSS_PATH = join(import.meta.dirname, '../../styles/app.css');
const appCssSource = readFileSync(APP_CSS_PATH, 'utf8');
const SEARCH_CANCEL_SELECTOR =
	".publy-search-input[type='search']::-webkit-search-cancel-button";

describe('SearchInput', () => {
	afterEach(() => {
		cleanup();
	});

	test('reports typed values and empties, fires the change handler, and refocuses on clear', () => {
		const onValueChange = vi.fn();
		const { rerender } = render(
			<SearchInput
				value=""
				onValueChange={onValueChange}
				placeholder="Search…"
				aria-label="Search members"
				clearLabel="Clear members search"
			/>,
		);

		const input = screen.getByRole('searchbox', { name: 'Search members' });
		fireEvent.change(input, { target: { value: 'ada' } });
		expect(onValueChange).toHaveBeenLastCalledWith('ada');

		rerender(
			<SearchInput
				value="ada"
				onValueChange={onValueChange}
				placeholder="Search…"
				aria-label="Search members"
				clearLabel="Clear members search"
			/>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Clear members search' }),
		);
		expect(onValueChange).toHaveBeenLastCalledWith('');
		expect(document.activeElement).toBe(
			screen.getByRole('searchbox', { name: 'Search members' }),
		);
	});

	// Defect 1/4: exactly one clear button — this is the regression that
	// shipped (a custom clear button rendered alongside the browser's native
	// `::-webkit-search-cancel-button`, and DataTableToolbar rendered none).
	test('renders exactly one clear button with an accessible label when the field has text, and none when empty', () => {
		const { rerender } = render(
			<SearchInput
				value=""
				onValueChange={vi.fn()}
				aria-label="Search"
				clearLabel="Clear search"
			/>,
		);

		expect(
			screen.queryAllByRole('button', { name: 'Clear search' }),
		).toHaveLength(0);

		rerender(
			<SearchInput
				value="ada"
				onValueChange={vi.fn()}
				aria-label="Search"
				clearLabel="Clear search"
			/>,
		);

		expect(
			screen.getAllByRole('button', { name: 'Clear search' }),
		).toHaveLength(1);
	});

	// Defect 3: the glyph is the Tabler icon set, not a text "×" character —
	// a text multiplication sign cannot optically centre and doesn't match
	// the stroke weight of every other close affordance in the app.
	test('uses the IconX glyph, not a text multiplication-sign character', () => {
		render(
			<SearchInput
				value="ada"
				onValueChange={vi.fn()}
				aria-label="Search"
				clearLabel="Clear search"
			/>,
		);

		const clearButton = screen.getByRole('button', { name: 'Clear search' });
		expect(clearButton.textContent).toBe('');
		expect(clearButton.querySelector('svg.tabler-icon-x')).not.toBeNull();
	});

	// Defect 5: the caller's className must land on the outer control (which
	// the magnifier/clear button anchor to), never on the inner input — else
	// a caller's vertical margin desyncs the decorations from the field.
	test('applies the caller className to the outer wrapper, not the inner input', () => {
		render(
			<SearchInput
				value=""
				onValueChange={vi.fn()}
				aria-label="Search"
				className="mt-2"
			/>,
		);

		const input = screen.getByRole('searchbox', { name: 'Search' });
		expect(input.className).not.toContain('mt-2');
		const wrapper = input.closest('.publy-search-wrapper');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toContain('mt-2');
	});

	test('defaults to type=search (implicit searchbox role), not a text type swap', () => {
		render(
			<SearchInput value="" onValueChange={vi.fn()} aria-label="Search" />,
		);

		const input = screen.getByRole('searchbox', { name: 'Search' });
		expect(input.getAttribute('type')).toBe('search');
	});

	// Defect 1 (review follow-up): jsdom has no rendering engine, so it can
	// never observe whether `::-webkit-search-cancel-button` is actually
	// suppressed on screen — a prior version of this test only checked
	// `type="search"`, an attribute the stylesheet does not touch, so
	// deleting the suppression rule entirely left every test here green.
	// This asserts the two things that ARE assertable outside a browser:
	// (1) the suppression rule still exists in app.css with the properties
	// that remove the control from the accessibility tree/tab order rather
	// than merely hiding it, and (2) the rendered input actually carries the
	// exact class + type the rule's selector requires, so the two cannot
	// silently drift apart. It does not replace a real browser check across
	// Chromium/Firefox/WebKit — see the note below.
	//
	// IMPORTANT finding B (review round 2): the original version of this
	// test used `appCssSource.match(...)` — a non-global match, so it only
	// ever saw the FIRST rule for this exact selector. A later, equal-
	// specificity rule re-enabling the native control (`appearance: auto;
	// display: inline-block`) silently overrode the real effective
	// behaviour while this test stayed green (7/7). It is a real-browser
	// verification project cannot help here: a prior investigation
	// confirmed headless Chromium on Linux exposes no observable difference
	// (identical computed style, ARIA snapshot, and byte-identical
	// screenshots) between the rule present and absent — this source guard
	// is the only shipped check for the suppression, so it must model the
	// effective cascade rather than the first textual declaration. It now
	// goes through `resolveEffectiveDeclarations()`
	// (css-cascade-test-support.ts), which collects every top-level rule
	// that exactly matches the selector and resolves last-declaration-wins
	// per property. Round 4 added a separate fail-closed rule count because
	// this invariant cannot safely depend on a bounded cascade model.
	test("the native ::-webkit-search-cancel-button suppression rule exists and targets this component's actual rendered markup", () => {
		expect(countSearchInputCancelButtonRules(appCssSource)).toBe(1);
		expect(countExactSelectorRules(appCssSource, SEARCH_CANCEL_SELECTOR)).toBe(
			1,
		);

		const declarations = resolveEffectiveDeclarations(
			appCssSource,
			SEARCH_CANCEL_SELECTOR,
		);

		// `display: none` (not `visibility`/`opacity`) is what removes the
		// control from the accessibility tree and tab order entirely. Checked
		// as the EFFECTIVE value for each property (not "does some rule body
		// somewhere mention this") so a later override of only one of the two
		// properties is still caught.
		expect(Object.fromEntries(declarations)).toEqual({
			'-webkit-appearance': 'none',
			appearance: 'none',
			display: 'none',
		});

		render(
			<SearchInput value="" onValueChange={vi.fn()} aria-label="Search" />,
		);
		const input = screen.getByRole('searchbox', { name: 'Search' });
		// The rule's selector requires BOTH of these on the real element — if
		// either drifts (a class rename, dropping type="search"), the rule
		// silently stops applying while this assertion would catch it.
		expect(input.getAttribute('type')).toBe('search');
		expect(input.className.split(/\s+/)).toContain('publy-search-input');
	});

	// Cascade regression proof: reproduces the reviewer's exact mutation —
	// appending a LATER, equal-specificity rule for the same exact selector
	// that re-enables the native control. The original first-match
	// implementation stayed green (7/7) under this exact mutation against
	// the real app.css.
	test('a later duplicate rule for the exact same selector overriding display/appearance is caught (cascade regression proof)', () => {
		expect(countExactSelectorRules(appCssSource, SEARCH_CANCEL_SELECTOR)).toBe(
			1,
		);

		const mutatedCss = `${appCssSource}\n${SEARCH_CANCEL_SELECTOR} {\n\tappearance: auto;\n\tdisplay: inline-block;\n}\n`;

		expect(countExactSelectorRules(mutatedCss, SEARCH_CANCEL_SELECTOR)).toBe(2);

		const declarations = resolveEffectiveDeclarations(
			mutatedCss,
			SEARCH_CANCEL_SELECTOR,
		);
		// The later rule wins for the two properties it re-declares...
		expect(declarations.get('display')).toBe('inline-block');
		expect(declarations.get('appearance')).toBe('auto');
		// ...but does not touch `-webkit-appearance`, which the cascade must
		// still carry forward from the earlier rule.
		expect(declarations.get('-webkit-appearance')).toBe('none');
	});

	// Round 3 review: the resolver above still had three honestly documented
	// but trivially reachable blind spots — no specificity model, no
	// importance handling, no conditional-at-rule awareness — and this
	// selector has NO real-browser backstop at all (a prior investigation
	// confirmed headless AND headed Chromium/Linux give byte-identical
	// screenshots and ARIA snapshots whether the suppression rule is present
	// or absent), so this source guard is the only shipped check. The three
	// tests below reproduce the reviewer's exact mutations against
	// `css-cascade-test-support.ts`'s now specificity/importance/conditional-
	// aware resolver.

	// Specificity regression proof: a higher-specificity selector appending
	// another class to the target re-enables the control. Prepended (earlier
	// in source than the real rule) specifically to prove this is won on
	// SPECIFICITY, not source order — a same-specificity "later wins" model
	// would miss this if it appeared first.
	test('a higher-specificity compound selector re-enabling the control is caught regardless of source order (specificity regression proof)', () => {
		const higherSpecificitySelector =
			".publy-search-input.foo[type='search']::-webkit-search-cancel-button";
		const mutatedCss = `${higherSpecificitySelector} {\n\tappearance: auto;\n\tdisplay: inline-block;\n}\n${appCssSource}`;

		const declarations = resolveEffectiveDeclarations(
			mutatedCss,
			SEARCH_CANCEL_SELECTOR,
		);
		expect(declarations.get('display')).toBe('inline-block');
		expect(declarations.get('appearance')).toBe('auto');
		// Untouched by the higher-specificity rule — still carried forward.
		expect(declarations.get('-webkit-appearance')).toBe('none');
	});

	// Round 4 review: ancestor compounds contribute specificity in the real
	// cascade, but the bounded resolver intentionally scores only the final
	// compound. Search cancel suppression has no browser backstop, so this
	// invariant fails closed instead: any additional rule targeting the same
	// input pseudo-element is forbidden, regardless of specificity or source
	// order.
	test('an ancestor-qualified rule targeting the cancel pseudo-element is rejected (fail-closed regression proof)', () => {
		const reviewerOverride = `.publy-search-wrapper>.publy-search-input[type='search']::-webkit-search-cancel-button {
	-webkit-appearance: auto;
	appearance: auto;
	display: inline-block;
}
`;
		const mutatedCss = appCssSource.replace(
			`${SEARCH_CANCEL_SELECTOR} {`,
			`${reviewerOverride}\n${SEARCH_CANCEL_SELECTOR} {`,
		);

		expect(countSearchInputCancelButtonRules(mutatedCss)).toBe(2);
	});

	// Importance regression proof: an earlier important-flagged re-enabling
	// declaration must beat a LATER plain one for the same property, even
	// though the plain declaration is both later in source and equal
	// specificity — importance decides before source order does. The literal
	// CSS "important" flag below is real test data for the resolver's parser
	// (see the KNOWN_IMPORTANT_FOUNDATION_DEBT entry for this file in
	// check-design-system.mjs), not shipped styling.
	test('an earlier important-flagged declaration beats a later plain declaration for the same property (importance regression proof)', () => {
		const mutatedCss = `${SEARCH_CANCEL_SELECTOR} {\n\tdisplay: inline-block !important;\n}\n${appCssSource}`;

		const declarations = resolveEffectiveDeclarations(
			mutatedCss,
			SEARCH_CANCEL_SELECTOR,
		);
		expect(declarations.get('display')).toBe('inline-block');
		// Properties the important-flagged rule never mentions are untouched.
		expect(declarations.get('appearance')).toBe('none');
		expect(declarations.get('-webkit-appearance')).toBe('none');
	});

	// `@media` regression proof: reproduces the reviewer's exact mutation —
	// the sole rule for this selector wrapped in a non-matching `@media`
	// query. The old resolver treated a conditional rule as unconditional
	// (7/7 stayed green against the real file); the fixed resolver excludes
	// conditional matches entirely, so a selector whose ONLY rule is
	// conditional now has no unconditional match at all and fails loudly —
	// exactly the signal a silently-made-conditional suppression rule needs,
	// given there is no browser authority to catch it instead.
	test('a sole rule wrapped in a non-matching @media query is not resolved as unconditional (media regression proof)', () => {
		const decoyCss = `@media (max-width: 0px) {\n${SEARCH_CANCEL_SELECTOR} {\n\tdisplay: none;\n\tappearance: none;\n\t-webkit-appearance: none;\n}\n}\n`;

		expect(() =>
			resolveEffectiveDeclarations(decoyCss, SEARCH_CANCEL_SELECTOR),
		).toThrow();
	});

	// NOTE: the assertions above are a source-level supplement, not a
	// substitute for a real browser check. jsdom cannot render a
	// `::-webkit-search-cancel-button` pseudo-element at all, in any browser
	// engine, so no jsdom-based test — including this one — can prove the
	// control is actually invisible/non-operable on screen in Chromium,
	// Firefox, or WebKit. This repo has a Playwright config
	// (apps/front/playwright.config.ts), but it currently defines only a
	// `chromium` project (no firefox/webkit projects), and its baseURL
	// targets a live docker-compose stack. Round 2 AND round 3 investigations
	// confirmed this gap is not closeable even with that stack running, in
	// EITHER headless Chromium or headed Chromium under Xvfb on Linux: both
	// modes give byte-identical screenshots, identical ARIA snapshots, and
	// identical computed style whether the suppression rule is present or
	// entirely absent. Closing this for real needs either a real desktop
	// Chrome/Firefox/WebKit environment (well beyond this fix's scope) or
	// manual/visual QA — not something this suite can assert. See
	// `e2e/search-input-native-cancel-suppression.spec.ts` for the adjacent
	// real-browser coverage this repo DOES get (exactly one accessible,
	// working custom clear control).
	//
	// Round 4 closure: ancestor specificity remains outside the bounded
	// resolver, but the canonical-source assertion above now rejects every
	// additional parsed rule that mentions both `.publy-search-input` and
	// `::-webkit-search-cancel-button`. The reviewer’s ancestor-qualified
	// override therefore fails before cascade resolution can false-green.

	test('the table size variant carries the fixed-height data-table search class', () => {
		render(
			<SearchInput
				value=""
				onValueChange={vi.fn()}
				aria-label="Search"
				size="table"
			/>,
		);

		expect(
			screen.getByRole('searchbox', { name: 'Search' }).className,
		).toContain('publy-data-table-search-input');
	});
});
