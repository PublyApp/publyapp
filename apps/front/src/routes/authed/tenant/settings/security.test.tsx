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
	'password-policy': 'Password policy',
	'password-policy-coming-later-title': 'Password policy is coming later',
	'password-policy-coming-later-description':
		'Minimum password strength for members will be configurable here once the settings API ships.',
	'common:two-factor-authentication': 'Two-factor authentication',
	'two-factor-coming-later-title': 'Two-factor authentication is coming later',
	'two-factor-coming-later-description':
		'Requiring two-factor authentication for all members will be configurable here once the settings API ships.',
	'common:active-sessions': 'Active sessions',
	'active-sessions-coming-later-title': 'Active sessions are coming later',
	'active-sessions-coming-later-description':
		'Devices and sign-in activity across your organization will appear here once the session API ships.',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './security';

const TenantSettingsSecurityPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsSecurityPage', () => {
	test('renders the three read-only security cards', () => {
		render(<TenantSettingsSecurityPage />);

		expect(screen.getByRole('heading', { name: 'Security' })).toBeTruthy();
		expect(screen.getByText('Password policy')).toBeTruthy();
		expect(screen.getByText('Two-factor authentication')).toBeTruthy();
		expect(screen.getByText('Active sessions')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(3);
	});

	test('shows an honest coming-later empty state per card', () => {
		render(<TenantSettingsSecurityPage />);

		expect(
			screen.getByTestId('tenant-settings-password-policy-empty'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-settings-two-factor-empty')).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-active-sessions-empty'),
		).toBeTruthy();
		expect(screen.getByText('Password policy is coming later')).toBeTruthy();
		expect(
			screen.getByText('Two-factor authentication is coming later'),
		).toBeTruthy();
		expect(screen.getByText('Active sessions are coming later')).toBeTruthy();
	});

	test('renders no fake switches or pretend-to-work buttons', () => {
		render(<TenantSettingsSecurityPage />);

		expect(screen.queryAllByRole('button').length).toBe(0);
		expect(screen.queryAllByRole('switch').length).toBe(0);
	});
});
