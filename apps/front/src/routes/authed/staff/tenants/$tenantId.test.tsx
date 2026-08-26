/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	removeQueries: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	suspendTenantMutation: vi.fn(),
	reactivateTenantMutation: vi.fn(),
	deleteTenantMutation: vi.fn(),
	useSuspendStaffTenantMutation: vi.fn(),
	useReactivateStaffTenantMutation: vi.fn(),
	useDeleteStaffTenantMutation: vi.fn(),
	toStaffTenantUserRows: vi.fn(),
	useStaffTenantUsersQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
		removeQueries: mocks.removeQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
	}),
	Link: ({
		children,
		to,
		params,
		search,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
		search?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		if (search && Object.keys(search).length > 0) {
			href += `?${new URLSearchParams(search).toString()}`;
		}

		return createElement('a', { href, ...props }, children);
	},
}));

const TRANSLATIONS: TestLabelMap = {
	'back-to-staff-tenants': 'Back to staff tenants',
	edit: 'Edit',
	unknown: 'Unknown',
	'tenant-member-count': '{{count}} members',
	'since-date': 'Since {{date}}',
	members: 'Members',
	status: 'Status',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-pending': 'Pending',
	'status-globally-suspended': 'Globally suspended',
	'status-unknown': 'Unknown',
	admin: 'Admin',
	user: 'User',
	created: 'Created',
	updated: 'Updated',
	'seats-left': '{{count}} seats left',
	'tenant-status-helper-active': 'All members have access',
	'tenant-status-helper-suspended': 'Access is blocked for members',
	organization: 'Organization',
	name: 'Name',
	'legal-name': 'Legal name',
	code: 'Code',
	'tenant-id': 'Tenant ID',
	'last-active': 'Last active',
	website: 'Website',
	'minutes-ago': '{{count}} minutes ago',
	'hours-ago': '{{count}} hours ago',
	'days-ago': '{{count}} days ago',
	'months-ago': '{{count}} months ago',
	'years-ago': '{{count}} years ago',
	users: 'Users',
	'view-all': 'View all',
	'no-tenant-members': 'No members yet.',
	'tenant-users-preview-error': 'Unable to load members.',
	owners: 'Owners',
	'see-all': 'See all',
	'tenant-owner-count': '{{count}} owners',
	'pending-invites': 'Pending invites',
	'expire-soon': 'expire soon',
	'no-invites-expiring-soon': 'No invites expiring soon',
	profiles: 'Profiles',
	'view-profiles': 'View profiles',
	'owner-chip-label': 'Owner',
	'tenant-owners-preview-error': 'Unable to load owners.',
	'no-tenant-owners': 'No owners yet.',
	'danger-zone': 'Danger zone',
	'suspend-tenant': 'Suspend Tenant',
	'reactivate-tenant': 'Reactivate Tenant',
	'suspend-tenant-confirm': 'Are you sure you want to suspend "{{name}}"?',
	'reactivate-tenant-confirm':
		'Are you sure you want to reactivate "{{name}}"?',
	suspend: 'Suspend',
	reactivate: 'Reactivate',
	delete: 'Delete',
	'confirm-delete-tenant-title': 'Delete tenant',
	'confirm-delete-tenant-message':
		'Are you sure you want to delete this tenant?',
	'delete-tenant-disabled-until-suspended':
		'Suspend this tenant before deleting it.',
	'lifecycle-unavailable-title': 'Lifecycle actions unavailable',
	'lifecycle-unavailable-until-tenant-activates':
		'This tenant is Pending. Suspend and reactivate become available once its first owner accepts their invitation.',
	'unable-to-suspend-tenant': 'Unable to suspend this tenant.',
	'unable-to-reactivate-tenant': 'Unable to reactivate this tenant.',
	'unable-to-delete-tenant': 'Unable to delete this tenant.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (!options) {
				return text;
			}

			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
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

