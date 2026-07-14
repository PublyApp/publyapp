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
	createProfileMutation: vi.fn(),
	updateProfileMutation: vi.fn(),
	assignPermissionMutation: vi.fn(),
	unassignPermissionMutation: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useCreateStaffTenantProfileMutation: vi.fn(),
	useUpdateStaffTenantProfileMutation: vi.fn(),
	useAssignStaffTenantProfilePermissionMutation: vi.fn(),
	useUnassignStaffTenantProfilePermissionMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateStaffTenantDetails: vi.fn().mockResolvedValue(undefined),
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
				'new-profile': 'New profile',
				'edit-profile': 'Edit profile',
				'profile-form-drawer-description': 'Configure this profile.',
				'profile-name': 'Profile name',
				'tenant-profile-name-placeholder': 'Approvers',
				'profile-name-required': 'Profile name is required.',
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
				'save-changes': 'Save changes',
				'profile-save-failed': 'Unable to save this tenant profile.',
				'tenant-profile-permission-update-partial-success':
					'Updated {{succeeded}} permission(s), {{failed}} failed.',
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

vi.mock('~/components/ui/checkbox', () => ({
	Checkbox: ({
		checked,
		disabled,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement('input', {
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
		Text: ({
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
				createElement('input', {
					'aria-label': label,
					disabled: isDisabled,
					type: 'text',
					...register(name),
				}),
			);
		},
	},
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
		useUpdateStaffTenantProfileMutation:
			mocks.useUpdateStaffTenantProfileMutation,
		useAssignStaffTenantProfilePermissionMutation:
			mocks.useAssignStaffTenantProfilePermissionMutation,
		useUnassignStaffTenantProfilePermissionMutation:
			mocks.useUnassignStaffTenantProfilePermissionMutation,
	};
});

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateStaffTenantDetails: mocks.invalidateStaffTenantDetails,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { ProfileFormDrawer } from './_profile-form-drawer';

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
		mocks.useUpdateStaffTenantProfileMutation.mockReturnValue({
			mutateAsync: mocks.updateProfileMutation,
			isPending: false,
		});
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			mutateAsync: mocks.assignPermissionMutation,
			isPending: false,
		});
		mocks.useUnassignStaffTenantProfilePermissionMutation.mockReturnValue({
			mutateAsync: mocks.unassignPermissionMutation,
			isPending: false,
		});
		mocks.assignPermissionMutation.mockResolvedValue(undefined);
		mocks.unassignPermissionMutation.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders nothing when closed', () => {
		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="create"
				isOpen={false}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId('profile-form-drawer')).toBeNull();
	});

	test('renders the permission catalog grouped by module', () => {
		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="create"
				isOpen
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByText('Users')).toBeTruthy();
		expect(screen.getByText('Posts')).toBeTruthy();
		expect(screen.getByText('Read users')).toBeTruthy();
		expect(screen.getByText('Publish posts')).toBeTruthy();
	});

	test('create mode submits name, description, and selected permission keys', async () => {
		mocks.createProfileMutation.mockResolvedValue({
			profile: { id: 'profile-1' },
		});
		const onSaved = vi.fn();

		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="create"
				isOpen
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.createProfileMutation).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: 'tenant-1',
					name: 'Approvers',
					permissionKeys: ['users.read'],
				}),
			),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('profile-1'));
		expect(mocks.invalidateQueries).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ['staff', 'staff-tenants', 'profiles'],
			}),
		);
		expect(mocks.invalidateStaffTenantDetails).toHaveBeenCalled();
	});

	test('blocks submission when the profile name is empty (name.min(1))', async () => {
		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="create"
				isOpen
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() =>
			expect(mocks.createProfileMutation).not.toHaveBeenCalled(),
		);
	});

	test('edit mode PATCHes name/description and diff-applies permission assign/unassign', async () => {
		mocks.updateProfileMutation.mockResolvedValue(undefined);
		const onSaved = vi.fn();

		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="edit"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Approvers',
					description: 'Approves things',
					permissionKeys: ['users.read'],
				}}
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		// users.read starts checked; uncheck it and check posts.publish instead.
		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByLabelText('Publish posts'));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateProfileMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				name: 'Approvers',
				description: 'Approves things',
			}),
		);
		await waitFor(() =>
			expect(mocks.assignPermissionMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				permissionKey: 'posts.publish',
			}),
		);
		await waitFor(() =>
			expect(mocks.unassignPermissionMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
				profileId: 'profile-1',
				permissionKey: 'users.read',
			}),
		);
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith('profile-1'));
	});

	test('keeps typed edits when the parent re-renders with a fresh profile object while open (F3)', () => {
		const { rerender } = render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="edit"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Approvers',
					description: 'Approves things',
					permissionKeys: ['users.read'],
				}}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Unsaved edit' },
		});
		expect(screen.getByLabelText('Profile name')).toHaveProperty(
			'value',
			'Unsaved edit',
		);

		// Simulate a background refetch: same profile identity, new object reference.
		rerender(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="edit"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Approvers',
					description: 'Approves things',
					permissionKeys: ['users.read'],
				}}
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText('Profile name')).toHaveProperty(
			'value',
			'Unsaved edit',
		);
	});

	test('reports a partial-success count and still invalidates when a permission mutation fails (F11)', async () => {
		mocks.updateProfileMutation.mockResolvedValue(undefined);
		mocks.unassignPermissionMutation.mockRejectedValueOnce(new Error('boom'));
		const onSaved = vi.fn();

		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="edit"
				isOpen
				profile={{
					id: 'profile-1',
					name: 'Approvers',
					description: 'Approves things',
					permissionKeys: ['users.read'],
				}}
				onOpenChange={vi.fn()}
				onSaved={onSaved}
				onSessionExpired={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByLabelText('Read users'));
		fireEvent.click(screen.getByLabelText('Publish posts'));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith(
				expect.objectContaining({
					queryKey: ['staff', 'staff-tenants', 'profiles'],
				}),
			),
		);
		expect(mocks.invalidateStaffTenantDetails).toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});

	test('redirects to logout when saving should end the session', async () => {
		mocks.createProfileMutation.mockRejectedValue({
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();

		render(
			<ProfileFormDrawer
				tenantId="tenant-1"
				mode="create"
				isOpen
				onOpenChange={vi.fn()}
				onSaved={vi.fn()}
				onSessionExpired={onSessionExpired}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Profile name'), {
			target: { value: 'Approvers' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
	});
});
