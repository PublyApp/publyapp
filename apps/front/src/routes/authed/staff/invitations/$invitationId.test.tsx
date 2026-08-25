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
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	useStaffInvitationDetailsQuery: vi.fn(),
	useStaffInvitationLinkMutation: vi.fn(),
	useResendStaffInvitationMutation: vi.fn(),
	useRevokeStaffInvitationMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastInfo: vi.fn(),
	invalidateStaffInvitations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const normalize = (value: string): string =>
				value.includes(':') ? value.split(':').at(-1)! : value;
			const labels: TestLabelMap = {
				revoke: 'revoke',
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
				'invitation-removal': 'Invitation removal',
				'invitation-removal-description':
					'Revoke this invitation. The invited user will no longer be able to accept it.',
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
				'invitation-status-pending': 'Pending',
				'try-again': 'Try again',
			};

			return labels[normalize(key)] ?? labels[key] ?? key;
		},
	}),
}));

vi.mock('~/lib/query/staff-invitations', () => ({
	useStaffInvitationDetailsQuery: mocks.useStaffInvitationDetailsQuery,
	useStaffInvitationLinkMutation: mocks.useStaffInvitationLinkMutation,
	useResendStaffInvitationMutation: mocks.useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation: mocks.useRevokeStaffInvitationMutation,
	invalidateStaffInvitations: mocks.invalidateStaffInvitations,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		info: mocks.toastInfo,
	},
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

const pendingInvitation = {
	id: '11111111-1111-1111-1111-111111111111',
	email: 'pending-staff@example.com',
	status: 'Pending',
	invitedByName: 'Owner User',
	createdAt: new Date('2026-07-01T09:00:00Z'),
	expiresAt: new Date('2026-07-10T12:00:00Z'),
	acceptedAt: null,
	revokedAt: null,
	profiles: [],
};

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
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		Object.assign(globalThis.navigator, {
			clipboard: {
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});

		mocks.useStaffInvitationLinkMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				link: 'https://front.localhost/invitations/accept/token',
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

	test('renders a router Link back to the invitations list, not a raw anchor', () => {
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

		renderPage();

		const backLink = screen.getByRole('link', {
			name: /Staff invitations/,
		}) as HTMLAnchorElement;
		expect(backLink.getAttribute('href')).toBe('/staff/invitations');
		expect(backLink.className).toContain('publy-back-link');
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

	test('renders the logout redirect for a 401 resend action failure', async () => {
		const resend = vi.fn().mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Unauthorized',
		});

		mocks.shouldLogoutForFailure.mockReturnValue(true);
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
		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('relies on central feedback for a forbidden resend without rendering an alert', async () => {
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
		expect(screen.queryByRole('alert')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('toasts copy success only after the clipboard write completes', async () => {
		let finishWrite: (() => void) | undefined;
		const writeText = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishWrite = resolve;
				}),
		);
		Object.assign(globalThis.navigator, { clipboard: { writeText } });
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation }),
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		finishWrite?.();
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith('Invite link copied.'),
		);
		expect(screen.queryByRole('status')).toBeNull();
	});

	test('retains the link and emits info when the Clipboard API is unavailable', async () => {
		Object.assign(globalThis.navigator, { clipboard: undefined });
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation }),
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

		await waitFor(() =>
			expect(mocks.toastInfo).toHaveBeenCalledWith(
				'Invite link is ready below.',
			),
		);
		expect(
			(
				screen.getByDisplayValue(
					'https://front.localhost/invitations/accept/token',
				) as HTMLInputElement
			).value,
		).toContain('/invitations/accept/token');
		expect(screen.queryByRole('status')).toBeNull();
	});

	test('delegates a copy failure to the local mutation failure adapter once', async () => {
		const error = new Error('clipboard failed');
		Object.assign(globalThis.navigator, {
			clipboard: { writeText: vi.fn().mockRejectedValue(error) },
		});
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation }),
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				error,
				'unable-to-copy-invite-link',
			),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledTimes(1);
	});

	test('keeps a 401 copy failure toast-silent and redirects to logout', async () => {
		const error = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Unauthorized',
		};
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useStaffInvitationLinkMutation.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(error),
			isPending: false,
		});
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation }),
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalled();
	});

	test('keeps an aborted copy toast-silent through the local policy adapter', async () => {
		const error = new DOMException('Aborted', 'AbortError');
		mocks.useStaffInvitationLinkMutation.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(error),
			isPending: false,
		});
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation }),
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				error,
				'unable-to-copy-invite-link',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalled();
	});

	test('revokes with central feedback ownership while retaining refresh and dialog closure', async () => {
		const revoke = vi.fn().mockResolvedValue({});
		const refetch = vi.fn().mockResolvedValue(undefined);
		mocks.useRevokeStaffInvitationMutation.mockReturnValue({
			mutateAsync: revoke,
			isPending: false,
		});
		mocks.useStaffInvitationDetailsQuery.mockReturnValue(
			buildQueryResult({ data: pendingInvitation, refetch }),
		);

		renderPage();
		const buttons = screen.getAllByRole('button');
		expect(buttons.map((button) => button.textContent)).toContain('Revoke');
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());
		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
		expect(mocks.invalidateStaffInvitations).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('revoke')).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});
});
