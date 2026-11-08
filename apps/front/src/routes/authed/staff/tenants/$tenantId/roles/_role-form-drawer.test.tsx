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
import {
	FormProvider,
	useForm,
	useFormContext,
	type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	createRoleMutation: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useCreateStaffTenantRoleMutation: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'new-role': 'New role',
				'role-form-drawer-description': 'Configure this role.',
				'role-name': 'Role name',
				'tenant-role-name-placeholder': 'Approvers',
				'role-name-required': 'Role name is required.',
				'role-name-too-short': 'Enter at least 2 characters.',
				'role-name-too-long': 'Role name is too long.',
				description: 'Description',
				'role-description-placeholder':
					'Describe the responsibilities for this role',
				'role-description-too-long': 'Description is too long.',
				'loading-permissions': 'Loading permissions…',
				'tenant-permission-catalog-load-failed': 'Unable to load permissions.',
				'no-permissions-available': 'No permission keys are available.',
				cancel: 'Cancel',
				'create-role': 'Create role',
				'role-save-failed': 'Unable to save this tenant role.',
				'role-created-successfully': 'Role created successfully',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
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

vi.mock('~/components/ui/checkbox', () => ({
	Checkbox: ({
		checked,
		disabled,
		onCheckedChange,
		...props
	}: {
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
		'aria-label'?: string;
	}) =>
		createElement('input', {
			...props,
			type: 'checkbox',
			checked,
			disabled,
			onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
				onCheckedChange(event.target.checked),
		}),
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
		Text: ({
			name,
			label,
			isDisabled,
		}: {
			name: string;
			label: string;
			isDisabled?: boolean;
		}) => {
			const { register, getFieldState, formState } = useFormContext();
			const error = getFieldState(name, formState).error;
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('input', {
					'aria-label': label,
					disabled: isDisabled,
					type: 'text',
					...register(name),
				}),
				error?.message
					? createElement('span', { role: 'alert' }, error.message)
					: null,
			);
		},
		Textarea: ({
			name,
			label,
			isDisabled,
		}: {
			name: string;
			label: string;
			isDisabled?: boolean;
		}) => {
			const { register } = useFormContext();
			return createElement(
				'label',
				undefined,
				createElement('span', undefined, label),
				createElement('textarea', {
					'aria-label': label,
					disabled: isDisabled,
					...register(name),
				}),
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

vi.mock('~/lib/query/staff-tenant-roles', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/staff-tenant-roles')
	>('~/lib/query/staff-tenant-roles');

	return {
		...actual,
		STAFF_TENANT_ROLES_QUERY_KEY: ['staff', 'staff-tenants', 'roles'],
		STAFF_TENANT_ROLE_DETAILS_QUERY_KEY: [
			'staff',
			'staff-tenants',
			'roles',
			'detail',
		],
		STAFF_TENANT_ROLE_PERMISSION_KEYS_QUERY_KEY: [
			'staff',
			'staff-tenants',
			'roles',
			'permission-keys',
		],
		useStaffTenantPermissionCatalogQuery:
			mocks.useStaffTenantPermissionCatalogQuery,
		useCreateStaffTenantRoleMutation: mocks.useCreateStaffTenantRoleMutation,
	};
});

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
	},
}));

import { RoleFormDrawer } from './_role-form-drawer';
import {
	getRoleFormValues,
	roleFormResolver,
	type RoleFormValues,
} from './_role-form-schema';

/**
 * The drawer no longer owns its form: the host page creates it with `useForm`
 * and passes the instance down. These tests mirror that ownership through a
 * minimal owner component — the hook must run inside a render, and each
 * `renderDrawer` call re-creates the store so tests never share form state.
 */
let methods: UseFormReturn<RoleFormValues>;

const DrawerHarness = (
	props: Partial<Parameters<typeof RoleFormDrawer>[0]> & {
		isOpen?: boolean;
	},
): ReactNode => {
	const { t } = useTranslation('common');
	methods = useForm<RoleFormValues>({
		resolver: roleFormResolver(t),
		defaultValues: getRoleFormValues(),
	});

	return (
		<RoleFormDrawer
			tenantId="tenant-1"
			isOpen={true}
			onOpenChange={vi.fn()}
			onSaved={vi.fn()}
			onSessionExpired={vi.fn()}
			methods={methods}
			{...props}
		/>
	);
};

const renderDrawer = (
	props: Partial<Parameters<typeof RoleFormDrawer>[0]> & {
		isOpen?: boolean;
	} = {},
): void => {
	render(<DrawerHarness {...props} />);
};

