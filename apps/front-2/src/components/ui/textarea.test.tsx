/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Textarea } from './textarea';

afterEach(cleanup);

describe('Textarea', () => {
	test('renders with textarea semantics and focus-visible focus ring token classes', () => {
		render(<Textarea />);

		const textarea = screen.getByRole('textbox');
		expect(textarea.tagName).toBe('TEXTAREA');
		expect(textarea.getAttribute('data-slot')).toBe('textarea');
		expect(textarea.className).toContain('focus-visible:border-ring');
		expect(textarea.className).toContain('focus-visible:ring-3');
		expect(textarea.className).toContain('focus-visible:ring-ring');
		expect(textarea.className).not.toMatch(/focus-visible:ring-[^\s]*\//);
	});
});
