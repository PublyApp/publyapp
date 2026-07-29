/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('~/lib/flags', () => ({
	FEATURES: { dev: { fieldValidationDemoEnabled: true } },
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: 'en' },
	}),
}));

import { Route } from './field-validation';

afterEach(cleanup);

describe('field-validation route', () => {
	test('authors inert compiled-style probes for focus and invalid focus', () => {
		const Component = (
			Route as unknown as { component: () => ReturnType<typeof createElement> }
		).component;
		render(createElement(Component));

		const focusProbe = screen.getByTestId('outline-expected-focus');
		const invalidProbe = screen.getByTestId('outline-expected-invalid-focus');
		const focusClasses = new Set(focusProbe.className.split(/\s+/));
		const invalidClasses = new Set(invalidProbe.className.split(/\s+/));

		for (const probe of [focusProbe, invalidProbe]) {
			expect(probe.getAttribute('aria-hidden')).toBe('true');
			const classes = new Set(probe.className.split(/\s+/));
			for (const token of [
				'fixed',
				'pointer-events-none',
				'size-px',
				'opacity-0',
				'border',
				'bg-input/50',
				'shadow-[var(--publy-shadow-input)]',
				'ring-3',
			]) {
				expect(classes).toContain(token);
			}
		}

		expect(focusClasses).toContain('border-ring');
		expect(focusClasses).toContain('ring-ring/30');
		expect(invalidClasses).toContain('border-destructive');
		expect(invalidClasses).toContain('ring-destructive/20');
		expect(invalidClasses).toContain('dark:ring-destructive/40');
	});
});
