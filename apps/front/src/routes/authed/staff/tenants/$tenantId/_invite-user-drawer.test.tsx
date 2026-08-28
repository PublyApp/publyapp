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
import { createElement, type ReactNode } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	inviteMutation: vi.fn(),
	resolveNamesMutation: vi.fn(),
	useBulkInviteTenantUsersMutation: vi.fn(),
	useResolveTenantProfileNamesMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	displayLocalMutationFailure: vi.fn(),
	toastSuccess: vi.fn(),
	downloadFile: vi.fn(),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('~/lib/download-file', () => ({
	downloadFile: mocks.downloadFile,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (
			key: string,
			options?: Record<string, unknown> & { defaultValue?: string },
		) => {
			const labels: TestLabelMap = {
				'invite-tenant-user': 'Invite tenant user',
				'invite-tenant-users-description': 'Send tenant invitations.',
				email: 'Email',
				'account-level': 'Account level',
				'paste-emails': 'Paste emails',
				'shared-account-level': 'Shared account level',
				'shared-profiles': 'Shared profiles',
				'add-pasted-emails': 'Add pasted emails',
				'paste-email-addresses': 'Paste email addresses',
				'paste-email-addresses-description': 'Paste several addresses.',
				'paste-emails-placeholder': 'alice@example.com, bob@example.com',
				// Distinct from the literal 'name@company.com' the field used to
				// hardcode — proves the placeholder is sourced from t(), not a
				// hardcoded English string, by matching the real FR bundle value.
				'email-placeholder': 'nom@entreprise.com',
				'invite-drop-file': 'Drag a CSV or Excel file here',
				'invite-file-columns-hint': 'Columns: email, level, profiles',
				'invite-download-template': 'Download template',
				'invite-file-bar-rows': 'Rows imported: {{count}}',
				'invite-clear-file': 'Clear file',
				'invite-import-invalid-type': 'Unsupported file type.',
				'invite-import-too-large': 'This file is too large.',
				'invite-import-parse-failed': 'We could not read that file.',
				'invite-file-duplicates-skipped_one': '{{count}} duplicate skipped',
				'invite-or-add-manually': 'or add manually',
				'invite-source-file': 'from file',
				'invite-blank-row': 'New person',
				'invite-remove-row': 'Remove invitee',
				'invite-add-row': 'Add another invitee',
				'invite-admin-full-access':
					'Admins get full access; profiles do not apply.',
				'invite-unresolved-profile-not-found': 'No profile named {{names}}.',
				'invite-unresolved-profile-ambiguous': 'Ambiguous profile {{names}}.',
				'invite-invalid-email':
					'Row for {{email}} is not a valid email address. Fix the address, then try again.',
				'invite-footer-count': 'People: {{count}}',
				// Base key: i18next resolves _one/_other; the stub collapses to
				// the historical label so submit-button queries stay stable.
				'invite-send-invitations': 'Invite people',
				profiles: 'Profiles',
				admin: 'Admin',
				user: 'User',
				cancel: 'Cancel',
				'invite-tenant-user-failed': 'Unable to send the invitation.',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
			};

			return (labels[key] ?? key).replace(
				/\{\{(\w+)\}\}/g,
				(match, name: string) =>
					options && name in options
						? String(options[name as keyof typeof options])
						: match,
			);
		},
		i18n: {
			language: 'en',
			t: (key: string, options?: { defaultValue?: string }) =>
				key === 'pending-invitation-exists'
					? 'A pending invitation already exists'
					: (options?.defaultValue ?? key),
		},
	}),
}));

