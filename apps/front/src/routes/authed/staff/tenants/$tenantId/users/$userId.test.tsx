/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	suspendTenantUserMutation: vi.fn(),
	reactivateTenantUserMutation: vi.fn(),
	removeTenantUserMutation: vi.fn(),
	navigate: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	toStaffTenantUserDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	useStaffTenantUserDetailsQuery: vi.fn(),
	useSuspendStaffTenantUserMutation: vi.fn(),
	useReactivateStaffTenantUserMutation: vi.fn(),
	useRemoveStaffTenantUserMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	displayLocalMutationFailure: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
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

const TRANSLATIONS: TestLabelMap = {
	'back-to-users': 'Back to users',
	'edit-tenant-user': 'Edit tenant user',
	'account-level': 'Account level',
	'tenant-id': 'Tenant ID',
	created: 'Created',
	updated: 'Updated',
	suspend: 'Suspend',
	reactivate: 'Reactivate',
	remove: 'Remove',
	'remove-from-tenant': 'Remove from tenant',
	status: 'Status',
	email: 'Email',
	'avatar-url': 'Avatar URL',
	'user-id': 'User ID',
	activity: 'Activity',
	'no-email-available': 'No email address available.',
	'tenant-membership-status': 'Tenant membership status',
	'tenant-user-removal': 'Tenant user removal',
	'remove-user-from-tenant-description': 'Remove this user from this tenant.',
	'remove-tenant-user-confirm-title': 'Remove tenant user',
	'remove-tenant-user-confirm-description':
		'This will permanently remove this user from the tenant. The user will lose access to this tenant and its projects.',
	'membership-lifecycle-disabled-globally-suspended':
		'Membership lifecycle actions are disabled for globally suspended users.',
	'membership-lifecycle-unavailable-status':
		'Membership lifecycle actions are unavailable for this status.',
	'tenant-user-activity-description':
		'Read-only activity timestamps for this tenant user.',
	'tenant-user-no-timestamps':
		'No timestamps are available for this tenant user yet.',
	'unable-to-update-tenant-user-membership':
		'Unable to update tenant user membership status.',
	'unable-to-remove-tenant-user':
		'Unable to remove this tenant user from the tenant.',
	'error-404-code': '404 — Not Found',
	'error-500-code': '500 — Server Error',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
	'tenant-user-not-found-title': 'Tenant user not found',
	'tenant-user-not-found-description':
		'This tenant user does not exist, or you no longer have access to this tenant-user identity.',
	'tenant-user-payload-empty': 'The tenant user payload was empty.',
	'unable-to-load-tenant-user': 'Unable to load this tenant user',
	'tenant-user-load-error-description':
		'There was a problem loading the tenant user details.',
	'loading-tenant-user': 'Loading tenant user…',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-globally-suspended': 'Globally suspended',
	'status-unknown': 'Unknown',
	admin: 'Admin',
	user: 'User',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => TRANSLATIONS[key] ?? key,
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
	useSuspendStaffTenantUserMutation: mocks.useSuspendStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation:
		mocks.useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation: mocks.useRemoveStaffTenantUserMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	invalidateAllStaffTenantScopes: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
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
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff tenant user details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useSuspendStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.suspendTenantUserMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.reactivateTenantUserMutation,
			isPending: false,
		});
		mocks.useRemoveStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.removeTenantUserMutation,
			isPending: false,
		});
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

	test('renders the not-found view without logging out for a malformed id', () => {
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
			screen.getByTestId('staff-tenant-user-details-not-found'),
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

	test('renders a suspend action for an active tenant user and invalidates tenant data on success', async () => {
		mocks.suspendTenantUserMutation.mockResolvedValue({ status: 'suspended' });

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(mocks.suspendTenantUserMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(screen.getByText('Suspend')).toBeTruthy();
	});

	test('renders a reactivate action for suspended tenant users and invalidates tenant data on success', async () => {
		mocks.toStaffTenantUserDetails.mockReturnValue({
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'suspended',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Alex User',
		});
		mocks.reactivateTenantUserMutation.mockResolvedValue({ status: 'active' });

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

		await waitFor(() =>
			expect(mocks.reactivateTenantUserMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(screen.getByText('Reactivate')).toBeTruthy();
	});

	test('hides membership actions for unknown tenant user statuses', () => {
		mocks.toStaffTenantUserDetails.mockReturnValue({
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'pending-review',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Alex User',
		});

		renderPage();

		expect(
			screen.getByText(
				'Membership lifecycle actions are unavailable for this status.',
			),
		).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
	});

	test('renders a remove-from-tenant action and keeps it for all user statuses', () => {
		renderPage();

		expect(
			screen.getByRole('button', { name: /Remove from tenant/i }),
		).toBeTruthy();
	});

	test('requires explicit confirmation before removing a tenant user', async () => {
		mocks.removeTenantUserMutation.mockResolvedValue({
			key: 'tenant-user-removed-success',
			message: 'Tenant user removed from tenant',
		});

		renderPage();

		fireEvent.click(
			screen.getByRole('button', { name: /Remove from tenant/i }),
		);

		await waitFor(() =>
			expect(screen.getByText('Remove tenant user')).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

		await waitFor(() =>
			expect(mocks.removeTenantUserMutation).not.toHaveBeenCalled(),
		);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('removes user from tenant, invalidates tenant data, and navigates back to users list', async () => {
		mocks.removeTenantUserMutation.mockResolvedValue({
			key: 'tenant-user-removed-success',
			message: 'Tenant user removed from tenant',
		});

		renderPage();

		fireEvent.click(
			screen.getByRole('button', { name: /Remove from tenant/i }),
		);

		await waitFor(() =>
			expect(screen.getByText('Remove tenant user')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Remove' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.removeTenantUserMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/staff/tenants/$tenantId/users',
			params: {
				tenantId: '11111111-1111-1111-1111-111111111111',
			},
		});
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test.each([
		['400', 'Tenant cannot be removed'],
		['409', 'Tenant user not in tenant'],
		['422', 'Validation failed'],
	])(
		'leaves remove action %s failures to central feedback',
		async (status, message) => {
			mocks.removeTenantUserMutation.mockRejectedValue({
				kind: 'problem',
				status: Number(status),
				responseStatusCode: Number(status),
				title: message,
				detail: message,
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('button', { name: /Remove from tenant/i }),
			);

			await waitFor(() =>
				expect(screen.getByText('Remove tenant user')).toBeTruthy(),
			);
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Remove' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(mocks.removeTenantUserMutation).toHaveBeenCalledTimes(1),
			);
			expect(screen.queryByText(message)).toBeNull();
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
			expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
			expect(mocks.toastSuccess).not.toHaveBeenCalled();
		},
	);

	test('redirects to logout only when remove action fails with 401', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.removeTenantUserMutation.mockRejectedValue({
			kind: 'problem',
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});

		renderPage();

		fireEvent.click(
			screen.getByRole('button', { name: /Remove from tenant/i }),
		);

		await waitFor(() =>
			expect(screen.getByText('Remove tenant user')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Remove' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.removeTenantUserMutation).toHaveBeenCalledTimes(1),
		);
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test.each([
		[400, 'Bad request'],
		[409, 'Membership already suspended'],
		[422, 'Validation failed'],
	])(
		'leaves non-401 action failures to central feedback (%i)',
		async (status, message) => {
			mocks.suspendTenantUserMutation.mockRejectedValue({
				kind: 'problem',
				status,
				responseStatusCode: status,
				title: message,
				detail: message,
			});

			renderPage();

			fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

			await waitFor(() =>
				expect(mocks.suspendTenantUserMutation).toHaveBeenCalledTimes(1),
			);
			expect(screen.queryByText(message)).toBeNull();
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
			expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
			expect(mocks.toastSuccess).not.toHaveBeenCalled();
		},
	);

	test('redirects to logout only when membership action fails with 401', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.suspendTenantUserMutation.mockRejectedValue({
			kind: 'problem',
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(mocks.suspendTenantUserMutation).toHaveBeenCalledTimes(1),
		);
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
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
