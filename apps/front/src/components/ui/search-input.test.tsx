import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countExactSelectorRules,
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
	// per property — see that module for its documented, honest limits (no
	// specificity, no important-flagged declarations, no `@media`).
	test("the native ::-webkit-search-cancel-button suppression rule exists and targets this component's actual rendered markup", () => {
		const declarations = resolveEffectiveDeclarations(
			appCssSource,
			SEARCH_CANCEL_SELECTOR,
		);

		// `display: none` (not `visibility`/`opacity`) is what removes the
		// control from the accessibility tree and tab order entirely. Checked
		// as the EFFECTIVE value for each property (not "does some rule body
		// somewhere mention this") so a later override of only one of the two
		// properties is still caught.
		expect(declarations.get('display')).toBe('none');
		expect(declarations.get('appearance')).toBe('none');
		// `-webkit-appearance` is checked separately: it is a distinct
		// property from unprefixed `appearance` in the cascade, and the
		// original rule sets both.
		expect(declarations.get('-webkit-appearance')).toBe('none');

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

	// NOTE: the assertions above are a source-level supplement, not a
	// substitute for a real browser check. jsdom cannot render a
	// `::-webkit-search-cancel-button` pseudo-element at all, in any browser
	// engine, so no jsdom-based test — including this one — can prove the
	// control is actually invisible/non-operable on screen in Chromium,
	// Firefox, or WebKit. This repo has a Playwright config
	// (apps/front/playwright.config.ts), but it currently defines only a
	// `chromium` project (no firefox/webkit projects), and its baseURL
	// targets a live docker-compose stack. A prior investigation confirmed
	// this gap is not closeable even with that stack running: headless
	// Chromium on Linux exposes byte-identical screenshots, identical ARIA
	// snapshots, and identical computed style whether the suppression rule
	// is present or entirely absent. Closing this for real needs either a
	// non-headless run with a virtual framebuffer (a repo-wide
	// `playwright.config.ts` change, well beyond this fix's scope) or
	// manual/visual QA across real desktop Chrome, Firefox, and WebKit —
	// not something this suite can assert. See
	// `e2e/search-input-native-cancel-suppression.spec.ts` for the adjacent
	// real-browser coverage this repo DOES get (exactly one accessible,
	// working custom clear control).

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
