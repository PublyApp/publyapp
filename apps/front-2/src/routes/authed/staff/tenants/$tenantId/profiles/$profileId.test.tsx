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

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	queryClient: {
		invalidateQueries: vi.fn().mockResolvedValue(undefined),
	},
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	buildStaffTenantPermissionCatalogOptions: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	useStaffTenantProfilePermissionKeysQuery: vi.fn(),
	toStaffTenantProfilePermissionKeys: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useDeleteStaffTenantProfileMutation: vi.fn(),
	useAssignStaffTenantProfilePermissionMutation: vi.fn(),
	useUnassignStaffTenantProfilePermissionMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
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
	buildStaffTenantPermissionCatalogOptions:
		mocks.buildStaffTenantPermissionCatalogOptions,
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
	useStaffTenantProfilePermissionKeysQuery:
		mocks.useStaffTenantProfilePermissionKeysQuery,
	toStaffTenantProfilePermissionKeys: mocks.toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation:
		mocks.useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery:
		mocks.useStaffTenantPermissionCatalogQuery,
	useAssignStaffTenantProfilePermissionMutation:
		mocks.useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation:
		mocks.useUnassignStaffTenantProfilePermissionMutation,
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
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue(
			buildQueryResult({
				data: {
					additionalData: {
						tenant: {
							'tenant.approvals.review': {
								key: 'tenant.approvals.review',
								name: 'Review approvals',
								description: 'Review tenant approver workflows',
							},
							'tenant.users.read': {
								key: 'tenant.users.read',
								name: 'Read users',
								description: 'Read tenant users',
							},
							'tenant.users.write': {
								key: 'tenant.users.write',
								name: 'Write users',
								description: 'Write tenant users',
							},
						},
					},
				},
			}),
		);
		mocks.buildStaffTenantPermissionCatalogOptions.mockImplementation(
			(
				additionalData: Record<
					string,
					Record<string, { key?: string; description?: string | null }>
				>,
			) => {
				const options: Array<{
					key: string;
					description: string | null;
					label: string;
				}> = [];

				for (const modulePermissions of Object.values(additionalData)) {
					if (typeof modulePermissions !== 'object' || !modulePermissions) {
						continue;
					}

					for (const permission of Object.values(modulePermissions)) {
						if (!permission || typeof permission !== 'object') {
							continue;
						}

						const key = (permission as { key?: string }).key?.trim() ?? '';

						if (!key) {
							continue;
						}

						options.push({
							key,
							label: key,
							description:
								(permission as { description?: string | null })?.description ??
								null,
						});
					}
				}

				return options.sort((left, right) =>
					left.label.localeCompare(right.label),
				);
			},
		);
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
		mocks.useUnassignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
	});

	afterEach(() => {
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
		expect(screen.getByText('tenant.users.write')).toBeTruthy();
		expect(screen.getByText('Assigned')).toBeTruthy();
		expect(screen.getByText('Available')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: /Unassign tenant.approvals.review/ }),
		).toBeTruthy();
		expect(
			screen.getByRole('button', { name: /Assign tenant.users.write/ }),
		).toBeTruthy();
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
		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenCalledWith({});
	});

	test('assigns a permission key and invalidates permission-backed queries', async () => {
		const assignPermission = vi.fn().mockResolvedValue(undefined);
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: assignPermission,
		});
		renderPage();

		fireEvent.click(
			screen.getByRole('button', {
				name: /Assign tenant.users.write/,
			}),
		);

		await waitFor(() => {
			expect(assignPermission).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
				permissionKey: 'tenant.users.write',
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
		});
	});

	test('unassigns a permission key and invalidates permission-backed queries', async () => {
		const unassignPermission = vi.fn().mockResolvedValue(undefined);
		mocks.useUnassignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: unassignPermission,
		});
		renderPage();

		fireEvent.click(
			screen.getByRole('button', {
				name: /Unassign tenant.approvals.review/,
			}),
		);

		await waitFor(() => {
			expect(unassignPermission).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
				permissionKey: 'tenant.approvals.review',
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
		});
	});

	test('renders permission operation failures locally without logging out', async () => {
		const assignPermission = vi.fn().mockRejectedValue({
			status: 400,
			responseStatusCode: 400,
			title: 'Bad Request',
			detail: 'Unable to add this permission',
		});
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: assignPermission,
		});

		renderPage();

		fireEvent.click(
			screen.getByRole('button', {
				name: /Assign tenant.users.write/,
			}),
		);

		expect(
			await screen.findByText('Unable to add this permission'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout for permission assignment session errors', async () => {
		const assignPermission = vi.fn().mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: assignPermission,
		});
		mocks.shouldLogoutForFailure.mockImplementation((error: unknown) => {
			if (typeof error !== 'object' || error === null) {
				return false;
			}

			const responseStatusCode =
				typeof (error as { status?: unknown }).status === 'number'
					? (error as { status?: number }).status
					: undefined;
			const statusCode =
				typeof (error as { responseStatusCode?: unknown })
					.responseStatusCode === 'number'
					? (error as { responseStatusCode?: number }).responseStatusCode
					: undefined;

			return (responseStatusCode ?? statusCode) === 401;
		});

		renderPage();

		fireEvent.click(
			screen.getByRole('button', {
				name: /Assign tenant.users.write/,
			}),
		);

		await waitFor(() => {
			expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		});
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

		await waitFor(() =>
			expect(screen.getByText('Delete tenant profile')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
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

		await waitFor(() =>
			expect(screen.getByText('Delete tenant profile')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

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

	test('renders the not-found view without logging out for a malformed id', () => {
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
			screen.getByTestId('staff-tenant-profile-details-not-found'),
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
