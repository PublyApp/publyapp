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
import type {
	TestLocaleLabelMap,
	TestLabelMap,
} from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	search: {},
	navigate: vi.fn(),
	downloadFile: vi.fn(),
	tenantId: '11111111-1111-1111-1111-111111111111',
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantInvitationRows: vi.fn(),
	useStaffTenantInvitationsQuery: vi.fn(),
	useRevokeStaffTenantInvitationMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	inviteHostIsOpen: false,
	inviteHostOnOpenChange: (_isOpen: boolean) => {},
	inviteHostOnInvited: () => {},
	displayMutationFeedback: vi.fn().mockResolvedValue(undefined),
}));

let currentLanguage = 'en';

const translationsByLanguage: TestLocaleLabelMap = {
	en: {
		admin: 'Admin',
		access: 'Access',
		user: 'User',
	},
	fr: {
		admin: 'Administrateur',
		access: 'Accès',
		user: 'Utilisateur',
	},
};

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
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

const TRANSLATIONS: TestLabelMap = {
	access: 'Access',
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
	'all-account-levels': 'All account levels',
	pending: 'Pending',
	accepted: 'Accepted',
	expired: 'Expired',
	revoked: 'Revoked',
	'status-unknown': 'Unknown',
	clear: 'Clear',
	'created-at': 'Created at',
	'search-invitations': 'Search invitations',
	'tenant-invitations-empty-title': 'No pending invitations',
	'tenant-invitations-empty-description':
		'Invite people to this workspace and track their invitations here.',
	'tenant-invitations-no-match-title': 'No invitations match your search',
	'tenant-invitations-no-match-description':
		'Try a different name, email, or filter.',
	'invitations-pending-count-chip': '{{count}} pending',
	'select-row-named': 'Select {{name}}',
	'select-all-rows': 'Select all rows',
	'selected-count': '{{count}} selected',
	'clear-selection': 'Clear selection',
	'select-all-visible': 'Select all {{count}}',
	'export-selected': 'Export selected',
};

vi.mock('~/lib/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: () => '2026-07-12',
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text =
				translationsByLanguage[currentLanguage]?.[key] ??
				TRANSLATIONS[key] ??
				key;
			if (!options) {
				return text;
			}

			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
		i18n: {
			language: currentLanguage,
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

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_invite-user-drawer-host', () => ({
	InviteTenantUserDrawerHost: ({
		isOpen,
		onOpenChange,
		onInvited,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
		onInvited?: () => void;
	}) => {
		mocks.inviteHostIsOpen = isOpen;
		mocks.inviteHostOnOpenChange = onOpenChange;
		mocks.inviteHostOnInvited = onInvited ?? (() => undefined);

		return isOpen ? <div data-testid="invite-drawer-open" /> : null;
	},
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayMutationFeedback: mocks.displayMutationFeedback,
}));

import {
	createTenantInvitationColumns as createColumns,
	isInvitationExpiringSoon,
} from './_invitation-columns';
import { Route } from './invitations';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const getRouteComponent = () => Route.options.component as () => JSX.Element;

const renderPage = () => {
	const Component = getRouteComponent();
	return render(<Component />);
};

