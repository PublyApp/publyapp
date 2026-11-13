/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Textarea } from './textarea';

afterEach(cleanup);

const textClasses = () => screen.getByRole('textbox').className.split(/\s+/);

describe('Textarea', () => {
	test('preserves textarea semantics and uses the shared form-control state matrix', () => {
		render(<Textarea />);

		const textarea = screen.getByRole('textbox');
		const classes = new Set(textarea.className.split(/\s+/));

		expect(textarea.tagName).toBe('TEXTAREA');
		expect(textarea.getAttribute('data-slot')).toBe('textarea');
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
			'min-h-20',
			'resize-y',
			'rounded-[var(--publy-radius-input)]',
			'px-3.5',
			'py-2',
			'text-base',
			'md:text-[13px]',
		]) {
			expect(classes).toContain(token);
		}
	});

	test('read-only looks locked on an enabled control, without dimming its text', () => {
		render(<Textarea readOnly />);

		const classes = textClasses();
		expect(classes).toContain('read-only:enabled:bg-(--publy-surface-muted)');
		expect(classes).toContain('read-only:enabled:text-muted-foreground');
		expect(classes).toContain('read-only:enabled:cursor-not-allowed');
		expect(classes.some((token) => token.startsWith('read-only:opacity'))).toBe(
			false,
		);
	});

	test('disabled keeps its own look and is not muted twice by the read-only one', () => {
		render(<Textarea disabled />);

		const classes = textClasses();
		expect(classes).toContain('disabled:opacity-50');
		// A disabled control also matches :read-only, so every read-only style is
		// scoped to enabled controls: nothing bare applies to it.
		const readOnlyTokens = classes.filter((token) =>
			token.startsWith('read-only:'),
		);
		expect(readOnlyTokens.length).toBeGreaterThan(0);
		for (const token of readOnlyTokens) {
			expect(token.startsWith('read-only:enabled:')).toBe(true);
		}
	});
});
