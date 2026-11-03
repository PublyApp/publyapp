/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Segmented } from './segmented';

afterEach(cleanup);

describe('Segmented', () => {
	test('marks the current option pressed and reports a pick', () => {
		const onChange = vi.fn();
		render(
			<Segmented
				value="b"
				options={['a', 'b'] as const}
				label={(code) => code.toUpperCase()}
				ariaLabel="Vue"
				onChange={onChange}
			/>,
		);

		expect(
			screen.getByRole('button', { name: 'A' }).getAttribute('aria-pressed'),
		).toBe('false');
		expect(
			screen.getByRole('button', { name: 'B' }).getAttribute('aria-pressed'),
		).toBe('true');

		fireEvent.click(screen.getByRole('button', { name: 'A' }));
		expect(onChange).toHaveBeenCalledWith('a');
	});
});
