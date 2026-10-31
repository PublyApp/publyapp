/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useResendStaffInvitationMutation: vi.fn(),
	useRevokeStaffInvitationMutation: vi.fn(),
	invalidateStaffInvitations: vi.fn().mockResolvedValue(undefined),
	toastWarning: vi.fn(),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => (key.includes(':') ? key.split(':').at(-1)! : key),
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				href = href.replace(`$${key}`, value);
			}
		}
		return createElement('a', { href, ...props }, children);
	},
}));

vi.mock('~/lib/query/staff-invitations', () => ({
	useResendStaffInvitationMutation: mocks.useResendStaffInvitationMutation,
	useRevokeStaffInvitationMutation: mocks.useRevokeStaffInvitationMutation,
	invalidateStaffInvitations: mocks.invalidateStaffInvitations,
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	toastLocalMutationResult: { warning: mocks.toastWarning },
}));

import { invitationColumns } from './_invitations-list-columns';
import type { StaffInvitationRow } from './list-helpers';
import { InvitationRowActions } from './table-columns';

const t = (key: string): string =>
	key.includes(':') ? key.split(':').at(-1)! : key;

const buildRow = (
	overrides: Partial<StaffInvitationRow> = {},
): StaffInvitationRow => ({
	id: 'invitation-1',
	email: 'person@example.com',
	profileName: 'Ops',
	invitedByName: 'Jane',
	status: 'pending',
	acceptedAt: null,
	createdAt: null,
	expiresAt: null,
	...overrides,
});

const renderActions = (status: StaffInvitationRow['status'] = 'pending') => {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<InvitationRowActions row={buildRow({ status })} />
		</QueryClientProvider>,
	);
};

afterEach(() => {
	cleanup();
});

describe('invitationColumns', () => {
	test('has the seven designed columns in order', () => {
		const columns = invitationColumns(t, 'en');
		expect(columns.map((column) => column.id)).toEqual([
			'email',
			'status',
			'profile',
			'invitedBy',
			'createdAt',
			'expiresAt',
			'acceptedAt',
		]);
	});

	test('renders the email as a link to the invitation detail route', () => {
		const columns = invitationColumns(t, 'en');
		const emailColumn = columns.find((column) => column.id === 'email');
		render(<>{emailColumn?.cell(buildRow())}</>);

		const link = screen.getByRole('link', { name: 'person@example.com' });
		expect(link.getAttribute('href')).toBe('/staff/invitations/invitation-1');
	});

	test('flags a missing required email instead of showing a dash', () => {
		const columns = invitationColumns(t, 'en');
		const emailColumn = columns.find((column) => column.id === 'email');
		render(<>{emailColumn?.cell(buildRow({ email: '' }))}</>);

		expect(screen.getByText('invitation-missing-email')).toBeTruthy();
		expect(screen.queryByRole('link')).toBeNull();
	});

	test('labels a missing profile or inviter as unknown', () => {
		const columns = invitationColumns(t, 'en');
		const profileColumn = columns.find((column) => column.id === 'profile');
		const invitedByColumn = columns.find((column) => column.id === 'invitedBy');
		render(
			<>
				{profileColumn?.cell(buildRow({ profileName: '' }))}
				{invitedByColumn?.cell(buildRow({ invitedByName: '' }))}
			</>,
		);

		expect(screen.getByText('unknown-profile')).toBeTruthy();
		expect(screen.getByText('unknown-inviter')).toBeTruthy();
		expect(screen.queryByText('—')).toBeNull();
	});
});

describe('InvitationRowActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useResendStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
		mocks.useRevokeStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
		mocks.invalidateStaffInvitations.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	const openMenu = async () => {
		fireEvent.click(
			screen.getByTestId('staff-invitation-actions-invitation-1'),
		);
		await waitFor(() =>
			expect(screen.getByText('revoke-invitation')).toBeTruthy(),
		);
	};

	test('revoking asks for confirmation before calling the mutation', async () => {
		renderActions();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));

		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());
		expect(
			mocks.useRevokeStaffInvitationMutation().mutateAsync,
		).not.toHaveBeenCalled();
	});

	test('confirming revoke relies on central feedback and invalidates', async () => {
		renderActions();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());

		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() =>
			expect(mocks.invalidateStaffInvitations).toHaveBeenCalled(),
		);
		expect(
			mocks.useRevokeStaffInvitationMutation().mutateAsync,
		).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
	});

	test('a failed revoke relies on central feedback and closes the dialog', async () => {
		mocks.useRevokeStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue({
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'Forbidden',
			}),
			isPending: false,
		});
		renderActions();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());

		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() => expect(screen.queryByText('revoke')).toBeNull());
		expect(mocks.invalidateStaffInvitations).not.toHaveBeenCalled();
		expect(mocks.toastWarning).not.toHaveBeenCalled();
	});

	test('both row actions are disabled while a mutation is pending', async () => {
		mocks.useResendStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: true,
		});
		renderActions();
		await openMenu();

		expect(
			(
				screen.getByText('send-reminder').closest('[role="menuitem"]') as
					| HTMLElement
					| null
					| undefined
			)?.getAttribute('data-disabled'),
		).not.toBeNull();
	});

	test.each([['accepted'], ['expired'], ['revoked']])(
		'does not call resend for %s invitations and warns locally',
		async (status) => {
			renderActions(status as StaffInvitationRow['status']);
			await openMenu();

			fireEvent.click(screen.getByText('send-reminder'));

			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'only-pending-invitations-can-be-managed',
			);
			expect(
				mocks.useResendStaffInvitationMutation().mutateAsync,
			).not.toHaveBeenCalled();
		},
	);
});
