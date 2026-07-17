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
	within,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	assignMutateAsync: vi.fn().mockResolvedValue(undefined),
	unassignMutateAsync: vi.fn().mockResolvedValue(undefined),
	useAssignStaffTenantProfilePermissionMutation: vi.fn(),
	useUnassignStaffTenantProfilePermissionMutation: vi.fn(),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	toastSuccess: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: Record<string, string> = {
				permissions: 'Permissions',
				'profile-permissions-subtitle':
					'Toggle what this profile can do. Changes save when you hit Save.',
				'filter-permissions': 'Filter permissions…',
				'expand-all': 'Expand all',
				'collapse-all': 'Collapse all',
				'clear-all': 'Clear all',
				discard: 'Discard',
				'save-changes': 'Save changes',
				'permissions-unsaved-changes_one': '{{count}} unsaved change',
				'permissions-unsaved-changes_other': '{{count}} unsaved changes',
				'toggle-all-module-permissions': 'Toggle all {{module}} permissions',
				'permission-changed-indicator': 'changed',
				'loading-permissions': 'Loading available permissions…',
				'tenant-permission-catalog-load-failed':
					'Unable to load the tenant permission catalog.',
				'no-permissions-available': 'No permission keys are available.',
				'profile-updated-successfully': 'Profile updated successfully.',
				'permissions-save-failed': "Some permission changes couldn't be saved.",
				'tenant-profile-permission-update-partial-success':
					'Updated {{succeeded}} permission(s), {{failed}} failed.',
			};

			const pluralKey =
				typeof options?.count === 'number'
					? `${key}_${options.count === 1 ? 'one' : 'other'}`
					: undefined;
			let text =
				(pluralKey === undefined ? undefined : labels[pluralKey]) ??
				labels[key] ??
				key;
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

vi.mock('~/components/ui/input', () => ({
	Input: ({
		value,
		onChange,
		...props
	}: {
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
	}) => createElement('input', { value, onChange, ...props }),
}));

