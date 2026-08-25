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
	notifications: 'Notifications',
	'email-notifications': 'Email notifications',
	'manage-your-email-notification-preferences':
		'Manage your email notification preferences',
	'push-notifications': 'Push notifications',
	'manage-your-push-notification-preferences':
		'Manage your push notification preferences',
	'activity-digest': 'Activity digest',
	'manage-your-activity-digest-preferences':
		'Manage your activity digest preferences',
	'marketing-emails': 'Marketing emails',
	'marketing-emails-description': 'News, features, and product updates',
	'product-updates': 'Product updates',
	'product-updates-description': 'Important updates about the platform',
	'security-alerts': 'Security alerts',
	'security-alerts-description': 'Security and account activity alerts',
	'new-messages': 'New messages',
	'new-messages-description': 'Receive notifications for new messages',
	mentions: 'Mentions',
	'mentions-description': 'Get notified when someone mentions you',
	comments: 'Comments',
	'comments-description': 'Notifications for comments on your posts',
	'weekly-digest': 'Weekly digest',
	'weekly-digest-description': 'Summary of your weekly activity',
	'monthly-report': 'Monthly report',
	'monthly-report-description': 'Monthly performance and analytics report',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key.replace(/^common:/, '')] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './notifications';

const AccountNotificationsPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('AccountNotificationsPage', () => {
	test('renders the three preference cards as read-only', () => {
		render(<AccountNotificationsPage />);

		expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
		expect(screen.getByText('Email notifications')).toBeTruthy();
		expect(screen.getByText('Push notifications')).toBeTruthy();
		expect(screen.getByText('Activity digest')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge')).toHaveLength(3);
	});

	test('renders every preference as a disabled, unchecked switch', () => {
		const { container } = render(<AccountNotificationsPage />);

		// 3 email + 3 push + 2 digest preferences.
		const switches = container.querySelectorAll('[data-slot="switch"]');
		expect(switches).toHaveLength(8);

		for (const el of switches) {
			expect(el.getAttribute('aria-disabled'), 'switch must be disabled').toBe(
				'true',
			);
			expect(el.getAttribute('data-checked')).toBeNull();
		}
	});
});
