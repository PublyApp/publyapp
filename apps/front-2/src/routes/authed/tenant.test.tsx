/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';

const mocks = vi.hoisted(() => ({
	query: {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: undefined as unknown,
		data: undefined as TenantsForPickerData | undefined,
		refetch: vi.fn(),
	},
	logout: vi.fn(),
	isLoggingOut: false,
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('~/layouts/simple-layout', () => ({
	SimpleLayout: ({ children }: { children: ReactNode }) => (
		<div data-testid="simple-layout-stub">{children}</div>
	),
}));

vi.mock('~/lib/query/tenants-for-picker', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenants-for-picker')
	>('~/lib/query/tenants-for-picker');

	return {
		...actual,
		useTenantsForPickerQuery: () => mocks.query,
	};
});

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({
		logout: mocks.logout,
		isLoggingOut: mocks.isLoggingOut,
	}),
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

const EN_LABELS: Record<string, string> = {
	'select-organization': 'Select Organization',
	'select-organization-description':
		'Choose which organization you want to access',
	'failed-to-load-organizations': 'Failed to load organizations',
	'no-organizations-found': 'No organizations found',
	'suspended-tenants-banner':
		'Some of your organizations have been suspended and are temporarily unavailable. Please contact support for assistance.',
	'contact-support': 'Contact Support',
	suspended: 'Suspended',
	'log-out': 'Log out',
	'common-loading': 'Loading...',
	tenant: 'Tenant',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

const activeTenant = (
	id: string,
	name: string,
): TenantsForPickerData['tenants'][number] => ({
	id,
	name,
	code: `${id}-code`,
	status: 'Active',
});

const suspendedTenant = (
	id: string,
	name: string,
): TenantsForPickerData['tenants'][number] => ({
	id,
	name,
	code: `${id}-code`,
	status: 'Suspended',
});

const setQuery = (overrides: Partial<typeof mocks.query>) => {
	Object.assign(mocks.query, {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: undefined,
		data: undefined,
		...overrides,
	});
};

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './tenant';

const TenantPortalRoute = (Route as unknown as { component: ComponentType })
	.component;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('TenantPortalRoute', () => {
	test('renders the loading state while the query is pending', () => {
		setQuery({ isSuccess: false, isPending: true, isLoading: true });
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-loading')).toBeTruthy();
	});

	test('renders the error state with a retry action that refetches', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-error')).toBeTruthy();
		expect(screen.getByText('Failed to load organizations')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'retry' }));
		expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
	});

	test('renders a log-out escape from the error state', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		render(<TenantPortalRoute />);

		fireEvent.click(screen.getByTestId('tenant-portal-error-logout-button'));
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});

	test('logs out instead of rendering the error state on a 401', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<TenantPortalRoute />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-error')).toBeNull();
	});

	test('renders the empty state when there are no tenants at all', () => {
		setQuery({
			data: {
				tenants: [],
				activeCount: 0,
				totalCount: 0,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(screen.getByText('No organizations found')).toBeTruthy();
	});

	test('auto-resolves straight to the workspace when exactly one tenant is active', () => {
		setQuery({
			data: {
				tenants: [activeTenant('t-1', 'Acme')],
				activeCount: 1,
				totalCount: 1,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-workspace-placeholder')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('still auto-resolves with one active tenant even when a sibling tenant is suspended', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					suspendedTenant('t-2', 'Global'),
				],
				activeCount: 1,
				totalCount: 2,
				hasSuspendedTenants: true,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-workspace-placeholder')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('shows the picker list with 2+ active tenants, no suspended banner when none are suspended', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
				],
				activeCount: 2,
				totalCount: 2,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-picker')).toBeTruthy();
		expect(screen.getAllByTestId('tenant-portal-row')).toHaveLength(2);
		expect(screen.queryByTestId('tenant-portal-suspended-banner')).toBeNull();
	});

	test('shows the suspended banner and disables suspended rows when a suspended tenant is present', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
					suspendedTenant('t-3', 'Global'),
				],
				activeCount: 2,
				totalCount: 3,
				hasSuspendedTenants: true,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-suspended-banner')).toBeTruthy();

		const rows = screen.getAllByTestId('tenant-portal-row');
		expect(rows).toHaveLength(3);

		const suspendedRow = rows.find(
			(row) => row.getAttribute('data-tenant-id') === 't-3',
		);
		expect(suspendedRow?.tagName).toBe('DIV');
		expect(suspendedRow?.querySelector('button')).toBeNull();

		const activeRow = rows.find(
			(row) => row.getAttribute('data-tenant-id') === 't-1',
		);
		expect(activeRow?.tagName).toBe('BUTTON');
	});

	test('selecting an active tenant transitions from the list to the workspace', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
				],
				activeCount: 2,
				totalCount: 2,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);

		const rows = screen.getAllByTestId('tenant-portal-row');
		const firstRow = rows[0];
		if (!firstRow) {
			throw new Error('expected at least one tenant row');
		}
		fireEvent.click(firstRow);

		expect(screen.getByTestId('tenant-workspace-placeholder')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('wires the log-out button to useLogout', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
				],
				activeCount: 2,
				totalCount: 2,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);

		fireEvent.click(screen.getByTestId('tenant-portal-logout-button'));
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});
});
