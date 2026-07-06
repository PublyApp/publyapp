/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	toStaffTenantRows: vi.fn(),
	useStaffTenantsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
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
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantRows: mocks.toStaffTenantRows,
	useStaffTenantsQuery: mocks.useStaffTenantsQuery,
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
	});

	afterEach(() => {
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
		expect(screen.getByDisplayValue('')).toBeTruthy();
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
});
