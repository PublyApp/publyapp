/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	needsReconnectAccounts: [] as Array<{
		id: string;
		displayHandle: string;
		provider: string;
		lastError: string | null;
	}>,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

// The page reads the needs-reconnect list through
// `useNeedsReconnectAccountsQuery`; the mock pins the resolved payload the
// same way the sibling settings tests pin their query hooks.
vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => 'tenant-1',
}));

vi.mock('~/lib/query/needs-reconnect-accounts', async () => {
	const { toNeedsReconnectAccounts } = await vi.importActual<
		typeof import('~/lib/query/needs-reconnect-accounts')
	>('~/lib/query/needs-reconnect-accounts');

	return {
		toNeedsReconnectAccounts,
		useNeedsReconnectAccountsQuery: () => ({
			data: {
				accounts: mocks.needsReconnectAccounts.map((account) => ({
					...account,
				})),
			},
			isSuccess: true,
			refetch: vi.fn(),
		}),
	};
});

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
	// social-accounts namespace (rendered by the embedded reconnect banner)
	'reconnect-banner-title': '{{handle}} needs reconnection',
	'reconnect-banner-description':
		'{{handle}} stopped working and its scheduled posts were paused.',
	'reconnect-banner-more': '+{{count}} more account(s)',
	'reconnect-banner-button': 'Reconnect',
	'reconnect-banner-contact-admin':
		'Ask someone with manage access to reconnect this account.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = EN_LABELS[key] ?? key;
			if (typeof text === 'string') {
				for (const [name, value] of Object.entries(options ?? {})) {
					text = text.replaceAll(`{{${name}}}`, String(value)) as string;
				}
			}
			return text;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './integrations';

const TenantSettingsIntegrationsPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.needsReconnectAccounts = [];
});

describe('TenantSettingsIntegrationsPage', () => {
	test('renders the three read-only integrations cards', () => {
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy();
		expect(screen.getByText('Connected')).toBeTruthy();
		expect(screen.getByText('Available integrations')).toBeTruthy();
		expect(screen.getByText('API access')).toBeTruthy();
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
	});

	test('shows the reconnect banner once the query resolves with one account', async () => {
		mocks.needsReconnectAccounts = [
			{
				id: '11111111-1111-1111-1111-111111111111',
				displayHandle: '@broken.bsky.social',
				provider: 'bluesky',
				lastError: 'Bluesky refused: invalid app password',
			},
		];

		render(<TenantSettingsIntegrationsPage />);

		await waitFor(() => {
			const banners = screen.getAllByTestId('reconnect-banner');
			expect(banners.length).toBe(1);
			expect(banners[0].textContent).toContain('@broken.bsky.social');
			expect(banners[0].textContent).toContain('Bluesky refused');
		});
	});
});
