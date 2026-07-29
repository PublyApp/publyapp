/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Input } from './input';

afterEach(cleanup);

describe('Input', () => {
	test('preserves input semantics and uses the shared form-control state matrix', () => {
		render(<Input type="text" />);

		const input = screen.getByRole('textbox');
		const classes = new Set(input.className.split(/\s+/));

		expect(input.getAttribute('data-slot')).toBe('input');
		expect(input.getAttribute('type')).toBe('text');
		for (const token of [
			'border',
			'border-border',
			'bg-input/50',
			'shadow-[var(--publy-shadow-input)]',
			'focus-visible:border-ring',
			'focus-visible:ring-3',
			'focus-visible:ring-ring/30',
			'aria-invalid:border-destructive',
			'aria-invalid:ring-3',
			'aria-invalid:ring-destructive/20',
			'dark:aria-invalid:border-destructive/50',
			'dark:aria-invalid:ring-destructive/40',
			'aria-invalid:focus-visible:border-destructive',
			'aria-invalid:focus-visible:ring-destructive/20',
			'dark:aria-invalid:focus-visible:border-destructive',
			'dark:aria-invalid:focus-visible:ring-destructive/40',
			'disabled:pointer-events-none',
			'disabled:cursor-not-allowed',
			'disabled:opacity-50',
		]) {
			expect(classes).toContain(token);
		}
		for (const token of [
			'bg-input/35',
			'focus-visible:ring-ring',
			'aria-invalid:ring-destructive/12',
			'rounded-3xl',
		]) {
			expect(classes).not.toContain(token);
		}
		for (const token of [
			'md:h-9',
			'h-11',
			'rounded-[var(--publy-radius-input)]',
			'px-3.5',
			'py-1',
			'text-base',
			'md:text-[13px]',
		]) {
			expect(classes).toContain(token);
		}
	});
});
