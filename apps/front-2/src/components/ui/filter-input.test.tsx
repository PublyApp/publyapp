/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { FilterInput } from './filter-input';

describe('FilterInput', () => {
	afterEach(() => {
		cleanup();
	});

	test('reports typed values and clears a non-empty filter', () => {
		const onValueChange = vi.fn();
		const { rerender } = render(
			<FilterInput
				value=""
				onValueChange={onValueChange}
				placeholder="Filter permissions…"
				aria-label="Filter permissions"
				clearLabel="Clear permission filter"
			/>,
		);

		expect(
			screen.queryByRole('button', { name: 'Clear permission filter' }),
		).toBeNull();
		fireEvent.change(
			screen.getByRole('searchbox', { name: 'Filter permissions' }),
			{
				target: { value: 'posts' },
			},
		);
		expect(onValueChange).toHaveBeenLastCalledWith('posts');

		rerender(
			<FilterInput
				value="posts"
				onValueChange={onValueChange}
				placeholder="Filter permissions…"
				aria-label="Filter permissions"
				clearLabel="Clear permission filter"
			/>,
		);
		fireEvent.click(
			screen.getByRole('button', { name: 'Clear permission filter' }),
		);
		expect(onValueChange).toHaveBeenLastCalledWith('');
	});
});
