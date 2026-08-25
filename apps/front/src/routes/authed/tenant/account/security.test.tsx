/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

const EN_LABELS: TestLabelMap = {
	security: 'Security',
	'change-password': 'Change password',
	'current-password': 'Current password',
	'new-password': 'New password',
	'confirm-new-password': 'Confirm new password',
	'update-password': 'Update password',
	'two-factor-authentication': 'Two-factor authentication',
	'two-factor-authentication-status': 'Off',
	'two-factor-authentication-description':
		'Two-factor authentication adds an extra layer of security to your account.',
	'enable-two-factor-authentication': 'Enable 2FA',
	'active-sessions': 'Active sessions',
	'active-sessions-coming-later-title': 'Session management is coming later',
	'active-sessions-coming-later-description':
		'Devices and sign-in activity will appear here once the session API ships.',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './security';

const AccountSecurityPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('AccountSecurityPage', () => {
	test('renders the read-only security cards', () => {
		render(<AccountSecurityPage />);

		expect(screen.getByRole('heading', { name: 'Security' })).toBeTruthy();
		expect(screen.getByText('Change password')).toBeTruthy();
		expect(screen.getByText('Two-factor authentication')).toBeTruthy();
		expect(screen.getByText('Active sessions')).toBeTruthy();
		expect(
			screen.getAllByTestId('account-read-only-badge').length,
		).toBeGreaterThan(0);
	});

	test('never enables a mutation control', () => {
		render(<AccountSecurityPage />);

		const buttons = screen.getAllByRole('button');
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of buttons) {
			expect(
				(button as HTMLButtonElement).disabled,
				'every security-page action must be disabled',
			).toBe(true);
		}
	});

	test('shows an honest empty state for the sessions surface', () => {
		render(<AccountSecurityPage />);

		expect(screen.getByTestId('tenant-account-sessions-empty')).toBeTruthy();
		expect(screen.getByText('Session management is coming later')).toBeTruthy();
	});
});
