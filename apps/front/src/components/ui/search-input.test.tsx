/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SearchInput } from './search-input';

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

	test('defaults to type=search (implicit searchbox role) with the native cancel button suppressed via CSS, not a text type swap', () => {
		render(
			<SearchInput value="" onValueChange={vi.fn()} aria-label="Search" />,
		);

		const input = screen.getByRole('searchbox', { name: 'Search' });
		expect(input.getAttribute('type')).toBe('search');
	});

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
