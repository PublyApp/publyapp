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
	onActionSuccess: vi.fn(),
	onActionError: vi.fn(),
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

import { createInvitationColumns } from './table-columns';

const t = (key: string): string => key;

const buildRow = (overrides: Record<string, unknown> = {}) => ({
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

const renderActionsCell = () => {
	const columns = createInvitationColumns({
		t,
		locale: 'en',
		onActionSuccess: mocks.onActionSuccess,
		onActionError: mocks.onActionError,
	});
	const actionsColumn = columns.find((column) => column.id === 'actions');
	const cellRenderer = actionsColumn?.cell as (props: {
		row: { original: ReturnType<typeof buildRow> };
	}) => ReactNode;
	const queryClient = new QueryClient();

	return render(
		<QueryClientProvider client={queryClient}>
			{cellRenderer({ row: { original: buildRow() } })}
		</QueryClientProvider>,
	);
};

describe('createInvitationColumns', () => {
	test('marks the Profiles column as non-sortable because the staff invitations API does not support profile_name sorting', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
			onActionError: () => undefined,
		});
		const profileColumn = columns.find(
			(column) => column.id === 'profile_name',
		);

		expect(profileColumn).toMatchObject({
			id: 'profile_name',
			enableSorting: false,
		});
	});

	test('applies the SPEC 2i column grid, leaving exactly one fluid column', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
			onActionError: () => undefined,
		});
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			email: '300px',
			profile_name: undefined,
			invited_by_name: '150px',
			expires_at: '120px',
			status: '128px',
			actions: '40px',
		});
	});

	test('centres the actions column via meta.align instead of a per-route wrapper', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
			onActionError: () => undefined,
		});
		const actionsColumn = columns.find((column) => column.id === 'actions');

		expect(actionsColumn?.meta?.align).toBe('center');
	});

	test('renders the first column as a link to the invitation detail route, keeping the email text', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
			onActionError: () => undefined,
		});
		const emailColumn = columns.find((column) => column.id === 'email');
		const row = {
			original: {
				id: 'invitation-1',
				email: 'person@example.com',
				profileName: 'Ops',
				invitedByName: 'Jane',
				status: 'pending',
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		};

		const cellRenderer = emailColumn?.cell as (props: {
			row: typeof row;
		}) => ReactNode;
		render(cellRenderer({ row }));

		const link = screen.getByRole('link', { name: /person@example\.com/ });
		expect(link.getAttribute('href')).toBe('/staff/invitations/invitation-1');
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
		renderActionsCell();
		await openMenu();

		fireEvent.click(screen.getByText('revoke-invitation'));

		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());
		expect(
			mocks.useRevokeStaffInvitationMutation().mutateAsync,
		).not.toHaveBeenCalled();
	});

	test('confirming revoke calls the mutation, invalidates staff invitations, and reports success', async () => {
		renderActionsCell();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());

		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() => expect(mocks.onActionSuccess).toHaveBeenCalled());
		expect(
			mocks.useRevokeStaffInvitationMutation().mutateAsync,
		).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
		expect(mocks.invalidateStaffInvitations).toHaveBeenCalled();
	});

	test('a failed revoke reports the failure instead of silently doing nothing', async () => {
		mocks.useRevokeStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue({
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'Forbidden',
			}),
			isPending: false,
		});
		renderActionsCell();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());

		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() => expect(mocks.onActionError).toHaveBeenCalled());
		expect(mocks.onActionSuccess).not.toHaveBeenCalled();
		expect(mocks.invalidateStaffInvitations).not.toHaveBeenCalled();
	});

	test('both row actions are disabled while a mutation is pending, guarding against double submission', async () => {
		mocks.useResendStaffInvitationMutation.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: true,
		});
		renderActionsCell();
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
});
