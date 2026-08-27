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
		t: (key: string) => {
			if (key.includes(':')) return key.split(':').at(-1)!;
			return key;
		},
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

vi.mock('~/lib/mutation-toast', () => ({
	toastLocalMutationResult: {
		warning: mocks.toastWarning,
	},
}));

import { createInvitationColumns } from './table-columns';

const t = (key: string): string =>
	key.startsWith('common:') ? key.replace(/^common:/, '') : key;

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

const renderActionsCell = (status = 'pending') => {
	const columns = createInvitationColumns({
		t,
		locale: 'en',
	});
	const actionsColumn = columns.find((column) => column.id === 'actions');
	const cellRenderer = actionsColumn?.cell as (props: {
		row: { original: ReturnType<typeof buildRow> };
	}) => ReactNode;
	const queryClient = new QueryClient();

	return render(
		<QueryClientProvider client={queryClient}>
			{cellRenderer({ row: { original: buildRow({ status }) } })}
		</QueryClientProvider>,
	);
};

describe('createInvitationColumns', () => {
	test('marks the Profiles column as non-sortable because the staff invitations API does not support profile_name sorting', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
		});
		const profileColumn = columns.find(
			(column) => column.id === 'profile_name',
		);

		expect(profileColumn).toMatchObject({
			id: 'profile_name',
			enableSorting: false,
		});
	});

	test('applies the column grid, leaving exactly one fluid column', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
		});
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		// No `role` column: `InvitationListItem` carries no role field, and
		// per docs/guides/front/conventions.md's data-honesty rule a column
		// with nothing to back it must not exist rather than render a
		// fabricated "—".
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
		});
		const actionsColumn = columns.find((column) => column.id === 'actions');

		expect(actionsColumn?.meta?.align).toBe('center');
	});

	test('renders the first column as a link to the invitation detail route, keeping the email text', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
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
		const mailTile = link.querySelector('[aria-hidden="true"]');
		expect(link.getAttribute('href')).toBe('/staff/invitations/invitation-1');
		expect(mailTile?.className).toContain('publy-avatar-initials');
		expect(mailTile?.className).not.toContain('bg-muted');
		expect(mailTile?.className).not.toContain('text-muted-foreground');
		expect(mailTile?.getAttribute('data-palette')).toBe('5');
	});

	describe('missing-data cells (r5-F5)', () => {
		beforeEach(() => {
			cleanup();
		});

		afterEach(() => {
			cleanup();
		});

		test('flags a missing required email as a data-integrity problem instead of fabricating a dash', () => {
			const columns = createInvitationColumns({
				t,
				locale: 'en',
			});
			const emailColumn = columns.find((column) => column.id === 'email');
			const cellRenderer = emailColumn?.cell as (props: {
				row: { original: ReturnType<typeof buildRow> };
			}) => ReactNode;

			render(cellRenderer({ row: { original: buildRow({ email: '' }) } }));

			expect(screen.getByText('invitation-missing-email')).toBeTruthy();
			expect(screen.queryByText('-')).toBeNull();
			expect(screen.queryByRole('link')).toBeNull();
		});

		test('labels a missing profile lookup as unknown instead of fabricating a dash', () => {
			const columns = createInvitationColumns({
				t,
				locale: 'en',
			});
			const profileColumn = columns.find(
				(column) => column.id === 'profile_name',
			);
			const cellRenderer = profileColumn?.cell as (props: {
				row: { original: ReturnType<typeof buildRow> };
			}) => ReactNode;

			render(
				cellRenderer({ row: { original: buildRow({ profileName: '' }) } }),
			);

			expect(screen.getByText('unknown-profile')).toBeTruthy();
			expect(screen.queryByText('-')).toBeNull();
		});

		test('labels a missing inviter lookup as unknown instead of fabricating a dash', () => {
			const columns = createInvitationColumns({
				t,
				locale: 'en',
			});
			const invitedByColumn = columns.find(
				(column) => column.id === 'invited_by_name',
			);
			const cellRenderer = invitedByColumn?.cell as (props: {
				row: { original: ReturnType<typeof buildRow> };
			}) => ReactNode;

			render(
				cellRenderer({ row: { original: buildRow({ invitedByName: '' }) } }),
			);

			expect(screen.getByText('unknown-inviter')).toBeTruthy();
			expect(screen.queryByText('-')).toBeNull();
		});
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

	test('confirming revoke relies on central feedback, invalidates, and closes the dialog', async () => {
		renderActionsCell();
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
		expect(mocks.invalidateStaffInvitations).toHaveBeenCalled();
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
		renderActionsCell();
		await openMenu();
		fireEvent.click(screen.getByText('revoke-invitation'));
		await waitFor(() => expect(screen.getByText('revoke')).toBeTruthy());

		fireEvent.click(screen.getByText('revoke'));

		await waitFor(() => expect(screen.queryByText('revoke')).toBeNull());
		expect(mocks.invalidateStaffInvitations).not.toHaveBeenCalled();
		expect(mocks.toastWarning).not.toHaveBeenCalled();
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

	test.each([['accepted'], ['expired'], ['revoked']])(
		'does not call resend for %s invitations and warns locally',
		async (status) => {
			renderActionsCell(status);
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

	test.each([['accepted'], ['expired'], ['revoked']])(
		'does not open revoke confirmation for ineligible %s invitations',
		async (status) => {
			renderActionsCell(status);
			await openMenu();

			fireEvent.click(screen.getByText('revoke-invitation'));

			expect(screen.queryByText('revoke')).toBeNull();
			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'only-pending-invitations-can-be-managed',
			);
			expect(
				mocks.useRevokeStaffInvitationMutation().mutateAsync,
			).not.toHaveBeenCalled();
		},
	);
});
