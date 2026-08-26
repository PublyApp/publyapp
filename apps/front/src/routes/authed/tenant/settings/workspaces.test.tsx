/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => {
	const pickerData: TenantsForPickerData = {
		tenants: [
			{ id: 'tenant-1', name: 'Acme Inc.', code: 'acme', status: 'Active' },
		],
		activeCount: 1,
		totalCount: 1,
		hasDeletedTenants: false,
		hasSuspendedTenants: false,
	};

	return {
		query: {
			isPending: false,
			isLoading: false,
			isError: false,
			isSuccess: true,
			error: undefined as unknown,
			data: pickerData,
			refetch: vi.fn(),
		},
	};
});

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: () => mocks.query,
}));

vi.mock('~/lib/selected-tenant-storage', () => ({
	readSelectedTenantId: () => 'tenant-1',
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

const EN_LABELS: TestLabelMap = {
	workspaces: 'Workspaces',
	'common:all-workspaces': 'All workspaces',
	'common:default-workspace': 'Default workspace',
	'common:name': 'Name',
	'common:workspace-slug': 'Workspace slug',
	'common:description': 'Description',
	'common:unnamed-tenant': 'Unnamed tenant',
	'common:retry': 'Retry',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
	'default-workspace-coming-later-title':
		'Default workspace configuration is coming later',
	'default-workspace-coming-later-description':
		'Choosing a default workspace will be possible here once the workspaces API ships.',
	'failed-to-load-organization': 'Failed to load organization',
	'failed-to-load-organization-description':
		'Your organization details could not be loaded. Try again.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './workspaces';

const TenantSettingsWorkspacesPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.query.isPending = false;
	mocks.query.isError = false;
	mocks.query.isSuccess = true;
});

describe('TenantSettingsWorkspacesPage', () => {
	test('shows the current workspace identity from the picker query as real values', () => {
		render(<TenantSettingsWorkspacesPage />);

		expect(screen.getByText('Acme Inc.')).toBeTruthy();
		expect(screen.getByText('acme')).toBeTruthy();
		expect(screen.getByText('Name')).toBeTruthy();
		expect(screen.getByText('Workspace slug')).toBeTruthy();
	});

	test('never invents values for fields without an API', () => {
		render(<TenantSettingsWorkspacesPage />);

		// Description has no backend — it must render the explicit "not
		// available yet" placeholder, not fake data.
		expect(screen.getAllByText('Not available yet').length).toBe(1);
	});

	test('shows the default-workspace coming-later state and the read-only badge', () => {
		render(<TenantSettingsWorkspacesPage />);

		expect(
			screen.getByTestId('tenant-settings-default-workspace-empty'),
		).toBeTruthy();
		expect(
			screen.getByText('Default workspace configuration is coming later'),
		).toBeTruthy();
		expect(
			screen.getAllByTestId('account-read-only-badge').length,
		).toBeGreaterThan(0);
	});

	test('renders no interactive controls on the read-only surface', () => {
		render(<TenantSettingsWorkspacesPage />);

		expect(screen.queryAllByRole('button').length).toBe(0);
	});

	test('shows a skeleton while the picker query is pending', () => {
		mocks.query.isPending = true;
		mocks.query.isSuccess = false;

		render(<TenantSettingsWorkspacesPage />);

		expect(
			screen.getByTestId('tenant-settings-workspaces-skeleton'),
		).toBeTruthy();
	});

	test('shows an error state with retry when the picker query fails', () => {
		mocks.query.isError = true;
		mocks.query.isSuccess = false;

		render(<TenantSettingsWorkspacesPage />);

		expect(screen.getByTestId('tenant-settings-workspaces-error')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});
});
