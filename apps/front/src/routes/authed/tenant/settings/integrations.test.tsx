/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ComponentType } from 'react';
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

// The page reads the needs-reconnect list through
// `useNeedsReconnectAccountsQuery`; the mock pins the resolved payload the
// same way the sibling settings tests pin their query hooks.
vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => 't1',
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

// Wiring tests stop at this seam: the drawer/dialog own their behaviour in
// dedicated suites (they need a QueryClient for their mutations).
vi.mock('./_bluesky-connect-drawer', () => ({
	BlueskyConnectDrawer: ({ mode, open }: { mode: string; open: boolean }) =>
		open
			? createElement('div', { 'data-testid': `bluesky-${mode}-drawer` })
			: null,
}));
vi.mock('./_disconnect-dialog', () => ({
	DisconnectDialog: ({
		isOpen,
		account,
	}: {
		isOpen: boolean;
		account: { displayHandle: string };
	}) =>
		isOpen
			? createElement(
					'div',
					{ role: 'alertdialog', 'data-testid': 'disconnect-dialog-stub' },
					account.displayHandle,
				)
			: null,
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
	// Placeholder cards kept from the pre-C3 screen (develop side).
	'common:connected': 'Connected',
	'common:available-integrations': 'Available integrations',
	'common:api-access': 'API access',
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
	mocks.needsReconnectAccounts = [];
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

	// Wiring proof: the Connect trigger opens the drawer in connect mode.
	test('ItShouldOpenTheConnectDrawerFromTheConnectTrigger', async () => {
		const user = userEvent.setup();
		socialAccountsWire = [];
		render(<TenantSettingsIntegrationsPage />);

		await user.click(screen.getByRole('button', { name: /connect bluesky/i }));

		expect(screen.getByTestId('bluesky-connect-drawer')).toBeTruthy();
	});

	// Wiring proof: row actions open the RECONNECT drawer (mode flows through;
	// the locked-handle behaviour belongs to the drawer's own suite).
	test('ItShouldOpenTheReconnectDrawerWithLockedHandleFromRowActions', async () => {
		socialAccountsWire = [needsReconnectAccount];
		render(<TenantSettingsIntegrationsPage />);

		fireEvent.click(screen.getByTestId('social-account-actions-a2'));
		const item = await screen.findByRole('menuitem', { name: /reconnect/i });
		fireEvent.click(item);

		await waitFor(() =>
			expect(screen.getByTestId('bluesky-reconnect-drawer')).toBeTruthy(),
		);
	});

	// Wiring proof: row actions pass the RIGHT ACCOUNT to the confirmation.
	test('ItShouldOpenTheDisconnectConfirmationFromRowActions', async () => {
		socialAccountsWire = [needsReconnectAccount];
		render(<TenantSettingsIntegrationsPage />);

		fireEvent.click(screen.getByTestId('social-account-actions-a2'));
		const item = await screen.findByRole('menuitem', { name: /disconnect/i });
		fireEvent.click(item);

		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain('@old.bsky.social');
	});

	test('renders the section headers of the integrations screen', () => {
		render(<TenantSettingsIntegrationsPage />);

		expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy();
		expect(screen.getByText('Connected')).toBeTruthy();
		expect(screen.getByText('Available integrations')).toBeTruthy();
		expect(screen.getByText('API access')).toBeTruthy();
	});

	// The connected card is the real C3 surface now: its empty testid renders
	// through the C3 empty state; the other two cards keep their honest
	// coming-later states from the placeholder screen.
	test('shows an honest coming-later empty state per remaining card', () => {
		socialAccountsWire = [];
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByTestId('tenant-settings-connected-integrations-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-available-integrations-empty'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-settings-api-access-empty')).toBeTruthy();
		expect(
			screen.getByText('Available integrations are coming later'),
		).toBeTruthy();
		expect(
			screen.getByText('API keys and webhooks are coming later'),
		).toBeTruthy();
	});

	test('ItShouldShowConnectButtonToViewOnlyHolders', () => {
		socialAccountsWire = [];
		permissionKeys = ['tenant.socialaccounts.view'];
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByRole('button', { name: /connect bluesky/i }),
		).toBeTruthy();
	});

	test('ItShouldShowConnectButtonToAdmins', () => {
		socialAccountsWire = [];
		permissionKeys = ['*'];
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.getByRole('button', { name: /connect bluesky/i }),
		).toBeTruthy();
	});

	test('ItShouldHideConnectButtonWhenNoViewPermission', () => {
		socialAccountsWire = [];
		permissionKeys = ['tenant.posts.view'];
		render(<TenantSettingsIntegrationsPage />);

		expect(
			screen.queryByRole('button', { name: /connect bluesky/i }),
		).toBeNull();
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