vi.mock('~/components/ui/button', () => ({
	Button: ({
		children,
		type,
		onClick,
		disabled,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{ type: type ?? 'button', onClick, disabled, ...props },
			children,
		),
}));

vi.mock('~/components/ui/drawer', () => ({
	Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open
			? createElement('div', { 'data-testid': 'drawer-root' }, children)
			: null,
	DrawerContent: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	DrawerHeader: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerTitle: ({ children }: { children: ReactNode }) =>
		createElement('h2', null, children),
	DrawerDescription: ({ children }: { children: ReactNode }) =>
		createElement('p', null, children),
	DrawerBody: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	DrawerFooter: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerForm: ({
		children,
		methods,
		onSubmit,
	}: {
		children: ReactNode;
		methods: import('react-hook-form').UseFormReturn;
		onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void;
	}) => (
		<FormProvider {...methods}>
			<form onSubmit={onSubmit}>{children}</form>
		</FormProvider>
	),
}));

vi.mock('~/components/field', () => ({
	Form: ({
		children,
		methods,
		onSubmit,
	}: {
		children: ReactNode;
		methods: import('react-hook-form').UseFormReturn;
		onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void;
	}) => (
		<FormProvider {...methods}>
			<form onSubmit={onSubmit}>{children}</form>
		</FormProvider>
	),
	Field: {
		Email: ({
			name,
			label,
			isDisabled,
			placeholder,
		}: {
			name: string;
			label: string;
			isDisabled?: boolean;
			placeholder?: string;
		}) => {
			const { register, getFieldState, formState } = useFormContext();
			const error = getFieldState(name, formState).error?.message;
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					'aria-invalid': error ? 'true' : undefined,
					disabled: isDisabled,
					placeholder,
					type: 'email',
					...register(name),
				}),
				error ? createElement('p', undefined, error) : null,
			);
		},
		Textarea: ({
			name,
			label,
			isDisabled,
			placeholder,
		}: {
			name: string;
			label: string;
			isDisabled?: boolean;
			placeholder?: string;
		}) => {
			const { register } = useFormContext();
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('textarea', {
					'aria-label': label,
					disabled: isDisabled,
					placeholder,
					...register(name),
				}),
			);
		},
		Select: ({
			name,
			label,
			options,
			isDisabled,
		}: {
			name: string;
			label: string;
			options: { value: string; label: string }[];
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement(
					'select',
					{ 'aria-label': label, disabled: isDisabled, ...register(name) },
					options.map((option) =>
						createElement(
							'option',
							{ key: option.value, value: option.value },
							option.label,
						),
					),
				),
			);
		},
	},
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	useBulkInviteTenantUsersMutation: mocks.useBulkInviteTenantUsersMutation,
	toStaffTenantInvitationBulkCreateSummary: (result: unknown) => result,
}));

