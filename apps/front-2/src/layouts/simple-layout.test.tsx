/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en' },
	}),
}));

vi.mock('~/lib/hooks/use-switch-locale', () => ({
	useSwitchLocale: () => ({ switchLocale: vi.fn(), isSwitching: false }),
}));

import { SimpleLayout } from './simple-layout';

describe('SimpleLayout', () => {
	afterEach(() => {
		cleanup();
	});

	test('renders the theme toggle and language switcher without the workspace topbar action-btn class (r3-shell-F1)', () => {
		render(<SimpleLayout>content</SimpleLayout>);

		const themeToggle = screen.getByTestId('theme-toggle');
		const languageButton = screen.getByTestId('tenant-portal-language-button');

		// `.app-shell-topbar-action-btn` is `display: none` below 640px in
		// app.css's workspace-topbar mobile rule — SimpleLayout is a standalone
		// surface (the post-login org picker), not the workspace topbar, and
		// must never lose its only locale/theme controls on a phone.
		expect(themeToggle.className).not.toContain('app-shell-topbar-action-btn');
		expect(languageButton.className).not.toContain(
			'app-shell-topbar-action-btn',
		);
		expect(themeToggle.className).toContain('rounded-full');
		expect(languageButton.className).toContain('rounded-full');
	});
});
