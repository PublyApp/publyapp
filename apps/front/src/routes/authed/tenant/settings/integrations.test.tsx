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
	integrations: 'Integrations',
	'common:connected': 'Connected',
	'common:available-integrations': 'Available integrations',
	'common:api-access': 'API access',
	'connected-integrations-coming-later-title':
		'Connected integrations are coming later',
	'connected-integrations-coming-later-description':
		'Integrations you connect will appear here once the integrations API ships.',
	'available-integrations-coming-later-title':
		'Available integrations are coming later',
	'available-integrations-coming-later-description':
		'The integrations catalog will appear here once the integrations API ships.',
	'api-access-coming-later-title': 'API keys and webhooks are coming later',
	'api-access-coming-later-description':
		'API keys and webhook configuration will appear here once the integrations API ships.',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './integrations';

const TenantSettingsIntegrationsPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantSettingsIntegrationsPage', () => {
	test('renders the three read-only integrations cards', () => {
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy();
		expect(screen.getByText('Connected')).toBeTruthy();
		expect(screen.getByText('Available integrations')).toBeTruthy();
		expect(screen.getByText('API access')).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(3);
	});

	test('shows an honest coming-later empty state per card', () => {
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByTestId('tenant-settings-connected-integrations-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-available-integrations-empty'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-settings-api-access-empty')).toBeTruthy();
		expect(
			screen.getByText('Connected integrations are coming later'),
		).toBeTruthy();
		expect(
			screen.getByText('Available integrations are coming later'),
		).toBeTruthy();
		expect(
			screen.getByText('API keys and webhooks are coming later'),
		).toBeTruthy();
	});

	test('renders no fake catalog entries or pretend-to-work connect controls', () => {
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.queryByText(/Slack|Zapier|Notion/i)).toBeNull();
		expect(screen.queryAllByRole('button').length).toBe(0);
		expect(screen.queryAllByRole('switch').length).toBe(0);
	});
});
