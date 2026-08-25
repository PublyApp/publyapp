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
	billing: 'Billing',
	'common:current-plan': 'Current plan',
	'common:payment-method': 'Payment method',
	'common:billing-history': 'Billing history',
	'common:usage': 'Usage',
	'current-plan-coming-later-title': 'Your plan is coming later',
	'current-plan-coming-later-description':
		'Your plan, renewal date, and seat usage will appear here once the billing API ships.',
	'payment-method-coming-later-title': 'Payment method is coming later',
	'payment-method-coming-later-description':
		'Saved payment cards will appear here once the billing API ships.',
	'billing-history-coming-later-title': 'Billing history is coming later',
	'billing-history-coming-later-description':
		'Invoices and receipts will appear here once the billing API ships.',
	'usage-coming-later-title': 'Usage is coming later',
	'usage-coming-later-description':
		'Seat and feature usage will appear here once the billing API ships.',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './billing';

const TenantSettingsBillingPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsBillingPage', () => {
	test('renders the four read-only billing cards', () => {
		render(<TenantSettingsBillingPage />);

		expect(screen.getByRole('heading', { name: 'Billing' })).toBeTruthy();
		expect(screen.getByText('Current plan')).toBeTruthy();
		expect(screen.getByText('Payment method')).toBeTruthy();
		expect(screen.getByText('Billing history')).toBeTruthy();
		expect(screen.getByText('Usage')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(4);
	});

	test('shows an honest coming-later empty state per card', () => {
		render(<TenantSettingsBillingPage />);

		expect(
			screen.getByTestId('tenant-settings-current-plan-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-payment-method-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-billing-history-empty'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-settings-usage-empty')).toBeTruthy();
		expect(screen.getByText('Your plan is coming later')).toBeTruthy();
		expect(screen.getByText('Payment method is coming later')).toBeTruthy();
		expect(screen.getByText('Billing history is coming later')).toBeTruthy();
		expect(screen.getByText('Usage is coming later')).toBeTruthy();
	});

	test('never invents plan details, invoices, or usage numbers', () => {
		render(<TenantSettingsBillingPage />);

		// No fake pricing, no mock invoice rows (dated amounts), no fabricated
		// payment cards — and no pretend-to-work change/cancel/download
		// controls.
		expect(screen.queryByText(/\$\d+/)).toBeNull();
		expect(screen.queryByText(/Visa|Mastercard/i)).toBeNull();
		expect(screen.queryAllByRole('button').length).toBe(0);
	});
});
