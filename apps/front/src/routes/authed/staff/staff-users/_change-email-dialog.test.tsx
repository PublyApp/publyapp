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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	updateEmailMutation: vi.fn(),
	useUpdateStaffUserEmailMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateStaffUsers: vi.fn().mockResolvedValue(undefined),
	displayLocalMutationFailure: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const resolvedKey = key.replace(/^common:/, '');
			const labels: TestLabelMap = {
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

			return labels[resolvedKey] ?? resolvedKey;
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
	Drawer: ({
		open,
		children,
		onOpenChange,
	}: {
		open: boolean;
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
	}) =>
		open
			? createElement(
					'div',
					{
						'data-testid': 'drawer-root',
						onKeyDown: (event: React.KeyboardEvent) => {
							if (event.key === 'Escape') {
								onOpenChange(false);
							}
						},
					},
					createElement('button', {
						type: 'button',
						'data-testid': 'drawer-backdrop',
						onClick: () => onOpenChange(false),
					}),
					children,
				)
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

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
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
			expect(screen.getByText('Invalid email address')).toBeTruthy(),
		);
		expect(mocks.updateEmailMutation).not.toHaveBeenCalled();
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
		expect(screen.queryByRole('alert')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows both the email error and root summary for mixed validation fields', async () => {
		mocks.updateEmailMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			errors: {
				Email: ['That email is already in use.'],
				UserId: ['User is invalid.'],
			},
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
				screen.getAllByText("Unable to update this user's email."),
			).toHaveLength(2),
		);
		expect(screen.getByRole('alert').textContent).toBe(
			"Unable to update this user's email.",
		);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('leaves general failures to central feedback without a persistent result block', async () => {
		mocks.updateEmailMutation.mockRejectedValue({
			status: 500,
			detail: 'Email update failed',
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
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(mocks.updateEmailMutation).toHaveBeenCalledOnce(),
		);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('shows an inline root fallback for validation fields outside the email control', async () => {
		mocks.updateEmailMutation.mockRejectedValue({
			status: 422,
			errors: { UserId: ['User is invalid'] },
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
			target: { value: 'new-email@latticecloud.com' },
		});
		fireEvent.submit(
			screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
		);

		await waitFor(() =>
			expect(
				screen.getByText("Unable to update this user's email."),
			).toBeTruthy(),
		);
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
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

	// users-auth-r1-F4: every Drawer close route must preserve a typed
	// replacement email until the user explicitly confirms discarding it.
	//
	// What these three cases do and do not establish, since this file exists to
	// stop tests overstating themselves. Cancel reaches `requestClose` through
	// its own onClick; Escape and backdrop reach it through the Drawer's
	// `onOpenChange`, which the previous mock dropped entirely — so a dialog
	// that guarded only the Cancel button used to pass. Two distinct production
	// paths are now covered, and Escape and backdrop are the same one twice.
	//
	// That Escape and an outside press actually reach `onOpenChange` is Base UI
	// `Dialog.Root` default behaviour, which the mock reproduces rather than
	// proves; `Drawer` is a bare passthrough and this dialog passes no
	// `dismissible={false}`. Confirming the real primitive dismisses on those
	// gestures needs the browser, and belongs with the e2e work in #1059.
	test.each([
		[
			'Escape',
			() =>
				fireEvent.keyDown(screen.getByTestId('drawer-root'), { key: 'Escape' }),
		],
		[
			'backdrop click',
			() => fireEvent.click(screen.getByTestId('drawer-backdrop')),
		],
		[
			'Cancel',
			() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
		],
	])(
		'%s on a dirty email shows the unsaved-changes confirmation instead of closing immediately',
		(_, requestClose) => {
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
			requestClose();

			expect(onOpenChange).not.toHaveBeenCalled();
			expect(screen.getByText('Leave without saving?')).toBeTruthy();
		},
	);

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

	// Round 2 (#1264): the form is keyed to the open session, so a
	// background refetch that replaces the `currentEmail` prop no longer
	// resets a draft the user is editing (the old effect keyed on
	// `[isOpen, currentEmail, reset]` wiped it on every refetch).
	test('keeps an in-progress draft when the currentEmail prop updates in place', () => {
		const baseProps = {
			userId: 'user-1',
			onOpenChange: vi.fn(),
			onUpdated: vi.fn(),
			onSessionExpired: vi.fn(),
		};
		const { rerender } = render(
			<ChangeStaffUserEmailDialog
				{...baseProps}
				currentEmail="rui@latticecloud.com"
				isOpen
			/>,
		);

		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'draft@latticecloud.com' },
		});

		rerender(
			<ChangeStaffUserEmailDialog
				{...baseProps}
				currentEmail="refetched@latticecloud.com"
				isOpen
			/>,
		);

		expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
			'draft@latticecloud.com',
		);
		expect(screen.getByTestId('change-staff-user-email-dialog')).toBeTruthy();
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
