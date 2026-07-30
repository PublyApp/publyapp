import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SearchInput } from './search-input';

const APP_CSS_PATH = join(import.meta.dirname, '../../styles/app.css');
const appCssSource = readFileSync(APP_CSS_PATH, 'utf8');

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
	test("the native ::-webkit-search-cancel-button suppression rule exists and targets this component's actual rendered markup", () => {
		const suppressionRuleMatch = appCssSource.match(
			/\.publy-search-input\[type=(['"])search\1\]::-webkit-search-cancel-button\s*\{([^}]*)\}/,
		);

		expect(suppressionRuleMatch).not.toBeNull();
		const ruleBody = suppressionRuleMatch?.[2] ?? '';
		// `display: none` (not `visibility`/`opacity`) is what removes the
		// control from the accessibility tree and tab order entirely.
		expect(ruleBody).toMatch(/display:\s*none/);
		expect(ruleBody).toMatch(/(-webkit-)?appearance:\s*none/);

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

	// NOTE: the assertions above are a source-level supplement, not a
	// substitute for a real browser check. jsdom cannot render a
	// `::-webkit-search-cancel-button` pseudo-element at all, in any browser
	// engine, so no jsdom-based test — including this one — can prove the
	// control is actually invisible/non-operable on screen in Chromium,
	// Firefox, or WebKit. This repo has a Playwright config
	// (apps/front/playwright.config.ts), but it currently defines only a
	// `chromium` project (no firefox/webkit projects), and its baseURL
	// targets a live docker-compose stack that was not available in this
	// session. Closing this gap for real needs: (a) firefox/webkit
	// Playwright projects added to that config, and (b) a spec that focuses
	// a SearchInput with a value, then asserts exactly one clear affordance
	// is visible via a screenshot/bounding-box or accessibility-tree check —
	// not just DOM attribute presence, since only a real engine renders the
	// native control at all.

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
