/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

let socialAccountsWire: Array<Record<string, unknown>> = [];
let socialAccountsPending = false;
let socialAccountsError = false;
let permissionKeys: string[] = ['*'];

// Spread the REAL module and override only the network seam, so the page
// still exercises the true row mapper.
vi.mock('~/lib/query/social-accounts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useSocialAccountsQuery: () => ({
		// Real TanStack semantics: the first page in flight has NO data yet.
		data:
			socialAccountsPending || socialAccountsError
				? undefined
				: { data: socialAccountsWire, nextCursor: null },
		isPending: socialAccountsPending,
		isError: socialAccountsError,
		refetch: () => Promise.resolve(),
	}),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => 't1',
}));

vi.mock('~/lib/query/tenant-projects', () => ({
	useTenantProjectsQuery: () => ({ data: undefined }),
	toTenantProjectItems: () => [{ id: 'p1', name: 'Acme' }],
}));

vi.mock('~/lib/permissions/use-has-tenant-permission', () => ({
	useHasTenantPermission: (key: string) =>
		permissionKeys.includes(key) || permissionKeys.includes('*'),
	useCanManageSocialAccounts: () =>
		permissionKeys.includes('*') ||
		permissionKeys.includes('tenant.socialaccounts.manage'),
	useCanViewIntegrations: () =>
		permissionKeys.includes('*') ||
		permissionKeys.includes('tenant.socialaccounts.view'),
}));

const EN_LABELS: TestLabelMap = {
	integrations: 'Integrations',
	'integrations-list-title': 'Connected accounts',
	'integrations-empty-title': 'No connected accounts yet',
	'integrations-empty-description':
		'Connect a Bluesky account to start publishing from your projects.',
	'integrations-load-failed': 'Connected accounts could not be loaded',
	'integrations-load-failed-description':
		'The connected accounts list could not be loaded. Try again.',
	'connect-bluesky': 'Connect Bluesky',
	reconnect: 'Reconnect',
	disconnect: 'Disconnect',
	'provider-bluesky': 'Bluesky',
	'settings:status-active': 'Active',
	'settings:status-needs-reconnect': 'Needs reconnect',
	'settings:status-revoked': 'Disconnected',
	'last-success-never': 'Never connected successfully',
	'visible-in-all-projects': 'Visible in: all projects',
	'visible-in-projects': 'Visible in: {{names}}',
	'col-handle': 'Handle',
	'col-provider': 'Provider',
	'col-last-success': 'Last success',
	'col-visible-in': 'Visible in',
	retry: 'Retry',
};

const translate = (key: string, options?: Record<string, unknown>): string => {
	const template = EN_LABELS[key] ?? key;
	if (!options) {
		return template;
	}

	return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
		typeof options[name] === 'string' ? options[name] : `{{${name}}}`,
	);
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: translate,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './integrations';

const TenantSettingsIntegrationsPage = Route.options.component as ComponentType;

const activeAccount = {
	id: 'a1',
	provider: 'bluesky',
	externalAccountId: 'did:plc:a1',
	displayHandle: '@team.bsky.social',
	status: 'active',
	credentialType: 'app_password',
	lastSuccessAt: '2026-08-25T10:00:00Z',
	lastError: null,
	projectIds: ['p1'],
};

const needsReconnectAccount = {
	id: 'a2',
	provider: 'bluesky',
	externalAccountId: 'did:plc:a2',
	displayHandle: '@old.bsky.social',
	status: 'needs_reconnect',
	credentialType: 'app_password',
	lastSuccessAt: null,
	lastError: 'Invalid credentials',
	projectIds: [],
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	socialAccountsWire = [];
	socialAccountsPending = false;
	socialAccountsError = false;
	permissionKeys = ['*'];
});

describe('TenantSettingsIntegrationsPage', () => {
	test('ItShouldRenderConnectedAccountRowsWithStatusTonesWhenListHasAccounts', () => {
		socialAccountsWire = [activeAccount, needsReconnectAccount];
		render(<TenantSettingsIntegrationsPage />);

		const table = screen.getByTestId('tenant-settings-social-accounts-table');
		expect(within(table).getByText('@team.bsky.social')).toBeTruthy();
		expect(within(table).getByText('@old.bsky.social')).toBeTruthy();

		// StatusPill puts data-tone on .publy-status-pill; the testid span sits
		// inside it. Epic C §3 tones: active green, needs_reconnect orange.
		const activePill = screen
			.getByTestId('status-pill-active')
			.closest<HTMLElement>('[data-tone]');
		expect(activePill?.getAttribute('data-tone')).toBe('success');

		const warnPill = screen
			.getByTestId('status-pill-needs-reconnect')
			.closest<HTMLElement>('[data-tone]');
		expect(warnPill?.getAttribute('data-tone')).toBe('warning');
	});

	test('ItShouldShowTheEmptyStateWhenNoAccountsAreConnected', () => {
		socialAccountsWire = [];
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByTestId('tenant-settings-connected-integrations-empty'),
		).toBeTruthy();
	});

	test('ItShouldShowProviderAndVisibilityColumnsPerSpec', () => {
		socialAccountsWire = [activeAccount];
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.getByText('Bluesky')).toBeTruthy();
		// p1 maps to the mocked project labelled Acme.
		expect(screen.getByText('Visible in: Acme')).toBeTruthy();

		socialAccountsWire = [needsReconnectAccount];
		cleanup();
		render(<TenantSettingsIntegrationsPage />);
		expect(screen.getByText('Visible in: all projects')).toBeTruthy();
		expect(screen.getByText('Never connected successfully')).toBeTruthy();
	});

	test('ItShouldShowTheLoadingSkeletonWhileTheListIsPending', () => {
		socialAccountsPending = true;
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByTestId('tenant-settings-social-accounts-table-loading'),
		).toBeTruthy();
	});

	test('ItShouldHideRowActionsForViewOnlyHolders', () => {
		socialAccountsWire = [activeAccount];
		permissionKeys = ['tenant.socialaccounts.view'];
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.getByText('@team.bsky.social')).toBeTruthy();
		expect(screen.queryAllByTestId(/^social-account-actions-/).length).toBe(0);

		permissionKeys = ['*'];
		cleanup();
		render(<TenantSettingsIntegrationsPage />);
		expect(screen.getAllByTestId(/^social-account-actions-/).length).toBe(1);
	});
});
