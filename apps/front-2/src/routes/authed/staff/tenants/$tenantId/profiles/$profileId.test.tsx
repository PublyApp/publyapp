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

const originalConfirm = globalThis.confirm;

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	queryClient: {
		invalidateQueries: vi.fn().mockResolvedValue(undefined),
	},
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	useStaffTenantProfilePermissionKeysQuery: vi.fn(),
	toStaffTenantProfilePermissionKeys: vi.fn(),
	useDeleteStaffTenantProfileMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
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

vi.mock('@tanstack/react-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
		'@tanstack/react-query',
	);

	return {
		...actual,
		useQueryClient: () => mocks.queryClient,
	};
});

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	STAFF_TENANT_PROFILES_QUERY_KEY: ['staff', 'staff-tenants', 'profiles'],
	STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY: [
		'staff',
		'staff-tenants',
		'profiles',
		'detail',
	],
	STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY: [
		'staff',
		'staff-tenants',
		'profiles',
		'permission-keys',
	],
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
	useStaffTenantProfilePermissionKeysQuery:
		mocks.useStaffTenantProfilePermissionKeysQuery,
	toStaffTenantProfilePermissionKeys: mocks.toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation:
		mocks.useDeleteStaffTenantProfileMutation,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$profileId';

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

describe('staff tenant profile details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.confirm = vi.fn(() => true);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue({
				key: 'tenant-profile-deleted-success',
				message: 'Tenant profile deleted successfully',
			}),
		});
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
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
		});
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					profile: {
						id: '22222222-2222-2222-2222-222222222222',
					},
				},
			}),
		);
		mocks.toStaffTenantProfilePermissionKeys.mockReturnValue([
			'tenant.approvals.review',
			'tenant.users.read',
		]);
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				data: {
					permissionKeys: ['tenant.approvals.review', 'tenant.users.read'],
				},
			}),
		);
	});

	afterEach(() => {
		globalThis.confirm = originalConfirm;
		cleanup();
	});

	test('renders the tenant shell, profile details, and permission keys', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-page'),
		).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByText('Profiles', { selector: 'span[aria-current=\"page\"]' }),
		).toBeTruthy();
		expect(screen.getAllByText('Approvers').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Can review approvals').length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
		expect(screen.getByText('7')).toBeTruthy();
		expect(screen.getByText('tenant.approvals.review')).toBeTruthy();
		expect(screen.getByText('tenant.users.read')).toBeTruthy();
		expect(
			screen
				.getByRole('link', { name: 'Back to profiles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		expect(mocks.useStaffTenantProfileDetailsQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
		expect(mocks.useStaffTenantProfilePermissionKeysQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
	});

	test('confirms deletion, invalidates tenant profile queries, and navigates back to the list', async () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		});
		const mutateAsync = vi.fn().mockResolvedValue({
			key: 'tenant-profile-deleted-success',
			message: 'Tenant profile deleted successfully',
		});
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync,
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));

		expect(globalThis.confirm).toHaveBeenCalledWith(
			'Delete this tenant profile?',
		);
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			});
		});
		await waitFor(() => {
			expect(mocks.queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: ['staff', 'staff-tenants', 'profiles'],
			});
			expect(mocks.queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: ['staff', 'staff-tenants', 'profiles', 'detail'],
			});
			expect(mocks.queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, {
				queryKey: ['staff', 'staff-tenants', 'profiles', 'permission-keys'],
			});
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/profiles',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			});
		});
	});

	test('surfaces default profile delete failures locally without logging out', async () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		});
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockRejectedValue({
				status: 400,
				responseStatusCode: 400,
				title: 'Bad Request',
				detail: 'Default tenant profile cannot be deleted',
				translationKey: 'tenant-profile-default-delete-not-allowed',
			}),
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));

		expect(
			await screen.findByText('Default tenant profile cannot be deleted'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('disables the delete path for default profiles', () => {
		renderPage();

		expect(
			screen.getByText('Default profiles cannot be deleted.'),
		).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Delete profile' })).toBeNull();
	});

	test('renders a local malformed id view without logging out', () => {
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid profileId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-invalid'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
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

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders not found without logging out for 404 failures', () => {
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Profile missing',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local error view without logging out for ordinary problem failures', () => {
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
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

		expect(
			screen.getByTestId('staff-tenant-profile-details-error'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when a detail failure should invalidate the session', () => {
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
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
