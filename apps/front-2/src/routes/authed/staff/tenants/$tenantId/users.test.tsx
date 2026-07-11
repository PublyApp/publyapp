/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantUserRows: vi.fn(),
	useStaffTenantUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	toStaffTenantUserRows: mocks.toStaffTenantUserRows,
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { makeTenantUserColumns, Route } from './users';

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

describe('staff tenant users route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.toStaffTenantUserRows.mockReturnValue([
			{
				id: 'user-1',
				displayName: 'Alex Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				firstName: 'Alex',
				lastName: 'Johnson',
				avatarUrl: null,
			},
		]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'user-1',
							firstName: 'Alex',
							lastName: 'Johnson',
							email: 'alex@example.com',
							level: 'Admin',
							status: 'Active',
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

	test('renders the shared tenant shell with users active and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-users-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Alex Johnson' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users/user-1');
		expect(
			screen.getByText('Users', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		expect(screen.getByText('Alex Johnson')).toBeTruthy();
		expect(screen.getByText('alex@example.com')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('link', { name: 'Profiles' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'alex' };
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-users-table-no-match'),
		).toBeTruthy();
		expect(screen.getByText('No tenant users match your search.')).toBeTruthy();
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid tenantId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('keeps the user on the page for 403 query failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

		renderPage();

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the table error state without logging out for ordinary problem failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Unexpected failure',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout only when the tenant users query returns a 401 auth failure', () => {
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});

describe('makeTenantUserColumns column widths', () => {
	test('applies a fixed width to every column except the fluid email column', () => {
		const columns = makeTenantUserColumns(
			'11111111-1111-1111-1111-111111111111',
		);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: '200px',
			email: undefined,
			level: '104px',
			status: '122px',
		});
	});
});
