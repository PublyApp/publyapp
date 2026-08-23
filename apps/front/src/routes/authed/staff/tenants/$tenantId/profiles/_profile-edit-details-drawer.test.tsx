/**
 * @vitest-environment jsdom
 */
import {
	act,
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
	updateProfileMutation: vi.fn(),
	useUpdateStaffTenantProfileMutation: vi.fn(),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: Record<string, string> = {
				'edit-details': 'Edit details',
				'edit-details-subtitle': 'Rename or restyle the {{name}} profile.',
				'profile-icon-picker-hint': 'Tap the tile to change icon & color',
				'restore-automatic-profile-style': 'Use automatic style',
				'profile-details-management-note':
					'Permissions & members are managed in their own tabs.',
				'profile-name': 'Profile name',
				'profile-name-required': 'Profile name is required.',
				'profile-name-too-short': 'Enter at least 2 characters.',
				'profile-name-too-long': 'Profile name is too long.',
				description: 'Description',
				'profile-description-placeholder': 'Describe this profile',
				'profile-description-too-long': 'Description is too long.',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'profile-updated-successfully': 'Profile updated successfully.',
			};
			let text = labels[key] ?? key;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
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
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{ type: type ?? 'button', onClick, disabled },
			children,
		),
}));

vi.mock('~/components/ui/drawer', () => ({
	Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open ? createElement('div', null, children) : null,
	DrawerContent: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	DrawerHeader: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerTitle: ({ children }: { children: ReactNode }) =>
		createElement('h2', null, children),
	DrawerDescription: ({ children }: { children: ReactNode }) =>
		createElement('p', null, children),
	DrawerBody: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
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
	}) =>
		createElement(
			FormProvider as never,
			{ ...methods } as never,
			createElement('form', { onSubmit, role: 'form' }, children),
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
	}) =>
		createElement(
			FormProvider as never,
			{ ...methods } as never,
			createElement('form', { onSubmit, role: 'form' }, children),
		),
	Field: {
		Text: ({ name, label }: { name: string; label: string }) => {
			const { register, getFieldState, formState } = useFormContext();
			const error = getFieldState(name, formState).error;
			return createElement(
				'label',
				undefined,
				createElement('input', {
					'aria-label': label,
					type: 'text',
					...register(name),
				}),
				error?.message
					? createElement('span', { role: 'alert' }, error.message)
					: null,
			);
		},
		Textarea: ({ name, label }: { name: string; label: string }) => {
			const { register } = useFormContext();
			return createElement('textarea', {
				'aria-label': label,
				...register(name),
			});
		},
	},
}));

vi.mock('~/components/ui/icon-color-picker', () => ({
	IconColorPicker: ({
		value,
		onChange,
	}: {
		value: { icon?: string; tone?: string };
		onChange: (value: { icon: string; tone: string }) => void;
	}) =>
		createElement(
			'button',
			{
				type: 'button',
				'aria-label': 'Choose icon and color',
				'data-icon': value.icon,
				'data-tone': value.tone,
				onClick: () => onChange({ icon: 'briefcase', tone: '6' }),
			},
			'Choose icon and color',
		),
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: () => null,
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useUpdateStaffTenantProfileMutation:
		mocks.useUpdateStaffTenantProfileMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn(),
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

import { ProfileEditDetailsDrawer } from './_profile-edit-details-drawer';

describe('ProfileEditDetailsDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useUpdateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync: mocks.updateProfileMutation,
			isPending: false,
		});
		mocks.updateProfileMutation.mockResolvedValue(undefined);
	});

	afterEach(cleanup);

	// #1342 — paired contract: pristine means zero requests, and the contract
	// "no change → no request / disabled Save" is enforced at BOTH layers
	// (disabled button + submit-handler guard). Submitting the form directly,
	// bypassing the button, proves the handler layer.
	test('pristine submit sends no PATCH and Save stays disabled', async () => {
		const onSaved = vi.fn();
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			true,
		);

		act(() => {
			fireEvent.submit(screen.getByRole('form'));
		});

		await waitFor(() =>
			expect(mocks.updateProfileMutation).not.toHaveBeenCalled(),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});

	test('dirty submit sends exactly one PATCH and re-enables Save', async () => {
		const onSaved = vi.fn();
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Create and edit posts' },
		});
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			false,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledTimes(1),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('profile-1'));
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			false,
		);
	});

	test('submits only name, description, concrete icon, and concrete tone', async () => {
		const onSaved = vi.fn();
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		const picker = screen.getByRole('button', {
			name: 'Choose icon and color',
		});
		expect(picker.getAttribute('data-icon')).toBeTruthy();
		expect(picker.getAttribute('data-tone')).toBeTruthy();
		expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
		expect(screen.queryByTestId('profile-permissions-checklist')).toBeNull();
		expect(screen.queryByTestId('permissions-filter')).toBeNull();
		expect(
			screen.getByText('Permissions & members are managed in their own tabs.'),
		).toBeTruthy();

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Editors' },
		});
		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Create and edit posts' },
		});
		fireEvent.click(picker);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				name: 'Editors',
				description: 'Create and edit posts',
				icon: 'briefcase',
				tone: '6',
			}),
		);
		expect(onSaved).toHaveBeenCalledWith('profile-1');
	});

	test('first edit sends the derived automatic style for an unmodified null-style profile', async () => {
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		const picker = screen.getByRole('button', {
			name: 'Choose icon and color',
		});
		expect(picker.getAttribute('data-icon')).toBeTruthy();
		expect(picker.getAttribute('data-tone')).toBeTruthy();

		// #1342: a pristine form must never PATCH, so the automatic-style body
		// is proven on the first real (dirty) save instead.
		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Draft posts, updated' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				name: 'Author',
				description: 'Draft posts, updated',
				icon: null,
				tone: null,
			}),
		);
	});

	test('restores automatic styling after a custom style was selected', async () => {
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: 'shield-check',
					tone: '4',
				}}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Use automatic style' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				name: 'Author',
				description: 'Draft posts',
				icon: null,
				tone: null,
			}),
		);
	});

	test('blocks submission when the profile name has only one character', async () => {
		render(
			<ProfileEditDetailsDrawer
				tenantId="tenant-1"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Author',
					description: 'Draft posts',
					icon: null,
					tone: null,
				}}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'A' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).not.toHaveBeenCalled(),
		);
		expect(screen.getByRole('alert').textContent).toBe(
			'Enter at least 2 characters.',
		);
	});
});
