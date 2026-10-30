/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { useUiStore } from '~/lib/store/ui-store';

import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
	beforeEach(() => {
		window.localStorage.clear();
		useUiStore.setState({ colorScheme: 'light' });
		document.documentElement.classList.remove('dark', 'light');
	});

	afterEach(() => {
		cleanup();
		document.documentElement.classList.remove('dark', 'light');
	});

	test('really flips the theme and its label follows the state', () => {
		render(<ThemeToggle />);

		const toDark = screen.getByRole('button', {
			name: 'switch-to-dark-mode',
		});
		expect(toDark.getAttribute('aria-pressed')).toBe('false');

		fireEvent.click(toDark);

		const toLight = screen.getByRole('button', {
			name: 'switch-to-light-mode',
		});
		expect(toLight.getAttribute('aria-pressed')).toBe('true');
		expect(useUiStore.getState().colorScheme).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);

		fireEvent.click(toLight);

		expect(
			screen
				.getByRole('button', { name: 'switch-to-dark-mode' })
				.getAttribute('aria-pressed'),
		).toBe('false');
		expect(useUiStore.getState().colorScheme).toBe('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);
	});
});