describe('staff tenant invitations route', () => {
	beforeEach(() => {
		currentLanguage = 'en';
		vi.clearAllMocks();
		mocks.search = {};
		mocks.tenantId = '11111111-1111-1111-1111-111111111111';
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.inviteHostIsOpen = false;
		mocks.inviteHostOnOpenChange = vi.fn();
		mocks.inviteHostOnInvited = vi.fn();
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
		expect(screen.getByRole('button', { name: 'Invite people' })).toBeTruthy();
		expect(screen.getByText('alex@example.com')).toBeTruthy();
		expect(screen.getByText('Approvers')).toBeTruthy();
		expect(screen.getByText('Taylor Smith')).toBeTruthy();
		expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
		expect(mocks.useStaffTenantInvitationsQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				status: undefined,
				level: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('invite people button opens the same-route drawer and keeps current invitation filters', () => {
		mocks.search = { q: 'sam', status: 'pending', level: 'admin,user' };
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({
					invite: 1,
					q: 'sam',
					status: 'pending',
					level: 'admin,user',
				}),
				replace: true,
			}),
		);
	});

	test('shows the honest pending-invitations count next to the tab title, labelled as pending', () => {
		renderPage();

		const title = screen.getByRole('heading', { name: /^Invitations/ });
		expect(title.textContent).toContain('3 pending');
	});

	test('derives admin access from row account level with translation', () => {
		currentLanguage = 'fr';
		mocks.toStaffTenantInvitationRows.mockReturnValue([
			{
				id: 'invite-admin-mapped',
				email: 'admin@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: null,
				accountLevel: 'Admin',
				invitedByName: 'Taylor Smith',
				acceptedAt: null,
				createdAt: new Date('2026-07-01T09:00:00Z'),
				expiresAt: new Date('2026-07-07T09:00:00Z'),
			},
		]);

		renderPage();

		expect(screen.getByText('Administrateur')).toBeTruthy();
		expect(screen.queryByText('Admin')).toBeNull();
	});

	test('renders plural invitation profiles as chips with a +N overflow affordance', () => {
		mocks.toStaffTenantInvitationRows.mockReturnValue([
			{
				id: 'invite-many-profiles',
				email: 'profiles@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: 'Legacy profile',
				profiles: [
					{ id: 'profile-1', name: 'Authors' },
					{ id: 'profile-2', name: 'Reviewers' },
					{ id: 'profile-3', name: 'Publishers' },
				],
				accountLevel: 'User',
				invitedByName: 'Taylor Smith',
				acceptedAt: null,
				createdAt: new Date('2026-07-01T09:00:00Z'),
				expiresAt: new Date('2026-07-07T09:00:00Z'),
			},
		]);

		renderPage();

		expect(screen.getByText('Authors')).toBeTruthy();
		expect(screen.getByText('Reviewers')).toBeTruthy();
		expect(screen.getByText('+1').getAttribute('title')).toBe('Publishers');
		expect(screen.queryByText('Legacy profile')).toBeNull();
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
				.getAllByRole('button', { name: 'Invite people' })
				.some(
					(button) => (button.textContent?.trim() ?? '') === 'Invite people',
				),
		).toBe(true);
	});

	test('opens with query filters intact when arriving via deep-link invite state', () => {
		mocks.search = {
			invite: 1,
			q: 'sam',
			status: 'pending',
			level: 'admin',
		};
		renderPage();

		expect(screen.getByTestId('staff-tenant-invitations-page')).toBeTruthy();
		expect(screen.getByTestId('invite-drawer-open')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invite people' })).toBeTruthy();
	});

	test('closing the invite drawer from Invitations removes only invite and preserves list state', () => {
		mocks.search = {
			invite: 1,
			q: 'sam',
			status: 'pending',
			level: 'admin',
		};
		renderPage();

		mocks.navigate.mockClear();
		mocks.inviteHostOnOpenChange(false);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({
					invite: undefined,
					q: 'sam',
					status: 'pending',
					level: 'admin',
				}),
				replace: true,
			}),
		);
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

	test('revokes a pending invitation with one central success toast and no status banner', async () => {
		const revoke = vi.fn().mockImplementation(async () => {
			await mocks.displayMutationFeedback({ kind: 'success' });
			return {};
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

		await waitFor(() =>
			expect(revoke).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				invitationId: 'invite-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
		expect(mocks.displayMutationFeedback).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Invitation revoked.')).toBeNull();
	});

	test('uses one central error toast for an ordinary revoke failure', async () => {
		const failure = {
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
			detail: 'Forbidden',
		};
		const revoke = vi.fn().mockImplementation(async () => {
			await mocks.displayMutationFeedback({ kind: 'error' });
			throw failure;
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
		expect(mocks.displayMutationFeedback).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Forbidden')).toBeNull();
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
		expect(mocks.displayMutationFeedback).not.toHaveBeenCalled();
	});

	test('a debounced search commit does not revert a status filter chosen within the debounce window (F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			const Component = getRouteComponent();
			const renderResult = render(<Component />);

			fireEvent.change(
				screen.getByTestId('staff-tenant-invitations-table-search'),
				{ target: { value: 'an' } },
			);

			// Simulate choosing a status filter within the 300ms debounce
			// window: the route re-renders with the new URL search state, same
			// as a real navigation would, before the debounced commit fires.
			mocks.search = { status: 'pending' };
			renderResult.rerender(<Component />);

			// Deterministic (W6-FLAKE #827): step PAST the debounce instead of
			// a real-time sleep.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(lastCall?.search).toMatchObject({ status: 'pending', q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	test('a debounced search commit does not revert a status filter cleared within the debounce window (r3-F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			mocks.search = { status: 'pending' };
			const Component = getRouteComponent();
			const renderResult = render(<Component />);

			fireEvent.change(
				screen.getByTestId('staff-tenant-invitations-table-search'),
				{ target: { value: 'an' } },
			);

			// Simulate clearing the status filter within the 300ms debounce
			// window. canonicalized parsing stores explicit `status: undefined`
			// so the rerendered route search keeps the canonical key shape.
			mocks.search = {};
			renderResult.rerender(<Component />);

			// Deterministic (W6-FLAKE #827): see the F1 test above.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(
				Object.prototype.hasOwnProperty.call(lastCall?.search, 'status'),
			).toBe(true);
			expect(lastCall?.search?.status).toBeUndefined();
			expect(lastCall?.search).toMatchObject({ q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	test('renders default status control when handed an already-canonicalized search (URL-level proof: deep-link-canonicalization.test.tsx)', () => {
		const validateSearch = (
			Route.options as {
				validateSearch: (
					search: Record<string, unknown>,
				) => Record<string, unknown>;
			}
		).validateSearch;
		const canonicalSearch = validateSearch({ status: 'bogus' });

		expect(
			Object.prototype.hasOwnProperty.call(canonicalSearch, 'status'),
		).toBe(true);
		expect(canonicalSearch.status).toBeUndefined();

		mocks.search = canonicalSearch;
		renderPage();

		expect(
			screen.getByRole('button', { name: /All statuses/ }).textContent,
		).toContain('All statuses');
		expect(mocks.useStaffTenantInvitationsQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: '11111111-1111-1111-1111-111111111111',
				status: undefined,
			}),
			{ enabled: true },
		);
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

	test('canonicalizes both account levels and forwards them to the list query', () => {
		const validateSearch = (
			Route.options as {
				validateSearch: (
					search: Record<string, unknown>,
				) => Record<string, unknown>;
			}
		).validateSearch;
		const canonicalSearch = validateSearch({
			q: ' sam ',
			status: 'pending',
			level: ' Admin, user, bogus, ADMIN ',
			sort_id: 'email',
			sort_order: 'asc',
			cursor: 'invite-cursor',
			size: 25,
			invite: 1,
		});

		expect(canonicalSearch).toMatchObject({
			q: 'sam',
			status: 'pending',
			level: 'admin,user',
			sort_id: 'email',
			sort_order: 'asc',
			cursor: 'invite-cursor',
			size: 25,
			invite: 1,
		});

		mocks.search = canonicalSearch;
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-invitations-level-filter-trigger')
				.textContent,
		).toContain('Admin, User');
		expect(mocks.useStaffTenantInvitationsQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				q: 'sam',
				status: 'pending',
				level: 'admin,user',
				sortId: 'email',
				sortOrder: 'asc',
				size: 25,
			}),
			{ enabled: true },
		);
	});

	test('renders square checkboxes for account levels and selects both without closing', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-invitations-level-filter-trigger'),
		);
		const resetItem = await screen.findByTestId(
			'staff-tenant-invitations-level-filter-all',
		);
		const adminItem = screen.getByTestId(
			'staff-tenant-invitations-level-filter-admin',
		);
		const userItem = screen.getByTestId(
			'staff-tenant-invitations-level-filter-user',
		);

		expect(
			resetItem.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toBeNull();
		expect(
			adminItem.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toBeTruthy();
		expect(
			userItem.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toBeTruthy();

		fireEvent.click(adminItem);
		const firstLevelNavigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search: Record<string, unknown>;
			replace: boolean;
		};
		expect(firstLevelNavigation.replace).toBe(true);
		expect(firstLevelNavigation.search.level).toBe('admin');
		// URL-state only: the invitations query reads its cursor from
		// useCursorPagination, never from the URL, so this asserts that the
		// level-change navigation drops the stale `cursor` search param — NOT
		// that the client-held page cursor reset. See "changing the account
		// level filter resets the client-held cursor and page index" below for
		// the real reset coverage.
		expect(firstLevelNavigation.search.cursor).toBeUndefined();
		expect(
			screen.getByTestId('staff-tenant-invitations-level-filter-admin'),
		).toBeTruthy();

		mocks.search = { level: 'admin' };
		const Component = getRouteComponent();
		cleanup();
		render(<Component />);
		fireEvent.click(
			screen.getByTestId('staff-tenant-invitations-level-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenant-invitations-level-filter-user'),
		);
		const secondLevelNavigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search: Record<string, unknown>;
			replace: boolean;
		};
		expect(secondLevelNavigation.replace).toBe(true);
		expect(secondLevelNavigation.search.level).toBe('admin,user');
		// URL-state only — see the note on the first navigation above.
		expect(secondLevelNavigation.search.cursor).toBeUndefined();
	});

	test('account-level reset clears only level and preserves every other URL state', async () => {
		mocks.search = {
			q: 'sam',
			status: 'pending,accepted',
			level: 'admin,user',
			sort_id: 'email',
			sort_order: 'asc',
			cursor: 'invite-cursor',
			size: 25,
			invite: 1,
		};
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-invitations-level-filter-trigger'),
		);
		const resetItem = await screen.findByTestId(
			'staff-tenant-invitations-level-filter-all',
		);
		fireEvent.click(resetItem);

		const resetNavigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search: Record<string, unknown>;
			replace: boolean;
		};
		expect(resetNavigation.replace).toBe(true);
		expect(resetNavigation.search).toMatchObject({
			q: 'sam',
			status: 'pending,accepted',
			sort_id: 'email',
			sort_order: 'asc',
			size: 25,
			invite: 1,
		});
		expect(resetNavigation.search.level).toBeUndefined();
		// URL-state only — see the note on the level-toggle test above.
		expect(resetNavigation.search.cursor).toBeUndefined();
		await waitFor(() =>
			expect(
				screen.queryByTestId('staff-tenant-invitations-level-filter-all'),
			).toBeNull(),
		);
	});

	// Round-2 finding 3: the URL `cursor` assertions above cannot fail when the
	// client-held cursor stack leaks across a filter change, because the list
	// query never reads the URL cursor. This test drives the real thing: page
	// forward so useCursorPagination holds a server cursor at page index 1, then
	// change the level filter (which changes cursorResetKey) and assert the very
	// next list query is issued with no cursor, back at page index 0.
	test('changing the account level filter resets the client-held cursor and page index', () => {
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
					nextCursor: 'invite-cursor-2',
				},
			}),
		);

		const Component = getRouteComponent();
		const renderResult = render(<Component />);

		const currentPageLabel = (): string | undefined =>
			document.querySelector('.publy-pager-current')?.textContent ?? undefined;
		const lastQueryVariables = (): Record<string, unknown> =>
			mocks.useStaffTenantInvitationsQuery.mock.calls.at(-1)?.[0] as Record<
				string,
				unknown
			>;

		expect(currentPageLabel()).toBe('1');
		expect(lastQueryVariables()).toMatchObject({ cursor: undefined });
		expect(lastQueryVariables().level).toBeUndefined();

		fireEvent.click(
			screen.getByTestId('staff-tenant-invitations-table-next-page'),
		);

		expect(currentPageLabel()).toBe('2');
		expect(lastQueryVariables()).toMatchObject({
			cursor: 'invite-cursor-2',
		});
		expect(
			screen
				.getByTestId('staff-tenant-invitations-table-prev-page')
				.hasAttribute('disabled'),
		).toBe(false);

		// The URL now carries the level filter, exactly as the navigate() from
		// setLevels() produces. Re-render with the new search props, the same way
		// a real navigation would.
		mocks.search = { level: 'admin' };
		renderResult.rerender(<Component />);

		expect(currentPageLabel()).toBe('1');
		expect(lastQueryVariables()).toMatchObject({
			cursor: undefined,
			level: 'admin',
		});
		expect(
			screen
				.getByTestId('staff-tenant-invitations-table-prev-page')
				.hasAttribute('disabled'),
		).toBe(true);
	});

	test('debounced search preserves account level, status, sorting, size, and drawer state (deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			mocks.search = {
				level: 'admin,user',
				status: 'pending',
				sort_id: 'email',
				sort_order: 'asc',
				size: 25,
				invite: 1,
			};
			renderPage();

			fireEvent.change(
				screen.getByTestId('staff-tenant-invitations-table-search'),
				{ target: { value: 'sam' } },
			);
			// Deterministic (W6-FLAKE #827): step PAST the debounce instead of
			// a real-time sleep.
			await vi.advanceTimersByTimeAsync(301);

			const searchNavigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search: Record<string, unknown>;
			};
			expect(searchNavigation.search).toMatchObject({
				q: 'sam',
				level: 'admin,user',
				status: 'pending',
				sort_id: 'email',
				sort_order: 'asc',
				size: 25,
				invite: 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test('status changes preserve account level and other URL state while resetting cursor', async () => {
		mocks.search = {
			q: 'sam',
			level: 'admin',
			status: 'pending',
			sort_id: 'email',
			sort_order: 'asc',
			cursor: 'invite-cursor',
			size: 25,
			invite: 1,
		};
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-invitations-status-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId(
				'staff-tenant-invitations-status-filter-accepted',
			),
		);

		const statusNavigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search: Record<string, unknown>;
		};
		expect(statusNavigation.search).toMatchObject({
			q: 'sam',
			level: 'admin',
			status: 'pending,accepted',
			sort_id: 'email',
			sort_order: 'asc',
			size: 25,
			invite: 1,
		});
		expect(statusNavigation.search.cursor).toBeUndefined();
	});

	// #838: row selection on this table. Nested so the shared route-level
	// beforeEach above (query/tenant/revoke mocks) applies to these too;
	// the local beforeEach only swaps in two visible rows.
	describe('row selection (#838)', () => {
		const mediumDateTime = (value: Date): string =>
			value.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

		const twoInvitationRows = () => [
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
			{
				id: 'invite-2',
				email: 'sam@example.com',
				status: 'Pending',
				scope: 'Tenant',
				profileName: null,
				accountLevel: 'User',
				invitedByName: 'Taylor Smith',
				acceptedAt: null,
				createdAt: new Date('2026-07-01T10:00:00Z'),
				expiresAt: new Date('2026-07-08T09:00:00Z'),
			},
		];

		beforeEach(() => {
			mocks.toStaffTenantInvitationRows.mockReturnValue(twoInvitationRows());
		});

		test('renders a labelled checkbox column when rows are present', () => {
			renderPage();

			expect(
				screen.getByRole('checkbox', { name: 'Select all rows' }),
			).toBeTruthy();
			expect(screen.getByLabelText('Select alex@example.com')).toBeTruthy();
			expect(screen.getByLabelText('Select sam@example.com')).toBeTruthy();
		});

		test('selecting one row reports the count and offers the export action; deselecting clears it', async () => {
			renderPage();

			fireEvent.click(screen.getByLabelText('Select alex@example.com'));

			expect(await screen.findByTestId('floating-selection-bar')).toBeTruthy();
			expect(screen.getByText('1 selected')).toBeTruthy();
			expect(
				screen.getByRole('button', { name: 'Export selected' }),
			).toBeTruthy();

			fireEvent.click(screen.getByLabelText('Select alex@example.com'));

			await waitFor(() =>
				expect(screen.queryByTestId('floating-selection-bar')).toBeNull(),
			);
		});

		test('select all rows selects every visible invitation and clear empties the selection', async () => {
			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select all rows' }),
			);

			expect(await screen.findByText('2 selected')).toBeTruthy();
			// Base UI Checkbox renders a button carrying aria-checked.
			expect(
				screen
					.getByLabelText('Select alex@example.com')
					.getAttribute('aria-checked'),
			).toBe('true');
			expect(
				screen
					.getByLabelText('Select sam@example.com')
					.getAttribute('aria-checked'),
			).toBe('true');

			fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

			await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
			expect(
				screen
					.getByLabelText('Select alex@example.com')
					.getAttribute('aria-checked'),
			).toBe('false');
		});

		test('prunes the selection when filtering leaves no visible rows', async () => {
			const Component = getRouteComponent();
			const renderResult = render(<Component />);

			fireEvent.click(screen.getByLabelText('Select alex@example.com'));
			expect(await screen.findByText('1 selected')).toBeTruthy();

			// Same shape as a real navigation: the status filter narrows the list
			// query to zero rows on the rerendered route.
			mocks.toStaffTenantInvitationRows.mockReturnValue([]);
			renderResult.rerender(<Component />);

			await waitFor(() =>
				expect(screen.queryByTestId('floating-selection-bar')).toBeNull(),
			);
		});

		test('exports only the selected rows with email, access, invited by, status, created at, and expiry', async () => {
			renderPage();

			fireEvent.click(screen.getByLabelText('Select sam@example.com'));
			fireEvent.click(
				await screen.findByRole('button', { name: 'Export selected' }),
			);

			expect(mocks.downloadFile).toHaveBeenCalledOnce();
			const [download] = mocks.downloadFile.mock.calls[0] as [
				{ data: unknown; fileName: string; mimeType: string },
			];
			expect(download.fileName).toBe('staff-tenant-invitations-2026-07-12.csv');
			expect(download.mimeType).toBe('text/csv;charset=utf-8');

			const lines = String(download.data).split('\r\n');
			expect(lines[0]).toBe(
				'Invitee,Access,Invited by,Status,Created at,Expires',
			);
			expect(lines).toHaveLength(2);
			expect(lines[1]).toBe(
				[
					'sam@example.com',
					'User',
					'Taylor Smith',
					'Pending',
					'"' + mediumDateTime(twoInvitationRows()[1].createdAt) + '"',
					'"' + mediumDateTime(twoInvitationRows()[1].expiresAt) + '"',
				].join(','),
			);
		});
	});
});

describe('createColumns column widths', () => {
	test('uses the email-hashed avatar palette for the invitation mail tile', () => {
		const columns = createColumns({
			locale: 'en',
			t: (key: string) => key,
			isRevokePending: false,
			onRevoke: () => undefined,
		});
		const emailColumn = columns.find((column) => column.id === 'email');
		const cellRenderer = emailColumn?.cell as (props: {
			row: {
				original: {
					email: string;
				};
			};
		}) => JSX.Element;
		const { container } = render(
			cellRenderer({
				row: {
					original: {
						email: 'person@example.com',
					},
				},
			}),
		);
		const mailTile = container.querySelector('[aria-hidden="true"]');

		expect(mailTile?.className).toContain('publy-avatar-initials');
		expect(mailTile?.className).not.toContain('bg-muted');
		expect(mailTile?.className).not.toContain('text-muted-foreground');
		expect(mailTile?.getAttribute('data-palette')).toBe('5');
	});

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

	test('hides secondary metadata columns below their breakpoints (768px, invited_by below 1024px), keeping email/status/actions', () => {
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
			// #838: the selection column adds 40px, which pushed the table past
			// its card bound at 768px; invited_by now hides below 1024px.
			invited_by: 1024,
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
