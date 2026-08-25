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
	members: 'Members',
	'common:team-members': 'Team members',
	'common:pending-invitations': 'Pending invitations',
	'team-members-coming-later-title': 'Team members are coming later',
	'team-members-coming-later-description':
		'Member management and invitations will appear here once the members API ships.',
	'pending-invitations-coming-later-title':
		'Pending invitations are coming later',
	'pending-invitations-coming-later-description':
		"Invitations you've sent will appear here once the members API ships.",
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './members';

const TenantSettingsMembersPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsMembersPage', () => {
	test('renders the two read-only members cards', () => {
		render(<TenantSettingsMembersPage />);

		expect(screen.getByRole('heading', { name: 'Members' })).toBeTruthy();
		expect(screen.getByText('Team members')).toBeTruthy();
		expect(screen.getByText('Pending invitations')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(2);
	});

	test('shows an honest coming-later empty state per card', () => {
		render(<TenantSettingsMembersPage />);

		expect(
			screen.getByTestId('tenant-settings-team-members-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-pending-invitations-empty'),
		).toBeTruthy();
		expect(screen.getByText('Team members are coming later')).toBeTruthy();
		expect(
			screen.getByText('Pending invitations are coming later'),
		).toBeTruthy();
	});

	test('renders no mock member rows or pretend-to-work invite controls', () => {
		render(<TenantSettingsMembersPage />);

		// No fake member names/emails, no disabled invite button, no search
		// box that pretends to filter.
		expect(screen.queryByText(/@studio\.io/i)).toBeNull();
		expect(screen.queryAllByRole('button').length).toBe(0);
		expect(screen.queryAllByRole('textbox').length).toBe(0);
	});
});
