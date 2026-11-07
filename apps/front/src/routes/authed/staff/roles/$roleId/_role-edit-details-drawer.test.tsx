/**
 * @vitest-environment jsdom
 */
/**
 * #819 — the staff-role detail page's edit drawer.
 *
 * Mirrors the tenant `_role-edit-details-drawer.test.tsx`: the data layer
 * (mutation hook, cache invalidation, toasts) is faked, the form semantics are
 * exercised for real through React Hook Form + Zod.
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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	updateRoleMutation: vi.fn(),
	useUpdateStaffRoleMutation: vi.fn(),
	invalidateStaffRoles: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	displayLocalMutationFailure: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				// staff-tenant-roles scope-neutral catalogue (shared with #980)
				'edit-details': 'Edit details',
				'edit-details-subtitle': 'Rename or restyle the {{name}} role.',
				'role-icon-picker-hint': 'Tap the tile to change icon & color',
				'restore-automatic-role-style': 'Use automatic style',
				'role-details-management-note':
					'Permissions & members are managed in their own tabs.',
				// common
				'role-name': 'Role name',
				'role-name-required': 'Role name is required.',
				'role-name-too-short': 'Enter at least 2 characters.',
				'role-name-too-long': 'Role name is too long.',
				description: 'Description',
				'role-description-placeholder':
					'Describe the responsibilities for this role',
				'role-description-too-long': 'Description is too long.',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'role-updated-successfully': 'Role updated successfully.',
				'role-save-failed': 'Unable to save this role.',
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
		onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void;
	}) => (
		<FormProvider {...methods}>
			<form onSubmit={onSubmit} role="form">
				{children}
			</form>
		</FormProvider>
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

vi.mock('~/lib/query/staff-roles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-roles')>();

	return {
		invalidateStaffRoles: mocks.invalidateStaffRoles,
		useUpdateStaffRoleMutation: mocks.useUpdateStaffRoleMutation,
		toStaffRoleDetails: actual.toStaffRoleDetails,
	};
});

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

import { StaffRoleEditDetailsDrawer } from './_role-edit-details-drawer';

const renderDrawer = (
	overrides: Partial<Parameters<typeof StaffRoleEditDetailsDrawer>[0]> = {},
) => {
	const props = {
		isOpen: true,
		role: {
			id: 'role-1',
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

	render(<StaffRoleEditDetailsDrawer {...props} />);

	return props;
};

describe('StaffRoleEditDetailsDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useUpdateStaffRoleMutation.mockReturnValue({
			mutateAsync: mocks.updateRoleMutation,
			isPending: false,
		});
		mocks.updateRoleMutation.mockResolvedValue(undefined);
	});

	afterEach(cleanup);

	// #1342 — paired contract: pristine means zero requests, and the contract
	// "no change → no request / disabled Save" is enforced at BOTH layers
	// (disabled button + submit-handler guard). Submitting the form directly,
	// bypassing the button, proves the handler layer.
	test('pristine submit sends no PATCH and Save stays disabled', async () => {
		const { onSaved } = renderDrawer();

		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			true,
		);

		act(() => {
			fireEvent.submit(screen.getByRole('form'));
		});

		await waitFor(() =>
			expect(mocks.updateRoleMutation).not.toHaveBeenCalled(),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});

	test('dirty submit sends exactly one PATCH and re-enables Save', async () => {
		const { onSaved } = renderDrawer();

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Full access, updated' },
		});
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			false,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateRoleMutation).toHaveBeenCalledTimes(1),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('role-1'));
		expect(mocks.invalidateStaffRoles).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
			'disabled',
			false,
		);
	});

	test('submits name, description, concrete icon, and concrete tone with the role id', async () => {
		const { onSaved } = renderDrawer();

		fireEvent.change(screen.getByLabelText('Role name'), {
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
			expect(mocks.updateRoleMutation).toHaveBeenCalledWith({
				roleId: 'role-1',
				name: 'Editors',
				description: 'Create and edit posts',
				icon: 'briefcase',
				tone: '6',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateStaffRoles).toHaveBeenCalledTimes(1),
		);
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Role updated successfully.',
		);
		expect(onSaved).toHaveBeenCalledWith('role-1');
	});

	test('first edit sends the derived automatic style for an unmodified null-style role', async () => {
		renderDrawer();

		// #1342: a pristine form must never PATCH, so the automatic-style body
		// is proven on the first real (dirty) save instead.
		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Full access, updated' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateRoleMutation).toHaveBeenCalledWith({
				roleId: 'role-1',
				name: 'Platform admin',
				description: 'Full access, updated',
				icon: null,
				tone: null,
			}),
		);
	});

	test('restores automatic styling after a custom style was selected', async () => {
		renderDrawer({
			role: {
				id: 'role-1',
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
			expect(mocks.updateRoleMutation).toHaveBeenCalledWith({
				roleId: 'role-1',
				name: 'Platform admin',
				description: 'Full access',
				icon: null,
				tone: null,
			}),
		);
	});

	test('blocks submission when the role name has only one character', async () => {
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'P' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe(
				'Enter at least 2 characters.',
			),
		);
		expect(mocks.updateRoleMutation).not.toHaveBeenCalled();
	});

	test('clearing the description submits an empty string, which the PATCH body turns into an explicit null', async () => {
		renderDrawer({
			role: {
				id: 'role-1',
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
		// `buildUpdateStaffRoleBody` and is proven in
		// `src/lib/query/staff-roles.test.ts`.
		await waitFor(() =>
			expect(mocks.updateRoleMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					roleId: 'role-1',
					description: '',
				}),
			),
		);
	});

	test('maps a 422 Name field error inline instead of a generic banner', async () => {
		mocks.updateRoleMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { Name: ['This role name is unavailable.'] },
		});
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Duplicate' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(
			await screen.findByText('This role name is unavailable.'),
		).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows an unmappable 422 field as an inline summary message', async () => {
		mocks.updateRoleMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: { UnknownField: ['The role payload is invalid.'] },
		});
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Dirty so the submit reaches the API' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(
			await screen.findByText('The role payload is invalid.'),
		).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	// #1342: a 422 whose `errors` map is empty classifies as a *problem*
	// (`toValidationFailure` requires non-empty errors), so the pre-fix code
	// fell through to the toast path and the form showed nothing. The drawer
	// owns every 422 of a save it submitted: the root banner is required even
	// when there is nothing to map.
	test('shows the root banner for a 422 validation problem with empty errors', async () => {
		mocks.updateRoleMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: {},
		});
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Dirty so the submit reaches the API' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		const banner = await screen.findByText('Validation failed');
		expect(banner.getAttribute('role')).toBe('alert');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	// Pinning the other half of the routing: a non-validation problem (e.g. a
	// 500) keeps going to the local failure toast and must NOT raise the form
	// banner — otherwise the 422 branch above would silently swallow those.
	test('routes non-validation failures to the local failure toast instead of the form banner', async () => {
		mocks.updateRoleMutation.mockRejectedValue({
			status: 500,
			responseStatusCode: 500,
			title: 'Internal error',
		});
		renderDrawer();

		fireEvent.change(screen.getByLabelText('Description'), {
			target: { value: 'Dirty so the submit reaches the API' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				expect.objectContaining({ responseStatusCode: 500 }),
				'Unable to save this role.',
			),
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	test('reports dirty state changes so the page can arm its nav guard', async () => {
		const { onDirtyChange } = renderDrawer();

		expect(onDirtyChange).toHaveBeenCalledWith(false);

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Renamed role' },
		});

		await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
	});
});
