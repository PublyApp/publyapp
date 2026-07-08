/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const originalConfirm = globalThis.confirm;

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	toStaffTenantRows: vi.fn(),
	useStaffTenantsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	suspendTenantMutation: vi.fn(),
	reactivateTenantMutation: vi.fn(),
	deleteTenantMutation: vi.fn(),
	useSuspendStaffTenantMutation: vi.fn(),
	useReactivateStaffTenantMutation: vi.fn(),
	useDeleteStaffTenantMutation: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useSearch: () => mocks.search,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'new-item' && typeof options?.item === 'string') {
				return `New ${options.item}`;
			}

			const labels: Record<string, string> = {
				tenant: 'Tenant',
			};

			return labels[key] ?? key;
		},
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantRows: mocks.toStaffTenantRows,
	useStaffTenantsQuery: mocks.useStaffTenantsQuery,
	STAFF_TENANTS_QUERY_KEY: ['staff-tenants'],
	STAFF_TENANT_DETAILS_QUERY_KEY: ['staff-tenants', 'detail'],
	useSuspendStaffTenantMutation: mocks.useSuspendStaffTenantMutation,
	useReactivateStaffTenantMutation: mocks.useReactivateStaffTenantMutation,
	useDeleteStaffTenantMutation: mocks.useDeleteStaffTenantMutation,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './tenants';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff tenants route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		globalThis.confirm = vi.fn(() => true);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.toStaffTenantRows.mockReturnValue([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
		]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Active',
							usersCount: 12,
							maxUsers: 50,
						},
					],
					nextCursor: null,
				},
			}),
		);
		mocks.useSuspendStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.suspendTenantMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.reactivateTenantMutation,
			isPending: false,
		});
		mocks.useDeleteStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.deleteTenantMutation,
			isPending: false,
		});
	});

	afterEach(() => {
		globalThis.confirm = originalConfirm;

		cleanup();
	});

	test('renders tenant rows and uses the default table query state', () => {
		renderPage();

		expect(screen.getByText('Tenants')).toBeTruthy();
		expect(screen.getByTestId('staff-tenants-table-rows')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(screen.getByText('Active')).toBeTruthy();
		expect(screen.getByText('12')).toBeTruthy();
		expect(screen.getAllByText('50').length).toBeGreaterThan(0);
		expect(screen.getByTestId('staff-tenants-table-page-size')).toBeTruthy();
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
		});
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'acme' };
		mocks.toStaffTenantRows.mockReturnValue([]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenants-table-no-match')).toBeTruthy();
		expect(screen.getByText('No tenants match your search.')).toBeTruthy();
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: 'acme',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
		});
	});

	test('renders the table error state without logging out for non-401 failures', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);
		mocks.toStaffTenantRows.mockReturnValue([]);

		renderPage();

		expect(screen.getByTestId('staff-tenants-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the failure should invalidate the session', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Session expired',
				},
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.toStaffTenantRows.mockReturnValue([]);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('renders a suspend action for active tenants', () => {
		renderPage();

		expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	test('renders reactivate and delete actions for suspended tenants', () => {
		mocks.toStaffTenantRows.mockReturnValue([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Suspended',
				usersCount: 12,
				maxUsers: 50,
			},
		]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Suspended',
							usersCount: 12,
							maxUsers: 50,
						},
					],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
	});

	test('requires explicit confirmation before suspending a tenant', async () => {
		globalThis.confirm = vi.fn(() => false);
		mocks.suspendTenantMutation.mockResolvedValue({});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		expect(globalThis.confirm).toHaveBeenCalledWith('Suspend this tenant?');
		await waitFor(() =>
			expect(mocks.suspendTenantMutation).not.toHaveBeenCalled(),
		);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('performs suspend action for active tenants and refreshes tenant list and detail data', async () => {
		mocks.suspendTenantMutation.mockResolvedValue({
			status: 'Suspended',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(mocks.suspendTenantMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: ['staff', 'staff-tenants', 'detail'],
			}),
		);
	});

	test('shows a local non-auth error when a tenant action fails with 400', async () => {
		mocks.suspendTenantMutation.mockRejectedValue({
			kind: 'problem',
			status: 400,
			responseStatusCode: 400,
			title: 'Invalid tenant',
			detail: 'Invalid tenant',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(screen.getByText('Invalid tenant')).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('redirects to logout when a tenant action fails with 401', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.suspendTenantMutation.mockRejectedValue({
			kind: 'problem',
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});
});
