/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffInvitationDetailsQuery: vi.fn(),
	useStaffInvitationLinkMutation: vi.fn(),
	useResendStaffInvitationMutation: vi.fn(),
	useRevokeStaffInvitationMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'staff-invitations': 'Staff invitations',
				'copy-link': 'Copy link',
				resend: 'Resend',
				'staff-revoke': 'Revoke',
				status: 'Status',
				email: 'Email',
				profiles: 'Profiles',
				'expiry-date': 'Expiry date',
				'accepted-at': 'Accepted at',
				'created-at': 'Created at',
				'sent-date': 'Sent date',
				'staff-invited-by': 'Invited by',
				'invitation-id': 'Invitation ID',
				'manage-invitation': 'Manage invitation',
				'invite-link': 'Invite link',
				'copy-link-success': 'Invite link copied.',
				'resend-invitation-success': 'Invitation resent.',
				'revoke-invitation-success': 'Invitation revoked.',
				'copy-link-ready': 'Invite link is ready below.',
				'only-pending-invitations-can-be-managed':
					'Only pending invitations can be managed.',
				'invitation-not-found': 'Invitation not found',
				'invitation-not-found-description':
					'This invitation could not be found.',
				'invitation-details-error-title': 'Unable to load invitation',
				'invitation-details-error-description':
					'Try again or return to the invitations list.',
			};

			return labels[key] ?? key;
		},
	}),
}));

vi.mock('~/lib/query/staff-invitations', () => ({
	useStaffInvitationDetailsQuery: mocks.useStaffInvitationDetailsQuery,
	useStaffInvitationLinkMutation: mocks.useStaffInvitationLinkMutation,
	useResendStaffInvitationMutation: mocks.useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation: mocks.useRevokeStaffInvitationMutation,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

import { StaffInvitationDetailsPage } from './$invitationId';

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
	const queryClient = new QueryClient();

	return render(
		<QueryClientProvider client={queryClient}>
			<StaffInvitationDetailsPage invitationId="11111111-1111-1111-1111-111111111111" />
		</QueryClientProvider>,
	);
};

describe('StaffInvitationDetailsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(globalThis.navigator, {
			clipboard: {
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});
		globalThis.confirm = vi.fn(() => true);

		mocks.useStaffInvitationLinkMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				link: 'https://front-2.localhost/invitations/accept/token',
			}),
			isPending: false,
		});
		mocks.useResendStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
		mocks.useRevokeStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the invitation details fields and pending actions', () => {
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: '11111111-1111-1111-1111-111111111111',
					email: 'pending-staff@example.com',
					status: 'Pending',
					invitedByName: 'Owner User',
					createdAt: new Date('2026-07-01T09:00:00Z'),
					expiresAt: new Date('2026-07-10T12:00:00Z'),
					acceptedAt: null,
					revokedAt: null,
					profiles: [
						{
							id: '33333333-3333-3333-3333-333333333333',
							name: 'Admins',
						},
					],
				},
			}),
		);

		renderPage();

		expect(screen.getAllByText('pending-staff@example.com')).toHaveLength(2);
		expect(screen.getByText('Pending')).toBeTruthy();
		expect(screen.getByText('Owner User')).toBeTruthy();
		expect(screen.getByText('Admins')).toBeTruthy();
		expect(
			(screen.getByRole('button', { name: 'Copy link' }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(screen.getByRole('button', { name: 'Resend' }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(screen.getByRole('button', { name: 'Revoke' }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	test('renders the logout redirect for a 401 query failure', () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: new Response(null, { status: 401 }),
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('shows an inline resend error for a forbidden action without logging out', async () => {
		const resend = vi.fn().mockRejectedValue({
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
			detail: 'Forbidden',
		});

		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: '11111111-1111-1111-1111-111111111111',
					email: 'pending-staff@example.com',
					status: 'Pending',
					invitedByName: 'Owner User',
					createdAt: new Date('2026-07-01T09:00:00Z'),
					expiresAt: new Date('2026-07-10T12:00:00Z'),
					acceptedAt: null,
					revokedAt: null,
					profiles: [],
				},
			}),
		);
		mocks.useResendStaffInvitationMutation.mockReturnValue({
			mutateAsync: resend,
			isPending: false,
		});

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Resend' }));

		await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByText('Forbidden')).toBeTruthy());
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});
});
