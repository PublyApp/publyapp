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

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

const EN_LABELS: TestLabelMap = {
	organizations: 'Organizations',
	'common:organization-details': 'Organization details',
	'common:logo': 'Logo',
	'common:logo-description': '150x150px JPEG, PNG image',
	'common:name': 'Name',
	'common:workspace-slug': 'Workspace slug',
	'common:members': 'Members',
	'common:unnamed-tenant': 'Unnamed tenant',
	'common:retry': 'Retry',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
	'organizations-list': 'Organizations in this workspace',
	'organizations-coming-later-title': 'The organization list is coming later',
	'organizations-coming-later-description':
		'Switching between the organizations you belong to will be possible here once the organizations API ships.',
	'members-coming-later-title': 'Members are coming later',
	'members-coming-later-description':
		'The people in this organization and their roles will appear here once the organizations API ships.',
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
import { Route } from './organizations';

const TenantOrganizationsPage = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.query.isPending = false;
	mocks.query.isError = false;
	mocks.query.isSuccess = true;
});

describe('TenantOrganizationsPage', () => {
	test('shows the tenant identity from the picker query as real values', () => {
		render(<TenantOrganizationsPage />);

		expect(screen.getByText('Acme Inc.')).toBeTruthy();
		expect(screen.getByText('acme')).toBeTruthy();
		expect(screen.getByText('Name')).toBeTruthy();
		expect(screen.getByText('Workspace slug')).toBeTruthy();
	});

	test('never invents values for fields without a source', () => {
		render(<TenantOrganizationsPage />);

		// The logo has no backend value — it must render the explicit
		// "not available yet" placeholder, not a fake logo.
		expect(screen.getAllByText('Not available yet').length).toBe(1);
	});

	test('shows the coming-later list and members surfaces and the read-only badge', () => {
		render(<TenantOrganizationsPage />);

		expect(screen.getByTestId('tenant-organizations-list-empty')).toBeTruthy();
		expect(
			screen.getByTestId('tenant-organizations-members-empty'),
		).toBeTruthy();
		expect(screen.getAllByTestId('account-read-only-badge').length).toBe(3);
	});

	test('renders no interactive controls on the read-only surface', () => {
		render(<TenantOrganizationsPage />);

		expect(screen.queryAllByRole('button').length).toBe(0);
	});

	test('shows a skeleton while the picker query is pending', () => {
		mocks.query.isPending = true;
		mocks.query.isSuccess = false;

		render(<TenantOrganizationsPage />);

		expect(screen.getByTestId('tenant-organizations-skeleton')).toBeTruthy();
	});

	test('shows an error state with retry when the picker query fails', () => {
		mocks.query.isError = true;
		mocks.query.isSuccess = false;

		render(<TenantOrganizationsPage />);

		expect(screen.getByTestId('tenant-organizations-error')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});
});
