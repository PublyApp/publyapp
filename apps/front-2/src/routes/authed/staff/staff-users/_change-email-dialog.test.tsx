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
	updateEmailMutation: vi.fn(),
	useUpdateStaffUserEmailMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateStaffUsers: vi.fn().mockResolvedValue(undefined),
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
				'change-email': 'Change email',
				'change-staff-user-email-description':
					'Send this user a new sign-in email address.',
				email: 'Email',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'update-staff-user-email-failed': "Unable to update this user's email.",
				'invalid-email-address': 'Invalid email address',
				'email-required': 'Email is required.',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				close: 'Close',
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
					disabled: isDisabled,
					type: 'email',
					...register(name),
				}),
				error ? createElement('p', undefined, error) : null,
			);
		},
	},
}));

vi.mock('~/lib/query/staff-users', () => ({
	invalidateStaffUsers: mocks.invalidateStaffUsers,
	useUpdateStaffUserEmailMutation: mocks.useUpdateStaffUserEmailMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { ChangeStaffUserEmailDialog } from './_change-email-dialog';

describe('ChangeStaffUserEmailDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateStaffUsers.mockResolvedValue(undefined);
		mocks.useUpdateStaffUserEmailMutation.mockReturnValue({
			mutateAsync: mocks.updateEmailMutation,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders nothing when closed', () => {
		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen={false}
				onOpenChange={vi.fn()}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId('change-staff-user-email-dialog')).toBeNull();
	});

	test('pre-fills the current email when opened', () => {
		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={vi.fn()}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
			'rui@latticecloud.com',
		);
	});

	// users-auth-r6-F4: this is the sole caller of
	// `useUpdateStaffUserEmailMutation` — proves the previously-unreachable
	// mutation is now actually wired end to end.
	test('submits the new email, invalidates staff-user queries, and calls onUpdated', async () => {
		mocks.updateEmailMutation.mockResolvedValue({ id: 'user-1' });
		const onUpdated = vi.fn();

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={vi.fn()}
				onUpdated={onUpdated}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateEmailMutation).toHaveBeenCalledWith({
				userId: 'user-1',
				email: 'new-email@latticecloud.com',
			}),
		);
		expect(mocks.invalidateStaffUsers).toHaveBeenCalled();
		expect(onUpdated).toHaveBeenCalledWith('new-email@latticecloud.com');
	});

	test('blocks submission when the email is invalid (email schema rule)', async () => {
		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={vi.fn()}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'not-an-email' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateEmailMutation).not.toHaveBeenCalled(),
		);
	});

	test('maps a server email field error onto the email field via getFailureMessage, never the raw server string', async () => {
		mocks.updateEmailMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			errors: { Email: ['That email is already in use.'] },
		});

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={vi.fn()}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'taken@latticecloud.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(
				screen.getByText("Unable to update this user's email."),
			).toBeTruthy(),
		);
		expect(screen.queryByText('That email is already in use.')).toBeNull();
	});

	test('redirects to logout when the update should end the session', async () => {
		mocks.updateEmailMutation.mockRejectedValue({ responseStatusCode: 401 });
		const onSessionExpired = vi.fn();
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={vi.fn()}
				onUpdated={vi.fn()}
				onSessionExpired={onSessionExpired}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
	});

	// users-auth-r1-F4: Cancel closed on every click with no guard, discarding
	// a typed replacement email with no confirmation.
	test('Cancel on a dirty email shows the unsaved-changes confirmation instead of closing immediately', () => {
		const onOpenChange = vi.fn();

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={onOpenChange}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByText('Leave without saving?')).toBeTruthy();
	});

	test('confirming the leave prompt closes the drawer via onOpenChange', () => {
		const onOpenChange = vi.fn();

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={onOpenChange}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('cancelling the leave prompt keeps the drawer open with the typed email intact', () => {
		const onOpenChange = vi.fn();

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={onOpenChange}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		fireEvent.click(
			screen
				.getByRole('alertdialog')
				.querySelector('[aria-label="Close"]') as HTMLElement,
		);

		expect(onOpenChange).not.toHaveBeenCalled();
		expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
			'new-email@latticecloud.com',
		);
	});

	test('Cancel on a pristine (unchanged) email closes immediately with no confirmation', () => {
		const onOpenChange = vi.fn();

		render(
			<ChangeStaffUserEmailDialog
				userId="user-1"
				currentEmail="rui@latticecloud.com"
				isOpen
				onOpenChange={onOpenChange}
				onUpdated={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(screen.queryByText('Leave without saving?')).toBeNull();
	});
});