vi.mock('~/lib/query/staff-tenants', () => ({
	STAFF_TENANT_DETAILS_QUERY_KEY: ['staff-tenants', 'detail'],
	invalidateStaffTenants: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	useSuspendStaffTenantMutation: mocks.useSuspendStaffTenantMutation,
	useReactivateStaffTenantMutation: mocks.useReactivateStaffTenantMutation,
	useDeleteStaffTenantMutation: mocks.useDeleteStaffTenantMutation,
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	toStaffTenantUserRows: mocks.toStaffTenantUserRows,
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$tenantId';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const ACTIVE_TENANT = {
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	usersCount: 12,
	maxUsers: 50,
	ownersCount: 4,
	pendingInvitationsCount: 4,
	expiringSoonInvitationsCount: 2,
	profilesCount: 6,
	logoUrl: null,
	legalName: 'Acme Corporation, Inc.',
	websiteUrl: 'https://www.acme.example/',
	lastActivityAt: new Date('2020-06-01T09:00:00Z'),
	createdAt: new Date('2026-07-01T09:00:00Z'),
	updatedAt: new Date('2026-07-02T10:00:00Z'),
};

const SUSPENDED_TENANT = {
	...ACTIVE_TENANT,
	status: 'Suspended',
};

const PENDING_TENANT = {
	...ACTIVE_TENANT,
	status: 'Pending',
};

const renderPage = () => {
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff tenant details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: { tenantId: ACTIVE_TENANT.id },
			}),
		);
		mocks.toStaffTenantDetails.mockReturnValue(ACTIVE_TENANT);
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({ data: { data: [], nextCursor: null } }),
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
		cleanup();
	});

	test('renders the identity header, stat cards, organization card, and danger zone', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-details-page')).toBeTruthy();
		expect(
			screen.getByRole('heading', { name: 'Acme Corporation' }),
		).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);

		expect(
			within(screen.getByRole('banner'))
				.getByRole('link', { name: 'Edit' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/edit');

		const membersCard = screen.getByTestId('tenant-stat-members');
		expect(membersCard.textContent).toContain('12');
		expect(membersCard.textContent).toContain('50');

		const orgCard = screen.getByText('Organization').closest('section');
		expect(orgCard).toBeTruthy();
		expect(orgCard?.textContent).toContain('ACME');
		expect(orgCard?.textContent).toContain(ACTIVE_TENANT.id);
		expect(orgCard?.textContent).toContain('Acme Corporation, Inc.');
		expect(orgCard?.textContent).toMatch(/years ago/);
		expect(
			within(orgCard as HTMLElement).getByRole('link', {
				name: 'www.acme.example',
			}),
		).toHaveProperty('href', 'https://www.acme.example/');

		expect(screen.getByText('Danger zone')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy();
		const deleteButton = screen.getByRole('button', {
			name: 'Delete',
		}) as HTMLButtonElement;
		expect(deleteButton.disabled).toBe(true);
	});

	test('shows honest em-dash placeholders and omits the Website row when legal name, website, and last active are null', () => {
		mocks.toStaffTenantDetails.mockReturnValue({
			...ACTIVE_TENANT,
			legalName: null,
			websiteUrl: null,
			lastActivityAt: null,
		});

		renderPage();

		const orgCard = screen.getByText('Organization').closest('section');
		expect(orgCard).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'www.acme.example' })).toBeNull();

		const legalNameLabel = within(orgCard as HTMLElement).getByText(
			'Legal name',
		);
		expect(legalNameLabel.parentElement?.textContent).toContain('—');

		const lastActiveLabel = within(orgCard as HTMLElement).getByText(
			'Last active',
		);
		expect(lastActiveLabel.parentElement?.textContent).toContain('—');
	});

	test('renders no website link for a non-http(s) websiteUrl (r3-tenants-F3)', () => {
		mocks.toStaffTenantDetails.mockReturnValue({
			...ACTIVE_TENANT,
			websiteUrl: 'javascript://evil.com/%0aalert(1)',
		});

		renderPage();

		expect(screen.queryByText('Website')).toBeNull();
		expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
	});

	test('renders the owners, pending invites, and profiles stat cards from the new detail counts', () => {
		renderPage();

		const ownersCard = screen.getByTestId('tenant-stat-owners');
		expect(ownersCard.textContent).toContain('4');

		const invitesCard = screen.getByTestId('tenant-stat-invites');
		expect(invitesCard.textContent).toContain('4');
		expect(invitesCard.textContent).toContain('2');
		expect(invitesCard.textContent).toContain('expire soon');

		const profilesCard = screen.getByTestId('tenant-stat-profiles');
		expect(profilesCard.textContent).toContain('6');
		expect(
			within(profilesCard)
				.getByRole('link', { name: 'View profiles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
	});

	test('shows a muted line instead of the amber chip when no invites are expiring soon', () => {
		mocks.toStaffTenantDetails.mockReturnValue({
			...ACTIVE_TENANT,
			expiringSoonInvitationsCount: 0,
		});

		renderPage();

		const invitesCard = screen.getByTestId('tenant-stat-invites');
		expect(invitesCard.textContent).toContain('No invites expiring soon');
	});

	test('renders up to 5 owners in the Owners card, with a See all link filtered to admins', () => {
		mocks.useStaffTenantUsersQuery.mockImplementation(
			(variables: { level?: string }) =>
				variables.level === 'admin'
					? buildQueryResult({
							data: { data: ['owner-item'], nextCursor: null },
						})
					: buildQueryResult({ data: { data: [], nextCursor: null } }),
		);
		mocks.toStaffTenantUserRows.mockImplementation((items: unknown[]) =>
			items?.[0] === 'owner-item'
				? [
						{
							id: 'owner-1',
							displayName: 'Maya Chen',
							email: 'maya.chen@example.com',
							level: 'Admin',
							status: 'Active',
						},
					]
				: [],
		);

		renderPage();

		const ownersRows = screen.getByTestId('tenant-owners-rows');
		expect(within(ownersRows).getByText('Maya Chen')).toBeTruthy();
		expect(within(ownersRows).getByText('maya.chen@example.com')).toBeTruthy();
		expect(within(ownersRows).getByText('Owner')).toBeTruthy();

		expect(
			screen.getByRole('link', { name: 'See all' }).getAttribute('href'),
		).toBe(
			'/staff/tenants/11111111-1111-1111-1111-111111111111/users?level=admin',
		);
	});

	test('renders the Owners card empty state when there are no owner rows', () => {
		renderPage();

		expect(screen.getByText('No owners yet.')).toBeTruthy();
	});

	test('swaps the lifecycle row to Reactivate and enables Delete when the tenant is suspended', () => {
		mocks.toStaffTenantDetails.mockReturnValue(SUSPENDED_TENANT);
		renderPage();

		expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();

		const deleteButton = screen.getByRole('button', {
			name: 'Delete',
		}) as HTMLButtonElement;
		expect(deleteButton.disabled).toBe(false);
	});

	test('renders the lifecycle row as unavailable (not a broken Reactivate) for a Pending tenant', () => {
		mocks.toStaffTenantDetails.mockReturnValue(PENDING_TENANT);
		renderPage();

		expect(screen.getByText('Lifecycle actions unavailable')).toBeTruthy();
		expect(screen.queryByText('Reactivate Tenant')).toBeNull();
		expect(screen.queryByText('Suspend Tenant')).toBeNull();

		const lifecycleButton = screen.getByRole('button', {
			name: 'Reactivate',
		}) as HTMLButtonElement;
		expect(lifecycleButton.disabled).toBe(true);
		expect(lifecycleButton.title).toBe(
			'This tenant is Pending. Suspend and reactivate become available once its first owner accepts their invitation.',
		);

		const deleteButton = screen.getByRole('button', {
			name: 'Delete',
		}) as HTMLButtonElement;
		expect(deleteButton.disabled).toBe(true);
	});

	test('confirming Suspend calls the suspend mutation and invalidates tenant queries', async () => {
		mocks.suspendTenantMutation.mockResolvedValue(undefined);
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));

		await waitFor(() => {
			expect(mocks.suspendTenantMutation).toHaveBeenCalledWith({
				tenantId: ACTIVE_TENANT.id,
			});
		});
		expect(mocks.invalidateQueries).toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	test('leaves lifecycle failures to central mutation feedback without a local alert', async () => {
		mocks.suspendTenantMutation.mockRejectedValue({
			status: 400,
			responseStatusCode: 400,
			title: 'Invalid tenant',
			detail: 'This tenant cannot be suspended.',
		});
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));

		await waitFor(() => expect(mocks.suspendTenantMutation).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText('This tenant cannot be suspended.')).toBeNull();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('confirming Delete calls the delete mutation and navigates back to the tenants list', async () => {
		mocks.toStaffTenantDetails.mockReturnValue(SUSPENDED_TENANT);
		mocks.deleteTenantMutation.mockResolvedValue(undefined);
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		await waitFor(() => {
			expect(mocks.deleteTenantMutation).toHaveBeenCalledWith({
				tenantId: SUSPENDED_TENANT.id,
			});
		});
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({ to: '/staff/tenants' });
		});
		expect(mocks.removeQueries).toHaveBeenCalled();
	});

	test('renders the not-found view for 400 malformed-id failures', () => {
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

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
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

	test('renders a local not found view for 404 failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Missing tenant',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the failure should invalidate the session', () => {
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
