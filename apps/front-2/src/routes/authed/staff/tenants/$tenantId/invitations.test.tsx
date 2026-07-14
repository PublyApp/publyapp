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
	invalidateQueries: vi.fn(),
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	tenantId: '11111111-1111-1111-1111-111111111111',
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantInvitationRows: vi.fn(),
	useStaffTenantInvitationsQuery: vi.fn(),
	useRevokeStaffTenantInvitationMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
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
		useParams: () => ({
			tenantId: mocks.tenantId,
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		children,
		to,
		params,
		search,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
		search?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		const query = new URLSearchParams(search ?? {}).toString();
		if (query.length > 0) {
			href = `${href}?${query}`;
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const TRANSLATIONS: Record<string, string> = {
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	'pending-invitations': 'Pending invitations',
	'tenant-invitations-tab-description':
		"People invited to this workspace who haven't joined yet.",
	'invite-people': 'Invite people',
	invitee: 'Invitee',
	'invited-by': 'Invited by',
	expires: 'Expires',
	status: 'Status',
	actions: 'Actions',
	revoke: 'Revoke',
	'revoke-invitation': 'Revoke invitation',
	'revoke-invitation-confirm-description':
		'This will revoke the invitation. The invited user will no longer be able to accept it.',
	'actions-for': 'Actions for {{name}}',
	invitation: 'Invitation',
	'tenant-invitations-table-aria-label': 'Tenant invitations',
	'error-500-code': '500 — Server Error',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
	'staff-revoke': 'Revoke',
	'revoke-invitation-success': 'Invitation revoked.',
	'all-statuses': 'All statuses',
	pending: 'Pending',
	accepted: 'Accepted',
	expired: 'Expired',
	revoked: 'Revoked',
	'status-unknown': 'Unknown',
	clear: 'Clear',
	'search-invitations': 'Search invitations',
	'tenant-invitations-empty-title': 'No pending invitations',
	'tenant-invitations-empty-description':
		'Invite people to this workspace and track their invitations here.',
	'tenant-invitations-no-match-title': 'No invitations match your search',
	'tenant-invitations-no-match-description':
		'Try a different name, email, or filter.',
	'invitations-pending-count-chip': '{{count}} pending',
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

vi.mock('~/lib/query/staff-tenant-invitations', () => ({
	isStaffTenantInvitationRevocable: (row: { status: string | null }) =>
		row.status?.trim().toLowerCase() === 'pending',
	toStaffTenantInvitationRows: mocks.toStaffTenantInvitationRows,
	useStaffTenantInvitationsQuery: mocks.useStaffTenantInvitationsQuery,
	useRevokeStaffTenantInvitationMutation:
		mocks.useRevokeStaffTenantInvitationMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { createColumns, isInvitationExpiringSoon, Route } from './invitations';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const getRouteComponent = () =>
	(
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

const renderPage = () => {
	const Component = getRouteComponent();
	return render(<Component />);
};

describe('staff tenant invitations route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.tenantId = '11111111-1111-1111-1111-111111111111';
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useRevokeStaffTenantInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			pendingInvitationsCount: 3,
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
		mocks.toStaffTenantInvitationRows.mockReturnValue([
			{
				id: 'invite-1',
				email: 'alex@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: 'Approvers',
				invitedByName: 'Taylor Smith',
				acceptedAt: null,
				createdAt: new Date('2026-07-01T09:00:00Z'),
				expiresAt: new Date('2026-07-07T09:00:00Z'),
			},
		]);
		mocks.useStaffTenantInvitationsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'invite-1',
							email: 'alex@example.com',
							status: 'Pending',
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

	test('renders the shared tenant shell with invitations active and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-invitations-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByText('Invitations', {
				selector: 'span[aria-current="page"]',
			}),
		).toBeTruthy();
		expect(screen.getByRole('heading', { name: /^Invitations/ })).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Basics' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111');
		expect(
			screen.getByRole('link', { name: 'Profiles' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		expect(
			screen.getByRole('link', { name: 'Users' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users');
		expect(
			screen.getByRole('link', { name: 'Invite people' }).getAttribute('href'),
		).toBe(
			'/staff/tenants/11111111-1111-1111-1111-111111111111/users?invite=1',
		);
		expect(screen.getByText('alex@example.com')).toBeTruthy();
		expect(screen.getByText('Approvers')).toBeTruthy();
		expect(screen.getByText('Taylor Smith')).toBeTruthy();
		expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
		expect(mocks.useStaffTenantInvitationsQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				status: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('shows the honest pending-invitations count next to the tab title, labelled as pending', () => {
		renderPage();

		const title = screen.getByRole('heading', { name: /^Invitations/ });
		expect(title.textContent).toContain('3 pending');
	});

	test('renders the invite CTA in the empty state when there are no invitations', () => {
		mocks.toStaffTenantInvitationRows.mockReturnValue([]);
		mocks.useStaffTenantInvitationsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-invitations-table-empty'),
		).toBeTruthy();
		expect(screen.getByText('No pending invitations')).toBeTruthy();
		expect(
			screen
				.getAllByRole('link', { name: 'Invite people' })
				.some((link) =>
					link
						.getAttribute('href')
						?.endsWith(
							'/staff/tenants/11111111-1111-1111-1111-111111111111/users?invite=1',
						),
				),
		).toBe(true);
	});

	test('does not render created/accepted columns not in the approved column list', () => {
		renderPage();

		expect(screen.queryByText('Created')).toBeNull();
		expect(screen.queryByText('Accepted')).toBeNull();
	});

	test('shows a revoke action only for pending invitations', async () => {
		mocks.toStaffTenantInvitationRows.mockReturnValue([
			{
				id: 'invite-pending',
				email: 'pending@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: 'Approvers',
				invitedByName: 'Taylor Smith',
				acceptedAt: null,
				createdAt: new Date('2026-07-01T09:00:00Z'),
				expiresAt: new Date('2026-07-07T09:00:00Z'),
			},
			{
				id: 'invite-accepted',
				email: 'accepted@example.com',
				status: 'Accepted',
				scope: 'Tenant',
				profileName: 'Approvers',
				invitedByName: 'Taylor Smith',
				acceptedAt: new Date('2026-07-02T09:00:00Z'),
				createdAt: new Date('2026-07-01T09:00:00Z'),
				expiresAt: new Date('2026-07-07T09:00:00Z'),
			},
		]);

		renderPage();

		expect(
			screen.getAllByRole('button', { name: /^Actions for/ }),
		).toHaveLength(1);
		expect(screen.getByText('accepted@example.com')).toBeTruthy();
	});

	test('revokes a pending invitation, invalidates the tenant invitations query, and shows success feedback', async () => {
		const revoke = vi.fn().mockResolvedValue({});
		mocks.useRevokeStaffTenantInvitationMutation.mockReturnValue({
			mutateAsync: revoke,
			isPending: false,
		});

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke' }));

		await waitFor(() =>
			expect(screen.getByText('Revoke invitation')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Revoke' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(revoke).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				invitationId: 'invite-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
		expect(screen.getByText('Invitation revoked.')).toBeTruthy();
	});

	test('shows an inline revoke error for forbidden failures without logging out', async () => {
		const revoke = vi.fn().mockRejectedValue({
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
			detail: 'Forbidden',
		});
		mocks.useRevokeStaffTenantInvitationMutation.mockReturnValue({
			mutateAsync: revoke,
			isPending: false,
		});

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke' }));

		await waitFor(() =>
			expect(screen.getByText('Revoke invitation')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Revoke' }).slice(-1)[0],
		);

		await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByText('Forbidden')).toBeTruthy());
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout for a revoke 401 failure', async () => {
		const revoke = vi.fn().mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Unauthorized',
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useRevokeStaffTenantInvitationMutation.mockReturnValue({
			mutateAsync: revoke,
			isPending: false,
		});

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke' }));

		await waitFor(() =>
			expect(screen.getByText('Revoke invitation')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Revoke' }).slice(-1)[0],
		);

		await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	test('a debounced search commit does not revert a status filter chosen within the debounce window (F1)', async () => {
		const Component = getRouteComponent();
		const renderResult = render(<Component />);

		fireEvent.change(
			screen.getByTestId('staff-tenant-invitations-table-search'),
			{ target: { value: 'an' } },
		);

		// Simulate choosing a status filter within the 300ms debounce window:
		// the route re-renders with the new URL search state, same as a real
		// navigation would, before the debounced commit fires.
		mocks.search = { status: 'pending' };
		renderResult.rerender(<Component />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).toMatchObject({ status: 'pending', q: 'an' });
	});

	test('a debounced search commit does not revert a status filter cleared within the debounce window (r3-F1)', async () => {
		mocks.search = { status: 'pending' };
		const Component = getRouteComponent();
		const renderResult = render(<Component />);

		fireEvent.change(
			screen.getByTestId('staff-tenant-invitations-table-search'),
			{ target: { value: 'an' } },
		);

		// Simulate clearing the status filter within the 300ms debounce window:
		// the parse helper omits `status` entirely rather than setting it to
		// undefined, so the route re-renders with no `status` key at all.
		mocks.search = {};
		renderResult.rerender(<Component />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).not.toHaveProperty('status');
		expect(lastCall?.search).toMatchObject({ q: 'an' });
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'alex', status: 'pending,accepted' };
		mocks.toStaffTenantInvitationRows.mockReturnValue([]);
		mocks.useStaffTenantInvitationsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-invitations-table-no-match'),
		).toBeTruthy();
		expect(screen.getByText('No invitations match your search')).toBeTruthy();
		expect(mocks.useStaffTenantInvitationsQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				q: 'alex',
				status: 'pending,accepted',
			}),
			{ enabled: true },
		);
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

	test('renders a local not found view without logging out for 404 failures', () => {
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

	test('renders the table error state without logging out for ordinary problem failures', () => {
		mocks.toStaffTenantInvitationRows.mockReturnValue([]);
		mocks.useStaffTenantInvitationsQuery.mockReturnValue(
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
			screen.getByTestId('staff-tenant-invitations-table-error'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout only when the invitations query returns a 401 auth failure', () => {
		mocks.useStaffTenantInvitationsQuery.mockReturnValue(
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

describe('createColumns column widths', () => {
	test('applies a fixed width to every column except the fluid email column', () => {
		const columns = createColumns({
			locale: 'en',
			t: (key: string) => key,
			isRevokePending: false,
			onRevoke: () => undefined,
		});
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			email: undefined,
			profile_name: '160px',
			invited_by: '150px',
			expires_at: '150px',
			status: '128px',
			actions: '40px',
		});
	});

	test('hides secondary metadata columns below the 768px mobile breakpoint, keeping email/status/actions', () => {
		const columns = createColumns({
			locale: 'en',
			t: (key: string) => key,
			isRevokePending: false,
			onRevoke: () => undefined,
		});
		const hideBelowById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.hideBelow]),
		);

		expect(hideBelowById).toEqual({
			email: undefined,
			profile_name: 768,
			invited_by: 768,
			expires_at: 768,
			status: undefined,
			actions: undefined,
		});
	});
});

describe('isInvitationExpiringSoon', () => {
	const now = new Date('2026-07-01T00:00:00Z');

	test('is true when expiry is within 48 hours in the future', () => {
		expect(
			isInvitationExpiringSoon(new Date('2026-07-02T12:00:00Z'), now),
		).toBe(true);
	});

	test('is false when expiry is more than 48 hours away', () => {
		expect(
			isInvitationExpiringSoon(new Date('2026-07-10T00:00:00Z'), now),
		).toBe(false);
	});

	test('is false when already expired', () => {
		expect(
			isInvitationExpiringSoon(new Date('2026-06-30T00:00:00Z'), now),
		).toBe(false);
	});

	test('is false for a null expiry', () => {
		expect(isInvitationExpiringSoon(null, now)).toBe(false);
	});
});