vi.mock('./_invite-profile-select', () => ({
	InviteProfileSelect: ({ name, label }: { name: string; label: string }) => {
		const { setValue, watch } = useFormContext();
		const selected = watch(name) as string[] | undefined;
		return createElement(
			'button',
			{
				type: 'button',
				'aria-label': `${label} ${name}`,
				onClick: () => setValue(name, ['profile-1'], { shouldDirty: true }),
			},
			selected?.join(',') || label,
		);
	},
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useResolveTenantProfileNamesMutation:
		mocks.useResolveTenantProfileNamesMutation,
	toResolveTenantProfileNameResolutions: (result: {
		names?: Array<{
			name?: string | null;
			profileId?: unknown;
			reason?: string | null;
		}> | null;
	}) =>
		(result?.names ?? []).map((item) => ({
			name: item.name ?? '',
			profileId: typeof item.profileId === 'string' ? item.profileId : null,
			reason:
				item.reason === 'not-found' || item.reason === 'ambiguous'
					? item.reason
					: null,
		})),
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { InviteTenantUserDrawer } from './_invite-user-drawer';

const csvFile = (content: string, name = 'invitees.csv'): File =>
	new File([content], name, { type: 'text/csv' });

const dropFile = (content: string, name?: string) => {
	const dropzone = screen.getByTestId('invite-dropzone');
	fireEvent.drop(dropzone, {
		dataTransfer: { files: [csvFile(content, name)] },
	});
};

describe('InviteTenantUserDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useBulkInviteTenantUsersMutation.mockReturnValue({
			mutateAsync: mocks.inviteMutation,
			isPending: false,
		});
		mocks.useResolveTenantProfileNamesMutation.mockReturnValue({
			mutateAsync: mocks.resolveNamesMutation,
			isPending: false,
		});
		mocks.resolveNamesMutation.mockResolvedValue({ names: [] });
	});

	afterEach(() => {
		cleanup();
	});

	test('renders nothing when closed', () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen={false}
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId('invite-tenant-user-drawer')).toBeNull();
	});

	test('sources the email placeholder from the localized email-placeholder key', () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText('Email').getAttribute('placeholder')).toBe(
			'nom@entreprise.com',
		);
	});

	// tenants-r6-F3: Cancel is a "close" path just like Escape/backdrop —
	// dirty edits must not be discarded silently.
	test('Cancel closes immediately when the form is pristine', () => {
		const onOpenChange = vi.fn();
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	test('Cancel on a dirty form asks for confirmation instead of discarding silently, and Leave page proceeds', () => {
		const onOpenChange = vi.fn();
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'someone@acme.com' },
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).not.toHaveBeenCalled();
		const dialog = screen.getByRole('alertdialog');

		fireEvent.click(within(dialog).getByRole('button', { name: 'Leave page' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// Round 2 (#1264): the dirty-flag uplink is event-driven (form watch),
	// so the host learns the state synchronously — including the clean
	// snapshot a freshly opened session replays over a stale parent flag.
	test('reports dirtiness synchronously and re-syncs a clean state on reopen', () => {
		const onDirtyChange = vi.fn();
		const baseProps = {
			tenantId: 'tenant-1',
			onOpenChange: vi.fn(),
			onInvited: vi.fn(),
			onSessionExpired: vi.fn(),
		};
		const { rerender } = render(
			<InviteTenantUserDrawer
				{...baseProps}
				isOpen
				onDirtyChange={onDirtyChange}
			/>,
		);

		expect(onDirtyChange).toHaveBeenCalledWith(false);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'someone@acme.com' },
		});

		expect(onDirtyChange).toHaveBeenLastCalledWith(true);

		// Close then reopen: the session-keyed remount seeds a fresh form, so
		// the uplink reports the clean snapshot it is now in.
		rerender(
			<InviteTenantUserDrawer
				{...baseProps}
				isOpen={false}
				onDirtyChange={onDirtyChange}
			/>,
		);
		rerender(
			<InviteTenantUserDrawer
				{...baseProps}
				isOpen
				onDirtyChange={onDirtyChange}
			/>,
		);

		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
	});

	test('submits the invitation, invalidates queries, and calls onInvited', async () => {
		mocks.inviteMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		const onInvited = vi.fn();

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={onInvited}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(mocks.inviteMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				invitations: [
					{
						email: 'new-user@example.com',
						accountLevel: 'User',
						profileIds: [],
					},
				],
			}),
		);
		await waitFor(() => expect(onInvited).toHaveBeenCalled());
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
	});

	test('expands pasted emails into rows with shared defaults and submits per-row overrides', async () => {
		mocks.inviteMutation.mockResolvedValue({
			succeededCount: 2,
			failedCount: 0,
			failedItems: [],
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Paste emails'), {
			target: { value: 'alice@example.com, bob@example.com' },
		});
		fireEvent.change(screen.getByLabelText('Shared account level'), {
			target: { value: 'Admin' },
		});
		fireEvent.click(
			screen.getByRole('button', {
				name: 'Shared profiles sharedProfileIds',
			}),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Add pasted emails' }));

		expect(screen.getAllByLabelText('Email')).toHaveLength(2);
		fireEvent.change(screen.getAllByLabelText('Account level')[1]!, {
			target: { value: 'User' },
		});
		fireEvent.change(screen.getAllByLabelText('Email')[1]!, {
			target: { value: '' },
		});
		fireEvent.change(screen.getAllByLabelText('Email')[1]!, {
			target: { value: 'alice@example.com' },
		});

		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(mocks.inviteMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				invitations: expect.arrayContaining([
					expect.objectContaining({
						accountLevel: 'User',
						profileIds: ['profile-1'],
					}),
					expect.objectContaining({
						accountLevel: 'Admin',
						profileIds: [],
					}),
				]),
			}),
		);
	});

	test('keeps only failed invitees after a mixed batch and renders translated reasons, never raw reason text', async () => {
		mocks.inviteMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [
				{
					index: 1,
					email: 'bob@example.com',
					translationKey: 'pending-invitation-exists',
					reason: 'RAW SERVER REASON',
				},
			],
		});

		const onDirtyChange = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={onOpenChange}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
				onDirtyChange={onDirtyChange}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Paste emails'), {
			target: { value: 'alice@example.com,bob@example.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add pasted emails' }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(screen.getAllByRole('alert').length).toBeGreaterThan(0),
		);
		const batchAlert = screen
			.getAllByRole('alert')
			.find((alert) => alert.textContent?.includes('bob@example.com'));
		expect(batchAlert).toBeTruthy();
		expect(batchAlert!.textContent).toContain(
			'A pending invitation already exists',
		);
		expect(batchAlert!.textContent).not.toContain('RAW SERVER REASON');
		expect(screen.getAllByLabelText('Email')).toHaveLength(1);
		expect(
			(screen.getAllByLabelText('Email')[0] as HTMLInputElement).value,
		).toBe('bob@example.com');

		await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByRole('alertdialog')).toBeTruthy();
	});

	test('blocks submission when an email is locally invalid and shows the offending row', async () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'not-an-email' },
		});

		expect(
			screen
				.getByRole('button', { name: 'Invite people' })
				.hasAttribute('disabled'),
		).toBe(true);
		expect(mocks.inviteMutation).not.toHaveBeenCalled();
	});

	test('maps a server email field error onto the email field via getFailureMessage, never the raw server string (r3-tenants-F15)', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			errors: {
				'Invitations[0].Email': ['Email must be a valid email address'],
			},
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(
				screen.getAllByText('Unable to send the invitation.').length,
			).toBeGreaterThan(0),
		);
		expect(
			screen.queryByText('Email must be a valid email address'),
		).toBeNull();
		expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe(
			'true',
		);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows both the email error and root summary for mixed validation fields', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			errors: {
				'Invitations[0].Email': ['Email must be a valid email address'],
				TenantId: ['Tenant is invalid'],
			},
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe(
				'true',
			),
		);
		expect(
			screen.getAllByText('Unable to send the invitation.').length,
		).toBeGreaterThan(0);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('routes general failures to the named local feedback owner', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 500,
			detail: 'Invitation failed',
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() => expect(mocks.inviteMutation).toHaveBeenCalledOnce());
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledOnce();
	});

	test('shows an inline root fallback for validation fields outside the invite controls', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 422,
			errors: { TenantId: ['Tenant is invalid'] },
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(
				screen.getAllByText('Unable to send the invitation.').length,
			).toBeGreaterThan(0),
		);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('redirects to logout when the invite request should end the session', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={onSessionExpired}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-user@example.com' },
		});
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
	});

	test('imports a CSV into file-provenance rows, hides the dropzone behind the file bar, and Clear file restores manual rows', async () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByTestId('invite-dropzone')).toBeTruthy();
		dropFile(
			'email,level,profiles\nfiona@example.com,admin,\ngeorge@example.com,user,\n',
		);

		await waitFor(() =>
			expect(screen.getByTestId('invite-file-bar')).toBeTruthy(),
		);
		expect(screen.queryByTestId('invite-dropzone')).toBeNull();
		expect(screen.getByTestId('invite-file-bar').textContent).toContain(
			'invitees.csv',
		);
		expect(screen.getByTestId('invite-file-bar').textContent).toContain(
			'Rows imported: 2',
		);
		expect(screen.getAllByText('from file')).toHaveLength(2);
		expect(screen.getByText('fiona@example.com')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Clear file' }));

		await waitFor(() =>
			expect(screen.queryByTestId('invite-file-bar')).toBeNull(),
		);
		expect(screen.getByTestId('invite-dropzone')).toBeTruthy();
		expect(screen.queryByText('fiona@example.com')).toBeNull();
	});

	test('flags a malformed email in a CSV import with a per-row error naming the offending address', async () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		dropFile(
			'email,level,profiles\nvalid@example.com,admin,\nnot-an-email,user,\n',
		);

		await waitFor(() =>
			expect(screen.getByTestId('invite-file-bar')).toBeTruthy(),
		);
		expect(
			screen.getByText(/Row for not-an-email is not a valid email address/),
		).toBeTruthy();
		expect(
			screen
				.getByRole('button', { name: 'Invite people' })
				.hasAttribute('disabled'),
		).toBe(true);
		expect(mocks.inviteMutation).not.toHaveBeenCalled();
	});

	test('rejects an unsupported extension with the localized type error', async () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		dropFile('whatever', 'invitees.txt');

		await waitFor(() =>
			expect(screen.getByText('Unsupported file type.')).toBeTruthy(),
		);
		expect(screen.queryByTestId('invite-file-bar')).toBeNull();
	});

	test('flags unresolved profile names per row and keeps Send disabled until they resolve', async () => {
		mocks.resolveNamesMutation.mockResolvedValue({
			names: [{ name: 'Ghost Profile', profileId: null, reason: 'not-found' }],
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		dropFile('email,level,profiles\nhelen@example.com,user,Ghost Profile\n');

		await waitFor(() =>
			expect(mocks.resolveNamesMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				names: ['Ghost Profile'],
			}),
		);
		await waitFor(() =>
			expect(screen.getByText('No profile named Ghost Profile.')).toBeTruthy(),
		);
		expect(
			screen
				.getByRole('button', { name: 'Invite people' })
				.hasAttribute('disabled'),
		).toBe(true);

		// Recovery flow: the staff member clears the bad file and re-imports
		// one whose profile name resolves; Send unlocks once every name
		// resolves.
		fireEvent.click(screen.getByRole('button', { name: 'Clear file' }));
		await waitFor(() =>
			expect(screen.queryByTestId('invite-file-bar')).toBeNull(),
		);
		mocks.resolveNamesMutation.mockResolvedValue({
			names: [
				{
					name: 'Real Profile',
					profileId: '11111111-1111-1111-1111-111111111111',
					reason: null,
				},
			],
		});
		dropFile('email,level,profiles\nhelen@example.com,user,Real Profile\n');

		await waitFor(() =>
			expect(mocks.resolveNamesMutation).toHaveBeenCalledTimes(2),
		);
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		expect(screen.queryByText('No profile named Ghost Profile.')).toBeNull();
	});

	test('stamps resolved profile ids onto file rows and submits them', async () => {
		mocks.inviteMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		mocks.resolveNamesMutation.mockResolvedValue({
			names: [
				{
					name: 'Reviewers',
					profileId: '22222222-2222-2222-2222-222222222222',
					reason: null,
				},
			],
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		dropFile('email,level,profiles\njames@example.com,user,Reviewers\n');

		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Invite people' })
					.hasAttribute('disabled'),
			).toBe(false),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(mocks.inviteMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				invitations: [
					{
						email: 'james@example.com',
						accountLevel: 'User',
						profileIds: ['22222222-2222-2222-2222-222222222222'],
					},
				],
			}),
		);
	});

	test('admin rows show the full-access note instead of a profile picker', async () => {
		mocks.resolveNamesMutation.mockResolvedValue({
			names: [{ name: 'Ghost Profile', profileId: null, reason: 'not-found' }],
		});

		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		dropFile('email,level,profiles\nkaren@example.com,admin,Ghost Profile\n');

		await waitFor(() =>
			expect(screen.getByTestId('invite-file-bar')).toBeTruthy(),
		);
		expect(
			screen.getByText('Admins get full access; profiles do not apply.'),
		).toBeTruthy();
		// No unresolved-profile alert for admins even though the name is unknown.
		expect(screen.queryByText(/No profile named/)).toBeNull();
		// Send stays available for the valid admin-only batch.
		expect(
			screen
				.getByRole('button', { name: 'Invite people' })
				.hasAttribute('disabled'),
		).toBe(false);
	});

	test('footer counts track the current batch size', async () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByText('People: 1')).toBeTruthy();

		fireEvent.change(screen.getByLabelText('Paste emails'), {
			target: { value: 'alice@example.com, bob@example.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Add pasted emails' }));

		await waitFor(() => expect(screen.getByText('People: 2')).toBeTruthy());

		fireEvent.click(
			screen.getAllByRole('button', { name: /Remove invitee/ })[0]!,
		);

		await waitFor(() => expect(screen.getByText('People: 1')).toBeTruthy());
	});

	test('downloads the documented CSV template', () => {
		render(
			<InviteTenantUserDrawer
				tenantId="tenant-1"
				isOpen
				onOpenChange={vi.fn()}
				onInvited={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Download template' }));

		expect(mocks.downloadFile).toHaveBeenCalledWith(
			expect.objectContaining({
				fileName: 'tenant-invite-template.csv',
			}),
		);
	});
});
