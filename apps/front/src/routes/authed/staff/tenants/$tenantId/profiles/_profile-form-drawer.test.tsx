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
	createProfileMutation: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useCreateStaffTenantProfileMutation: vi.fn(),
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
				'new-profile': 'New profile',
				'profile-form-drawer-description': 'Configure this profile.',
				'profile-name': 'Profile name',
				'tenant-profile-name-placeholder': 'Approvers',
				'profile-name-required': 'Profile name is required.',
				'profile-name-too-short': 'Enter at least 2 characters.',
				'profile-name-too-long': 'Profile name is too long.',
				description: 'Description',
				'profile-description-placeholder':
					'Describe the responsibilities for this profile',
				'profile-description-too-long': 'Description is too long.',
				'loading-permissions': 'Loading permissions…',
				'tenant-permission-catalog-load-failed': 'Unable to load permissions.',
				'no-permissions-available': 'No permission keys are available.',
				cancel: 'Cancel',
				'create-profile': 'Create profile',
				'profile-save-failed': 'Unable to save this tenant profile.',
				'profile-created-successfully': 'Profile created successfully',
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

vi.mock('~/lib/query/staff-tenant-profiles', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/staff-tenant-profiles')
	>('~/lib/query/staff-tenant-profiles');

	return {
		...actual,
		STAFF_TENANT_PROFILES_QUERY_KEY: ['staff', 'staff-tenants', 'profiles'],
		STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY: [
			'staff',
			'staff-tenants',
			'profiles',
			'detail',
		],
		STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY: [
			'staff',
			'staff-tenants',
			'profiles',
			'permission-keys',
		],
		useStaffTenantPermissionCatalogQuery:
			mocks.useStaffTenantPermissionCatalogQuery,
		useCreateStaffTenantProfileMutation:
			mocks.useCreateStaffTenantProfileMutation,
	};
});

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
	},
}));

import { ProfileFormDrawer } from './_profile-form-drawer';
import {
	getProfileFormValues,
	profileFormResolver,
	type ProfileFormValues,
} from './_profile-form-schema';

/**
 * The drawer no longer owns its form: the host page creates it with `useForm`
 * and passes the instance down. These tests mirror that ownership through a
 * minimal owner component — the hook must run inside a render, and each
 * `renderDrawer` call re-creates the store so tests never share form state.
 */
let methods: UseFormReturn<ProfileFormValues>;

const DrawerHarness = (
	props: Partial<Parameters<typeof ProfileFormDrawer>[0]> & {
		isOpen?: boolean;
	},
): ReactNode => {
	const { t } = useTranslation('common');
	methods = useForm<ProfileFormValues>({
		resolver: profileFormResolver(t),
		defaultValues: getProfileFormValues(),
	});

	return (
		<ProfileFormDrawer
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
	props: Partial<Parameters<typeof ProfileFormDrawer>[0]> & {
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

describe('ProfileFormDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue({
			data: { additionalData: CATALOG },
			isPending: false,
			isError: false,
		});
		mocks.useCreateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync: mocks.createProfileMutation,
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

		expect(screen.queryByTestId('profile-form-drawer')).toBeNull();
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

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onOpenChange).not.toHaveBeenCalled();
		const dialog = screen.getByRole('alertdialog');

		fireEvent.click(within(dialog).getByRole('button', { name: 'Leave page' }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('create mode submits concrete icon, tone, description, and all staged permission keys', async () => {
		mocks.createProfileMutation.mockResolvedValue({
			profile: { id: 'profile-1' },
		});
		const onSaved = vi.fn();

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: onSaved,
			onSessionExpired: vi.fn(),
		});

		fireEvent.change(screen.getByLabelText('Profile name'), {
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
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.createProfileMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: 'tenant-1',
					name: 'Approvers',
					icon: 'briefcase',
					tone: '6',
					permissionKeys: ['users.read', 'posts.publish'],
				}),
			),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('profile-1'));
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Profile created successfully',
		);
		expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
	});

	test('blocks submission when the profile name is empty', async () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.createProfileMutation).not.toHaveBeenCalled(),
		);
	});

	test('blocks submission when the profile name has only one character', async () => {
		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'A' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.createProfileMutation).not.toHaveBeenCalled(),
		);
		expect(screen.getByRole('alert').textContent).toBe(
			'Enter at least 2 characters.',
		);
	});

	test('maps profile validation inline and keeps unmappable fields visible', async () => {
		mocks.createProfileMutation.mockRejectedValue({
			status: 422,
			responseStatusCode: 422,
			title: 'Validation failed',
			errors: {
				Name: ['This profile name is unavailable.'],
				UnknownField: ['The profile payload is invalid.'],
			},
		});

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});
		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		expect(
			await screen.findByText('This profile name is unavailable.'),
		).toBeTruthy();
		expect(screen.getByText('The profile payload is invalid.')).toBeTruthy();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('reports a general profile-save failure through one local error owner', async () => {
		const error = {
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
		};
		mocks.createProfileMutation.mockRejectedValue(error);

		renderDrawer({
			tenantId: 'tenant-1',
			isOpen: true,
			onOpenChange: vi.fn(),
			onSaved: vi.fn(),
			onSessionExpired: vi.fn(),
		});
		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				error,
				'Unable to save this tenant profile.',
			),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByText('Unable to save this tenant profile.'),
		).toBeNull();
	});

	test('redirects to logout when saving should end the session', async () => {
		mocks.createProfileMutation.mockRejectedValue({
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

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
});