const CATALOG = {
	Users: {
		read: { key: 'users.read', name: 'Read users', description: 'View users.' },
		write: { key: 'users.write', name: 'Edit users', description: null },
	},
	Posts: {
		publish: {
			key: 'posts.publish',
			name: 'Publish posts',
			description: null,
		},
	},
};

describe('RoleFormDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue({
			data: { additionalData: CATALOG },
			isPending: false,
			isError: false,
		});
		mocks.useCreateStaffTenantRoleMutation.mockReturnValue({
			mutateAsync: mocks.createRoleMutation,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders nothing when closed', () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: false,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		expect(screen.queryByTestId('role-form-drawer')).toBeNull();
	});

	test('renders the permission catalog grouped by module', () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		expect(screen.getByText('Users')).toBeTruthy();
		expect(screen.getByText('Posts')).toBeTruthy();
		expect(screen.getByText('Read users')).toBeTruthy();
		expect(screen.getByText('Publish posts')).toBeTruthy();
		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenCalledWith({
			language: 'en',
		});
	});

	test('renders the pending label while the permission catalog loads', () => {
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
		});

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		expect(screen.getByText('Loading permissions…')).toBeTruthy();
		expect(screen.queryByTestId('role-permissions-checklist')).toBeNull();
	});

	test('renders the error label when the permission catalog fails', () => {
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: new Error('catalog down'),
		});

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		expect(screen.getByText('catalog down')).toBeTruthy();
		expect(screen.queryByTestId('role-permissions-checklist')).toBeNull();
	});

	// tenants-r6-F3: Cancel is a "close" path just like Escape/backdrop —
	// dirty edits must not be discarded silently.
	test('Cancel closes immediately when the form is pristine', () => {
		const onOpenChange = vi.fn();
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: onOpenChange,
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	test('Cancel on a dirty form asks for confirmation instead of discarding silently, and Leave page proceeds', () => {
		const onOpenChange = vi.fn();
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: onOpenChange,
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Approvers' },
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).not.toHaveBeenCalled();
		const dialog = screen.getByRole('alertdialog');

		fireEvent.click(within(dialog).getByRole('button', { name: 'Leave page' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('create mode submits concrete icon, tone, description, and all staged permission keys', async () => {
		mocks.createRoleMutation.mockResolvedValue({
			role: { id: 'role-1' },
		});
		const onSaved = vi.fn();

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: onSaved,
			onSessionExpired: vi.fn(),
		});

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Approvers' },
		});
		expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
		const picker = screen.getByRole('button', {
			name: 'Choose icon and color',
		});
		expect(picker.getAttribute('data-icon')).toBeTruthy();
		expect(picker.getAttribute('data-tone')).toBeTruthy();
		fireEvent.click(picker);
		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByLabelText('Publish posts'));
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		await waitFor(() =>
			expect(mocks.createRoleMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: 'tenant-1',
					name: 'Approvers',
					icon: 'briefcase',
					tone: '6',
					permissionKeys: ['users.read', 'posts.publish'],
				}),
			),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('role-1'));
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Role created successfully',
		);
		expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
	});

	test('blocks submission when the role name is empty', async () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		await waitFor(() =>
			expect(mocks.createRoleMutation).not.toHaveBeenCalled(),
		);
	});

	test('blocks submission when the role name has only one character', async () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'A' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		await waitFor(() =>
			expect(mocks.createRoleMutation).not.toHaveBeenCalled(),
		);
		expect(screen.getByRole('alert').textContent).toBe(
			'Enter at least 2 characters.',
		);
	});

	test('maps role validation inline and keeps unmappable fields visible', async () => {
		mocks.createRoleMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: {
				Name: ['This role name is unavailable.'],
				UnknownField: ['The role payload is invalid.'],
			},
		});

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});
		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		expect(
			await screen.findByText('This role name is unavailable.'),
		).toBeTruthy();
		expect(screen.getByText('The role payload is invalid.')).toBeTruthy();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('reports a general role-save failure through one local error owner', async () => {
		const error = {
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
		};
		mocks.createRoleMutation.mockRejectedValue(error);

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});
		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				error,
				'Unable to save this tenant role.',
			),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Unable to save this tenant role.')).toBeNull();
	});

	test('redirects to logout when saving should end the session', async () => {
		mocks.createRoleMutation.mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: onSessionExpired,
		});

		fireEvent.change(screen.getByLabelText('Role name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
});
