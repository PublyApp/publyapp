/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SEARCH_DELAY_MS, SearchField } from './search-field';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('SearchField', () => {
	test('debounces the search once typing rests', () => {
		const onSearch = vi.fn();
		render(<SearchField q="" onSearch={onSearch} placeholder="Rechercher" />);

		const input = screen.getByRole('searchbox');
		fireEvent.change(input, { target: { value: 'acme' } });
		expect(onSearch).not.toHaveBeenCalled();

		vi.advanceTimersByTime(SEARCH_DELAY_MS);
		expect(onSearch).toHaveBeenCalledWith('acme');
	});

	test('an external q replaces the text', () => {
		const { rerender } = render(
			<SearchField q="" onSearch={vi.fn()} placeholder="Rechercher" />,
		);
		rerender(
			<SearchField q="globex" onSearch={vi.fn()} placeholder="Rechercher" />,
		);
		expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
			'globex',
		);
	});

	test('clearing reports undefined', () => {
		const onSearch = vi.fn();
		render(
			<SearchField q="acme" onSearch={onSearch} placeholder="Rechercher" />,
		);
		fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
		vi.advanceTimersByTime(SEARCH_DELAY_MS);
		expect(onSearch).toHaveBeenCalledWith(undefined);
	});
});
