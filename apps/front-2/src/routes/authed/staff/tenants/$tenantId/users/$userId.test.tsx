/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toStaffTenantDetails: vi.fn(),
	toStaffTenantUserDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	useStaffTenantUserDetailsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		}),
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
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: ({
		testId,
		title,
		description,
		code,
	}: {
		testId: string;
		title: string;
		description: string;
		code: string;
	}) => (
		<div data-testid={testId}>
			<div>{code}</div>
			<div>{title}</div>
			<div>{description}</div>
		</div>
	),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	toStaffTenantUserDetails: mocks.toStaffTenantUserDetails,
	useStaffTenantUserDetailsQuery: mocks.useStaffTenantUserDetailsQuery,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId';

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

describe('staff tenant user details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				},
			}),
		);
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
		mocks.toStaffTenantUserDetails.mockReturnValue({
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'Active',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Alex User',
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders a read-only tenant user details page with shell navigation', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-user-details-page')).toBeTruthy();
		expect(screen.getByText('Alex User')).toBeTruthy();
		expect(screen.getByText('Back to users')).toBeTruthy();
		expect(screen.getByText('Edit tenant user')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Back to users' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users');
		expect(
			screen
				.getByRole('link', { name: 'Edit tenant user' })
				.getAttribute('href'),
		).toBe(
			'/staff/tenants/11111111-1111-1111-1111-111111111111/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/edit',
		);
		expect(screen.getAllByText('alex@example.com').length).toBeGreaterThan(0);
		expect(screen.getByText('Account level')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getByText('Tenant ID')).toBeTruthy();
		expect(
			screen.getByText('11111111-1111-1111-1111-111111111111'),
		).toBeTruthy();
		expect(screen.getByText('Created')).toBeTruthy();
		expect(screen.getByText('Updated')).toBeTruthy();
	});

	test('renders a local malformed id view without logging out', () => {
		mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid userId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-user-details-invalid'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test.each([
		{
			name: '403',
			error: {
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'Forbidden',
			},
			errorViewTestId: 'forbidden-view',
		},
		{
			name: '404',
			error: {
				status: 404,
				responseStatusCode: 404,
				title: 'Not Found',
				detail: 'Missing user',
			},
			errorViewTestId: 'staff-tenant-user-details-not-found',
		},
		{
			name: '500',
			error: {
				status: 500,
				responseStatusCode: 500,
				title: 'Server Error',
				detail: 'Unexpected failure',
			},
			errorViewTestId: 'staff-tenant-user-details-error',
		},
	])(
		'renders a local non-auth failure for $name without logging out',
		({ error, errorViewTestId }) => {
			mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
				buildQueryResult({
					error,
					isError: true,
				}),
			);

			renderPage();

			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(screen.getByTestId(errorViewTestId)).toBeTruthy();
		},
	);

	test('renders not found view when the details payload cannot be normalized', () => {
		mocks.toStaffTenantUserDetails.mockReturnValue(null);

		renderPage();

		expect(screen.getByTestId('staff-tenant-user-details-empty')).toBeTruthy();
	});

	test('redirects to logout only when tenant user details query returns 401', () => {
		mocks.useStaffTenantUserDetailsQuery.mockReturnValue(
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

	test('redirects to logout on tenant shell auth failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
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
