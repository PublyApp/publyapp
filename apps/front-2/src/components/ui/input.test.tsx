/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Input } from './input';

afterEach(cleanup);

describe('Input', () => {
	test('renders with input semantics and focus-visible focus ring token classes', () => {
		render(<Input type="text" />);

		const input = screen.getByRole('textbox');
		expect(input.getAttribute('data-slot')).toBe('input');
		expect(input.getAttribute('type')).toBe('text');
		expect(input.className).toContain('focus-visible:border-ring');
		expect(input.className).toContain('focus-visible:ring-3');
		expect(input.className).toContain('focus-visible:ring-ring');
		expect(input.className).not.toContain('focus-visible:ring-ring/');
	});
});
