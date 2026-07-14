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
import { createElement, type ReactNode } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	inviteMutation: vi.fn(),
	useInviteTenantUserMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'invite-tenant-user': 'Invite tenant user',
				'invite-tenant-user-description': 'Send a single tenant invitation.',
				email: 'Email',
				'account-level': 'Account level',
				admin: 'Admin',
				user: 'User',
				cancel: 'Cancel',
				'invite-people': 'Invite people',
				'invite-tenant-user-failed': 'Unable to send the invitation.',
			};

			return labels[key] ?? key;
		},
		i18n: { language: 'en' },
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
}));

vi.mock('~/components/field', () => ({
	Form: ({
		children,
		methods,
		onSubmit,
	}: {
		children: ReactNode;
		methods: import('react-hook-form').UseFormReturn;
		onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
	}) =>
		createElement(
			FormProvider as never,
			{ ...methods } as never,
			createElement('form', { onSubmit }, children),
		),
	Field: {
		Email: ({
			name,
			label,
			isDisabled,
		}: {
			name: string;
			label: string;
			isDisabled?: boolean;
		}) => {
			const {
				register,
				formState: { errors },
			} = useFormContext();
			const error = errors[name]?.message as string | undefined;
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					'aria-invalid': error ? 'true' : undefined,
					disabled: isDisabled,
					type: 'email',
					...register(name),
				}),
				error ? createElement('p', undefined, error) : null,
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
	useInviteTenantUserMutation: mocks.useInviteTenantUserMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { InviteTenantUserDrawer } from './_invite-user-drawer';

describe('InviteTenantUserDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useInviteTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.inviteMutation,
			isPending: false,
		});
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

	test('submits the invitation, invalidates queries, and calls onInvited', async () => {
		mocks.inviteMutation.mockResolvedValue({ id: 'invitation-1' });
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
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(mocks.inviteMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				email: 'new-user@example.com',
				accountLevel: 'User',
			}),
		);
		await waitFor(() => expect(onInvited).toHaveBeenCalled());
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
	});

	test('blocks submission when the email is invalid (email schema rule)', async () => {
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
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() => expect(mocks.inviteMutation).not.toHaveBeenCalled());
	});

	test('maps a server email field error onto the email field via getFailureMessage, never the raw server string (r3-tenants-F15)', async () => {
		mocks.inviteMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			errors: { Email: ['Email must be a valid email address'] },
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
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() =>
			expect(screen.getByText('Unable to send the invitation.')).toBeTruthy(),
		);
		expect(
			screen.queryByText('Email must be a valid email address'),
		).toBeNull();
		expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe(
			'true',
		);
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
		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
	});
});