vi.mock('~/components/ui/checkbox', () => ({
	Checkbox: ({
		checked,
		indeterminate,
		disabled,
		onCheckedChange,
		...props
	}: {
		checked?: boolean;
		indeterminate?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) =>
		createElement('input', {
			type: 'checkbox',
			checked: Boolean(checked),
			disabled,
			'data-indeterminate': indeterminate ? 'true' : undefined,
			onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
				onCheckedChange?.(event.target.checked),
			...props,
		}),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: { success: mocks.toastSuccess },
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useAssignStaffTenantProfilePermissionMutation:
		mocks.useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation:
		mocks.useUnassignStaffTenantProfilePermissionMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { ProfilePermissionsTab } from './_profile-permissions-tab';

const PERMISSION_GROUPS = [
	{
		moduleKey: 'posts',
		moduleLabel: 'Posts',
		options: [
			{ key: 'posts.view', label: 'View posts', description: null },
			{ key: 'posts.create', label: 'Create posts', description: null },
		],
	},
	{
		moduleKey: 'channels',
		moduleLabel: 'Channels',
		options: [
			{ key: 'channels.view', label: 'View channels', description: null },
		],
	},
];

const renderTab = (
	overrides: Partial<Parameters<typeof ProfilePermissionsTab>[0]> = {},
) => {
	const props = {
		tenantId: 'tenant-1',
		profileId: 'profile-1',
		grantedKeys: ['posts.view'],
		permissionGroups: PERMISSION_GROUPS,
		isCatalogPending: false,
		isCatalogError: false,
		catalogError: null,
		onDirtyChange: vi.fn(),
		onSessionExpired: vi.fn(),
		...overrides,
	};
	return { props, ...render(<ProfilePermissionsTab {...props} />) };
};

describe('ProfilePermissionsTab', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.assignMutateAsync.mockResolvedValue(undefined);
		mocks.unassignMutateAsync.mockResolvedValue(undefined);
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: mocks.assignMutateAsync,
		});
		mocks.useUnassignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: mocks.unassignMutateAsync,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the matrix from the catalog groups and granted keys', () => {
		renderTab();

		const postsModule = screen.getByTestId('permission-module-posts');
		// Header count reflects staged-granted / total for the whole module.
		expect(within(postsModule).getByText('1/2')).toBeTruthy();

		const viewPostsRow = screen.getByTestId('permission-row-posts.view');
		expect(
			within(viewPostsRow).getByRole('checkbox') as HTMLInputElement,
		).toBeTruthy();
		expect(
			(within(viewPostsRow).getByRole('checkbox') as HTMLInputElement).checked,
		).toBe(true);
		expect(
			(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
		// Mono permission keys are shown.
		expect(within(viewPostsRow).getByText('posts.view')).toBeTruthy();
		// No unsaved changes yet → no action bar.
		expect(screen.queryByTestId('permissions-change-status')).toBeNull();
	});

	test('staging a toggle surfaces the dirty count, summary and reports dirtiness', () => {
		const { props } = renderTab();

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);

		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'1 unsaved change · +Create posts',
		);
		// Changed row is flagged for screen readers and visually.
		const changedRow = screen.getByTestId('permission-row-posts.create');
		expect(changedRow.getAttribute('data-changed')).toBe('true');
		expect(within(changedRow).getByText('changed')).toBeTruthy();
		expect(props.onDirtyChange).toHaveBeenCalledWith(true);
	});

	test('pluralizes the unsaved-changes count', () => {
		renderTab();

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);
		fireEvent.click(
			within(screen.getByTestId('permission-row-channels.view')).getByRole(
				'checkbox',
			),
		);

		expect(
			screen.getByTestId('permissions-change-status').textContent,
		).toContain('2 unsaved changes');
	});

	test('saves staged changes as per-key assign/unassign diffs and clears the bar', async () => {
		const { props } = renderTab({ grantedKeys: ['posts.view'] });

		// Add channels.view, remove posts.view.
		fireEvent.click(
			within(screen.getByTestId('permission-row-channels.view')).getByRole(
				'checkbox',
			),
		);
		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.view')).getByRole(
				'checkbox',
			),
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);

		expect(mocks.assignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			permissionKey: 'channels.view',
		});
		expect(mocks.unassignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			permissionKey: 'posts.view',
		});
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Profile updated successfully.',
		);
		await waitFor(() =>
			expect(screen.queryByTestId('permissions-change-status')).toBeNull(),
		);
		expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
	});

	test('discards staged changes and reverts to the granted baseline', () => {
		renderTab();

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);
		expect(screen.getByTestId('permissions-change-status')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

		expect(screen.queryByTestId('permissions-change-status')).toBeNull();
		expect(
			(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
	});

	test('a module select-all toggles every permission in that module', () => {
		renderTab({ grantedKeys: [] });

		const postsModule = screen.getByTestId('permission-module-posts');
		fireEvent.click(
			within(postsModule).getByRole('checkbox', {
				name: 'Toggle all Posts permissions',
			}),
		);

		expect(
			(
				within(screen.getByTestId('permission-row-posts.view')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			screen.getByTestId('permissions-change-status').textContent,
		).toContain('2 unsaved changes');
	});

	test('clear all stages the removal of every granted permission', () => {
		renderTab({ grantedKeys: ['posts.view', 'channels.view'] });

		fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

		expect(
			screen.getByTestId('permissions-change-status').textContent,
		).toContain('2 unsaved changes');
		expect(
			(
				within(screen.getByTestId('permission-row-posts.view')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
	});

	test('filters permission rows by label or key', () => {
		renderTab();

		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: 'channels' },
		});

		expect(screen.queryByTestId('permission-row-posts.view')).toBeNull();
		expect(screen.getByTestId('permission-row-channels.view')).toBeTruthy();
	});

	test('surfaces a partial-failure message and keeps the bar when a save fails', async () => {
		mocks.assignMutateAsync.mockRejectedValueOnce(new Error('boom'));
		renderTab({ grantedKeys: [] });

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.view')).getByRole(
				'checkbox',
			),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(
			await screen.findByText('Updated 0 permission(s), 1 failed.'),
		).toBeTruthy();
		// Bar remains for retry.
		expect(screen.getByTestId('permissions-change-status')).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('escalates a session-expiring save failure to onSessionExpired', async () => {
		mocks.assignMutateAsync.mockRejectedValueOnce(new Error('expired'));
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const { props } = renderTab({ grantedKeys: [] });

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.view')).getByRole(
				'checkbox',
			),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(props.onSessionExpired).toHaveBeenCalled());
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('reports not-dirty on unmount so a confirmed leave cannot re-block', () => {
		const onDirtyChange = vi.fn();
		const { unmount } = renderTab({ onDirtyChange });

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);

		act(() => unmount());
		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
	});
});
