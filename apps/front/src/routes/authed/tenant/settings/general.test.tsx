/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';

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
	createFileRoute: () => (options: Record<string, unknown>) => options,
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

const EN_LABELS: Record<string, string> = {
	general: 'General',
	'common:organization-details': 'Organization details',
	'common:logo': 'Logo',
	'common:logo-description': '150x150px JPEG, PNG image',
	'common:name': 'Name',
	'common:workspace-slug': 'Workspace slug',
	'common:description': 'Description',
	'common:industry': 'Industry',
	'common:website': 'Website',
	'common:danger-zone': 'Danger zone',
	'common:unnamed-tenant': 'Unnamed tenant',
	'common:retry': 'Retry',
	'read-only': 'Read only',
	'not-available-yet': 'Not available yet',
	'regional-and-contact-settings': 'Regional & contact',
	'regional-and-contact-coming-later-title':
		'Regional and contact settings are coming later',
	'regional-and-contact-coming-later-description':
		'Timezone, date format, language, and contact email will appear here once the settings API ships.',
	'danger-zone-coming-later-title': 'Organization deletion is coming later',
	'danger-zone-coming-later-description':
		'Deleting this organization will be possible here once the settings API ships.',
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
import { Route } from './general';

const TenantSettingsGeneralPage = (
	Route as unknown as { component: ComponentType }
).component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.query.isPending = false;
	mocks.query.isError = false;
	mocks.query.isSuccess = true;
});

describe('TenantSettingsGeneralPage', () => {
	test('shows the tenant identity from the picker query as real values', () => {
		render(<TenantSettingsGeneralPage />);

		expect(screen.getByText('Acme Inc.')).toBeTruthy();
		expect(screen.getByText('acme')).toBeTruthy();
		expect(screen.getByText('Name')).toBeTruthy();
		expect(screen.getByText('Workspace slug')).toBeTruthy();
	});

	test('never invents values for fields without an API', () => {
		render(<TenantSettingsGeneralPage />);

		// Logo, description, industry and website have no backend — they must
		// all render the explicit "not available yet" placeholder, not fake
		// values.
		expect(screen.getAllByText('Not available yet').length).toBe(4);
	});

	test('shows the coming-later empty states and the read-only badge', () => {
		render(<TenantSettingsGeneralPage />);

		expect(
			screen.getByTestId('tenant-settings-general-regional-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-settings-general-danger-empty'),
		).toBeTruthy();
		expect(
			screen.getAllByTestId('account-read-only-badge').length,
		).toBeGreaterThan(0);
	});

	test('renders no interactive controls on the read-only surface', () => {
		render(<TenantSettingsGeneralPage />);

		expect(screen.queryAllByRole('button').length).toBe(0);
	});

	test('falls back to the unnamed placeholder when the tenant has no code', () => {
		mocks.query.data = {
			tenants: [
				{ id: 'tenant-1', name: 'Acme Inc.', code: null, status: 'Active' },
			],
			activeCount: 1,
			totalCount: 1,
			hasSuspendedTenants: false,
		};

		render(<TenantSettingsGeneralPage />);

		expect(screen.getByText('Acme Inc.')).toBeTruthy();
		expect(screen.getAllByText('Not available yet').length).toBe(5);
	});

	test('shows a skeleton while the picker query is pending', () => {
		mocks.query.isPending = true;
		mocks.query.isSuccess = false;

		render(<TenantSettingsGeneralPage />);

		expect(screen.getByTestId('tenant-settings-general-skeleton')).toBeTruthy();
	});

	test('shows an error state with retry when the picker query fails', () => {
		mocks.query.isError = true;
		mocks.query.isSuccess = false;

		render(<TenantSettingsGeneralPage />);

		expect(screen.getByTestId('tenant-settings-general-error')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});
});
