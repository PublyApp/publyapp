/**
 * @vitest-environment jsdom
 */
/**
 * #819 — the staff-profile detail page's edit drawer.
 *
 * Mirrors the tenant `_profile-edit-details-drawer.test.tsx`: the data layer
 * (mutation hook, cache invalidation, toasts) is faked, the form semantics are
 * exercised for real through React Hook Form + Zod.
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
	updateProfileMutation: vi.fn(),
	useUpdateStaffProfileMutation: vi.fn(),
	invalidateStaffProfiles: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: Record<string, string> = {
				// staff-tenant-profiles scope-neutral catalogue (shared with #980)
				'edit-details': 'Edit details',
				'edit-details-subtitle': 'Rename or restyle the {{name}} profile.',
				'profile-icon-picker-hint': 'Tap the tile to change icon & color',
				'restore-automatic-profile-style': 'Use automatic style',
				'profile-details-management-note':
					'Permissions & members are managed in their own tabs.',
				// common
				'profile-name': 'Profile name',
				'profile-name-required': 'Profile name is required.',
				'profile-name-too-short': 'Enter at least 2 characters.',
				'profile-name-too-long': 'Profile name is too long.',
				description: 'Description',
				'profile-description-placeholder':
					'Describe the responsibilities for this profile',
				'profile-description-too-long': 'Description is too long.',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'profile-updated-successfully': 'Profile updated successfully.',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description': 'You have unsaved changes.',
				'leave-page': 'Leave page',
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
		onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
	}) =>
		createElement(
			FormProvider as never,
			{ ...methods } as never,
			createElement('form', { onSubmit }, children),
		),
}));

vi.mock('~/components/field', () => ({
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
			const { register, getFieldState, formState } = useFormContext();
			const error = getFieldState(name, formState).error;
			return createElement(
				'label',
				undefined,
				createElement('textarea', {
					'aria-label': label,
					...register(name),
				}),
				error?.message
					? createElement('span', { role: 'alert' }, error.message)
					: null,
			);
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

vi.mock('~/lib/query/staff-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-profiles')>();

	return {
		invalidateStaffProfiles: mocks.invalidateStaffProfiles,
		useUpdateStaffProfileMutation: mocks.useUpdateStaffProfileMutation,
		toStaffProfileDetails: actual.toStaffProfileDetails,
	};
});

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn(),
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

import { StaffProfileEditDetailsDrawer } from './_profile-edit-details-drawer';

const renderDrawer = (
	overrides: Partial<Parameters<typeof StaffProfileEditDetailsDrawer>[0]> = {},
) => {
	const props = {
		isOpen: true,
		profile: {
			id: 'profile-1',
			name: 'Platform admin',
			description: 'Full access',
			icon: null,
			tone: null,
		},
		onOpenChange: vi.fn(),
		onSaved: vi.fn(),
		onSessionExpired: vi.fn(),
		onDirtyChange: vi.fn(),
		...overrides,
	};

	render(<StaffProfileEditDetailsDrawer {...props} />);

	return props;
};

describe('StaffProfileEditDetailsDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useUpdateStaffProfileMutation.mockReturnValue({
			mutateAsync: mocks.updateProfileMutation,
			isPending: false,
		});
		mocks.updateProfileMutation.mockResolvedValue(undefined);
	});

	afterEach(cleanup);

	test('submits name, description, concrete icon, and concrete tone with the profile id', async () => {
		const { onSaved } = renderDrawer();

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Editors' },
		});
		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Create and edit posts' },
		});
		fireEvent.click(
			screen.getByRole('button', { name: 'Choose icon and color' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				profileId: 'profile-1',
				name: 'Editors',
				description: 'Create and edit posts',
				icon: 'briefcase',
				tone: '6',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledTimes(1),
		);
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Profile updated successfully.',
		);
		expect(onSaved).toHaveBeenCalledWith('profile-1');
	});

	test('preserves the derived automatic style when an unmodified null-style profile is saved', async () => {
		renderDrawer();

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				profileId: 'profile-1',
				name: 'Platform admin',
				description: 'Full access',
				icon: null,
				tone: null,
			}),
		);
	});

	test('restores automatic styling after a custom style was selected', async () => {
		renderDrawer({
			profile: {
				id: 'profile-1',
				name: 'Platform admin',
				description: 'Full access',
				icon: 'shield-check',
				tone: '4',
			},
		});

		fireEvent.click(
			screen.getByRole('button', { name: 'Use automatic style' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				profileId: 'profile-1',
				name: 'Platform admin',
				description: 'Full access',
				icon: null,
				tone: null,
			}),
		);
	});

	test('blocks submission when the profile name has only one character', async () => {
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'P' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe(
				'Enter at least 2 characters.',
			),
		);
		expect(mocks.updateProfileMutation).not.toHaveBeenCalled();
	});

	test('clearing the description submits an empty string, which the PATCH body turns into an explicit null', async () => {
		renderDrawer({
			profile: {
				id: 'profile-1',
				name: 'Platform admin',
				description: 'Full access',
				icon: null,
				tone: null,
			},
		});

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: '' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		// Component boundary: the raw cleared value reaches the mutation. The
		// '' -> explicit-null wire mapping happens in
		// `buildUpdateStaffProfileBody` and is proven in
		// `src/lib/query/staff-profiles.test.ts`.
		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					profileId: 'profile-1',
					description: '',
				}),
			),
		);
	});

	test('maps a 422 Name field error inline instead of a generic banner', async () => {
		mocks.updateProfileMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { Name: ['This profile name is unavailable.'] },
		});
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Duplicate' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(
			await screen.findByText('This profile name is unavailable.'),
		).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows an unmappable 422 field as an inline summary message', async () => {
		mocks.updateProfileMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { UnknownField: ['The profile payload is invalid.'] },
		});
		renderDrawer();

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(
			await screen.findByText('The profile payload is invalid.'),
		).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('reports dirty state changes so the page can arm its nav guard', async () => {
		const { onDirtyChange } = renderDrawer();

		expect(onDirtyChange).toHaveBeenCalledWith(false);

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Renamed profile' },
		});

		await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
	});
});
