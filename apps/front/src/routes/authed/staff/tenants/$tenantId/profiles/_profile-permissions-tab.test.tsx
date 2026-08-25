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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	assignMutateAsync: vi.fn().mockResolvedValue(undefined),
	unassignMutateAsync: vi.fn().mockResolvedValue(undefined),
	useAssignStaffTenantProfilePermissionMutation: vi.fn(),
	useUnassignStaffTenantProfilePermissionMutation: vi.fn(),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	toastSuccess: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	permissionKeysQueryData: { permissionKeys: ['posts.view'] },
	permissionKeysQueryUpdatedAt: 1,
	permissionKeysQueryUpdateCount: 1,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		getQueryData: () => mocks.permissionKeysQueryData,
		getQueryState: () => ({
			dataUpdatedAt: mocks.permissionKeysQueryUpdatedAt,
			dataUpdateCount: mocks.permissionKeysQueryUpdateCount,
		}),
		invalidateQueries: vi.fn(),
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resourceKey = key.includes(':') ? key.split(':')[1] : key;
			const labels: TestLabelMap = {
				permissions: 'Permissions',
				'profile-permissions-subtitle':
					'Toggle what this profile can do. Changes save when you hit Save.',
				'filter-permissions': 'Filter permissions…',
				'clear-permissions-filter': 'Clear permission filter',
				'expand-all': 'Expand all',
				'collapse-all': 'Collapse all',
				'clear-all': 'Clear all',
				discard: 'Discard',
				'save-changes': 'Save changes',
				'permissions-unsaved-changes_one': '{{count}} unsaved change',
				'permissions-unsaved-changes_other': '{{count}} unsaved changes',
				'permissions-no-unsaved-changes': 'No unsaved changes',
				'toggle-all-module-permissions': 'Toggle all {{module}} permissions',
				'permission-changed-indicator': 'changed',
				'loading-permissions': 'Loading available permissions…',
				'tenant-permission-catalog-load-failed':
					'Unable to load the tenant permission catalog.',
				'no-permissions-available': 'No permission keys are available.',
				'profile-updated-successfully': 'Profile updated successfully.',
				'permissions-save-failed': "Some permission changes couldn't be saved.",
				'permissions-save-partial': '{{saved}}, {{failed}}.',
				'permissions-selected-total': '{{selected}} of {{total}} selected',
				'permissions-saved-count_one': '{{count}} change saved',
				'permissions-saved-count_other': '{{count}} changes saved',
				'permissions-failed-count_one': '{{count}} change failed',
				'permissions-failed-count_other': '{{count}} changes failed',
			};

			const pluralKey =
				typeof options?.count === 'number'
					? `${resourceKey}_${options.count === 1 ? 'one' : 'other'}`
					: undefined;
			let text =
				(pluralKey === undefined ? undefined : labels[pluralKey]) ??
				labels[resourceKey] ??
				resourceKey;
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
	buildStaffTenantPermissionGroupColumns: (
		groups: typeof PERMISSION_GROUPS,
	) => {
		const leftFlow = [
			'posts',
			'media',
			'calendar',
			'invitations',
			'audit_logs',
			'modules',
		];
		const rightFlow = [
			'channels',
			'approvals',
			'analytics',
			'members',
			'settings',
			'billing',
			'profiles',
		];
		const groupByModuleKey = new Map(
			groups.map((group) => [group.moduleKey, group]),
		);
		return [
			leftFlow.flatMap((moduleKey) => {
				const group = groupByModuleKey.get(moduleKey);
				return group ? [group] : [];
			}),
			rightFlow.flatMap((moduleKey) => {
				const group = groupByModuleKey.get(moduleKey);
				return group ? [group] : [];
			}),
		];
	},
	getStaffTenantProfilePermissionKeysCacheSnapshot: (queryClient: {
		getQueryData: () => { permissionKeys: string[] };
		getQueryState: () => { dataUpdateCount: number };
	}) => ({
		permissionKeys: queryClient.getQueryData().permissionKeys,
		revision: queryClient.getQueryState().dataUpdateCount,
	}),
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
		grantedRevision: 1,
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
		mocks.permissionKeysQueryData = { permissionKeys: ['posts.view'] };
		mocks.permissionKeysQueryUpdatedAt = 1;
		mocks.permissionKeysQueryUpdateCount = 1;
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
		expect(within(postsModule).getByText('1 / 2')).toBeTruthy();

		const viewPostsRow = screen.getByTestId('permission-row-posts.view');
		// Each per-permission toggle is queryable by its accessible name (the
		// human permission label), proving it is properly labelled.
		expect(
			(
				within(viewPostsRow).getByRole('checkbox', {
					name: 'View posts',
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			(
				screen.getByRole('checkbox', {
					name: 'Create posts',
				}) as HTMLInputElement
			).checked,
		).toBe(false);
		// Mono permission keys are shown.
		expect(within(viewPostsRow).getByText('posts.view')).toBeTruthy();
		// #976: the action bar is always rendered, even with nothing staged —
		// the status line shows the clean-state message instead of "0 unsaved
		// changes", and the buttons are disabled rather than the bar unmounting.
		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'No unsaved changes',
		);
	});

	test('assigns all canonical modules to the reference matrix column flows', () => {
		const moduleKeys = [
			'posts',
			'media',
			'calendar',
			'channels',
			'approvals',
			'analytics',
			'members',
			'invitations',
			'profiles',
			'settings',
			'billing',
			'audit_logs',
			'modules',
		];
		renderTab({
			permissionGroups: moduleKeys.map((moduleKey) => ({
				moduleKey,
				moduleLabel: moduleKey,
				options: [
					{
						key: `${moduleKey}.view`,
						label: `View ${moduleKey}`,
						description: null,
					},
				],
			})),
		});

		const leftColumn = screen.getByTestId(
			'permission-module-posts',
		).parentElement;
		const rightColumn = screen.getByTestId(
			'permission-module-channels',
		).parentElement;

		expect(leftColumn).toBeTruthy();
		expect(rightColumn).toBeTruthy();
		expect(
			Array.from(leftColumn?.children ?? []).map((node) =>
				node.getAttribute('data-testid'),
			),
		).toEqual([
			'permission-module-posts',
			'permission-module-media',
			'permission-module-calendar',
			'permission-module-invitations',
			'permission-module-audit_logs',
			'permission-module-modules',
		]);
		expect(
			Array.from(rightColumn?.children ?? []).map((node) =>
				node.getAttribute('data-testid'),
			),
		).toEqual([
			'permission-module-channels',
			'permission-module-approvals',
			'permission-module-analytics',
			'permission-module-members',
			'permission-module-settings',
			'permission-module-billing',
			'permission-module-profiles',
		]);
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
		// Changed row is flagged visually and for screen readers: the visible dot
		// is aria-hidden, and the change is announced as the checkbox's accessible
		// DESCRIPTION (aria-describedby) so it survives the explicit aria-label
		// name — asserted via the accessible description, not a CSS class.
		const changedRow = screen.getByTestId('permission-row-posts.create');
		expect(changedRow.getAttribute('data-changed')).toBe('true');
		expect(within(changedRow).getByText('•').getAttribute('aria-hidden')).toBe(
			'true',
		);
		const changedCheckbox = within(changedRow).getByRole('checkbox', {
			name: 'Create posts',
		});
		const describedById = changedCheckbox.getAttribute('aria-describedby');
		expect(describedById).toBeTruthy();
		const describedByNode = describedById
			? changedRow.ownerDocument.getElementById(describedById)
			: null;
		expect(describedByNode?.textContent).toBe('changed');
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

		// Exactly one assign + one unassign — no over-firing of extra calls.
		expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		expect(mocks.assignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			permissionKey: 'channels.view',
		});
		expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1);
		expect(mocks.unassignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			permissionKey: 'posts.view',
		});
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Profile updated successfully.',
		);
		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);
		expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
		// Focus moves to the tab heading when the action bar closes on save.
		expect(document.activeElement).toBe(
			screen.getByRole('heading', { name: 'Permissions' }),
		);
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

		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'No unsaved changes',
		);
		expect(
			(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
		// The action bar (which held focus) unmounts — focus moves to the tab
		// heading, never falling to <body>.
		expect(document.activeElement).toBe(
			screen.getByRole('heading', { name: 'Permissions' }),
		);
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

	test('a total save failure surfaces honest counts and keeps the whole change dirty', async () => {
		mocks.assignMutateAsync.mockRejectedValueOnce(new Error('boom'));
		renderTab({ grantedKeys: [] });

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		// Natural-language plural, no "(s)" parentheticals.
		expect(
			await screen.findByText('0 changes saved, 1 change failed.'),
		).toBeTruthy();
		// Nothing persisted → the change stays dirty for retry.
		expect(
			screen.getByTestId('permissions-change-status').textContent,
		).toContain('1 unsaved change');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a mixed save reconciles: only the failed key stays dirty and is retried', async () => {
		// Add channels.view (assign fulfils), remove posts.view (unassign fails).
		mocks.assignMutateAsync.mockResolvedValue(undefined);
		mocks.unassignMutateAsync.mockRejectedValueOnce(new Error('boom'));
		renderTab({ grantedKeys: ['posts.view'] });

		fireEvent.click(screen.getByRole('checkbox', { name: 'View channels' }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		// Honest counts: one saved, one failed.
		expect(
			await screen.findByText('1 change saved, 1 change failed.'),
		).toBeTruthy();

		// The fulfilled assign advanced the baseline — channels.view is now
		// persisted (checked, no longer flagged as changed).
		const channelsRow = screen.getByTestId('permission-row-channels.view');
		expect(
			(within(channelsRow).getByRole('checkbox') as HTMLInputElement).checked,
		).toBe(true);
		expect(channelsRow.getAttribute('data-changed')).toBeNull();

		// The failed unassign stayed dirty — posts.view is still flagged and the
		// bar shows exactly one remaining unsaved change.
		const postsRow = screen.getByTestId('permission-row-posts.view');
		expect(postsRow.getAttribute('data-changed')).toBe('true');
		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'1 unsaved change · −View posts',
		);

		// A second Save must retry ONLY the failed operation: no assign, and a
		// single unassign for posts.view (proves persisted keys are not resent).
		mocks.assignMutateAsync.mockClear();
		mocks.unassignMutateAsync.mockClear();
		mocks.unassignMutateAsync.mockResolvedValue(undefined);
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1),
		);
		expect(mocks.unassignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			permissionKey: 'posts.view',
		});
		expect(mocks.assignMutateAsync).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);
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

	test('rebases to server truth that arrived while dirty when the user discards', () => {
		const { props, rerender } = renderTab({ grantedKeys: ['posts.view'] });

		// Stage an edit → dirty.
		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);
		expect(screen.getByTestId('permissions-change-status')).toBeTruthy();

		// A background refetch delivers newer server truth WHILE dirty. It must be
		// deferred, not applied mid-edit.
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['posts.view', 'channels.view']}
				grantedRevision={2}
			/>,
		);
		expect(screen.getByTestId('permissions-change-status')).toBeTruthy();

		// Discarding returns to a clean state → the deferred server truth is now
		// adopted as the new baseline (channels.view granted, nothing dirty).
		fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'No unsaved changes',
		);
		expect(
			(
				within(screen.getByTestId('permission-row-channels.view')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			screen
				.getByTestId('permission-row-channels.view')
				.getAttribute('data-changed'),
		).toBeNull();
	});

	test('rebases to server truth that arrived while dirty when the user manually reverts', () => {
		const { props, rerender } = renderTab({ grantedKeys: ['posts.view'] });

		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['posts.view', 'channels.view']}
				grantedRevision={2}
			/>,
		);
		expect(screen.getByTestId('permissions-change-status')).toBeTruthy();

		// Manually toggle the staged change back off → returns to the (old)
		// baseline and becomes clean, which rebases onto the deferred truth.
		fireEvent.click(
			within(screen.getByTestId('permission-row-posts.create')).getByRole(
				'checkbox',
			),
		);

		expect(screen.getByTestId('permissions-change-status').textContent).toBe(
			'No unsaved changes',
		);
		expect(
			(
				within(screen.getByTestId('permission-row-channels.view')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(true);
	});

	test('keeps saved truth when a server update lands during save, then adopts a later revision', async () => {
		let resolveAssign: (() => void) | undefined;
		mocks.assignMutateAsync.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveAssign = resolve;
				}),
		);
		mocks.invalidateAllStaffTenantScopes.mockRejectedValueOnce(
			new Error('refresh boom'),
		);
		const { props, rerender } = renderTab({
			grantedKeys: [],
			grantedRevision: 1,
		});

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		await waitFor(() =>
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1),
		);

		// A background result arrives before the write settles. It is newer than the
		// locally adopted baseline, but cannot yet be known to follow the write.
		mocks.permissionKeysQueryData = { permissionKeys: ['channels.view'] };
		mocks.permissionKeysQueryUpdateCount = 2;
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={2}
			/>,
		);
		act(() => resolveAssign?.());

		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(true);
		expect(
			(
				screen.getByRole('checkbox', {
					name: 'View channels',
				}) as HTMLInputElement
			).checked,
		).toBe(false);

		// The same server signature is observed again after the save generation.
		// A revision guard must adopt it instead of suppressing it forever.
		mocks.permissionKeysQueryUpdateCount = 3;
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={3}
			/>,
		);
		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'View channels',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(false);
	});

	test('guards a cache update whose render is delayed until after save settlement', async () => {
		let resolveAssign: (() => void) | undefined;
		mocks.assignMutateAsync.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveAssign = resolve;
				}),
		);
		mocks.invalidateAllStaffTenantScopes.mockRejectedValueOnce(
			new Error('refresh boom'),
		);
		mocks.permissionKeysQueryData = { permissionKeys: [] };
		const { props, rerender } = renderTab({
			grantedKeys: [],
			grantedRevision: 1,
		});

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		await waitFor(() =>
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1),
		);

		// The stale pre-write request reaches the query cache, but React has not
		// committed its observer render yet. The save generation must still see
		// this revision directly in the cache when the write settles.
		mocks.permissionKeysQueryData = { permissionKeys: ['channels.view'] };
		mocks.permissionKeysQueryUpdateCount = 2;
		act(() => resolveAssign?.());

		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);

		// Flush the delayed observer render only after settlement/invalidation.
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={2}
			/>,
		);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(true);
		expect(
			(
				screen.getByRole('checkbox', {
					name: 'View channels',
				}) as HTMLInputElement
			).checked,
		).toBe(false);

		// A genuinely later server revision remains eligible for normal adoption.
		mocks.permissionKeysQueryData = { permissionKeys: ['channels.view'] };
		mocks.permissionKeysQueryUpdateCount = 3;
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={3}
			/>,
		);
		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'View channels',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(false);
	});

	test('adopts refreshed cache truth whose observer render is delayed until after invalidation', async () => {
		let resolveInvalidation: (() => void) | undefined;
		mocks.invalidateAllStaffTenantScopes.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveInvalidation = resolve;
				}),
		);
		mocks.permissionKeysQueryData = { permissionKeys: [] };
		const { props, rerender } = renderTab({
			grantedKeys: [],
			grantedRevision: 1,
		});

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalledTimes(1),
		);

		// The writes have settled, so revision 1 is the suppression boundary. The
		// awaited invalidation then refreshes the exact scoped cache entry with
		// authoritative truth, while its observer render remains queued.
		mocks.permissionKeysQueryData = { permissionKeys: ['channels.view'] };
		mocks.permissionKeysQueryUpdateCount = 2;
		act(() => resolveInvalidation?.());
		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);

		// Flush the delayed observer render after generation close. Revision 2 is
		// newer than the write-settlement boundary and must be adopted.
		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={2}
			/>,
		);
		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'View channels',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(false);
	});

	test('adopts refreshed truth when the timestamp is unchanged but the update count advances', async () => {
		let resolveInvalidation: (() => void) | undefined;
		mocks.invalidateAllStaffTenantScopes.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveInvalidation = resolve;
				}),
		);
		mocks.permissionKeysQueryData = { permissionKeys: [] };
		mocks.permissionKeysQueryUpdatedAt = 42;
		mocks.permissionKeysQueryUpdateCount = 1;
		const { props, rerender } = renderTab({
			grantedKeys: [],
			grantedRevision: 1,
		});

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalledTimes(1),
		);

		mocks.permissionKeysQueryData = { permissionKeys: ['channels.view'] };
		mocks.permissionKeysQueryUpdateCount = 2;
		act(() => resolveInvalidation?.());
		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);

		rerender(
			<ProfilePermissionsTab
				{...props}
				grantedKeys={['channels.view']}
				grantedRevision={2}
			/>,
		);
		await waitFor(() =>
			expect(
				(
					screen.getByRole('checkbox', {
						name: 'View channels',
					}) as HTMLInputElement
				).checked,
			).toBe(true),
		);
		expect(mocks.permissionKeysQueryUpdatedAt).toBe(42);
		expect(
			(screen.getByRole('checkbox', { name: 'View posts' }) as HTMLInputElement)
				.checked,
		).toBe(false);
	});

	test('a refresh failure after a successful save is not reported as a save failure', async () => {
		mocks.invalidateAllStaffTenantScopes.mockRejectedValueOnce(
			new Error('refresh boom'),
		);
		const { props } = renderTab({ grantedKeys: [] });

		fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		// The write persisted → success is preserved despite the refresh rejecting.
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Profile updated successfully.',
			),
		);
		expect(screen.queryByText('0 changes saved, 1 change failed.')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			),
		);
		expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
	});

	test('a filtered module keeps whole-module select-all + indeterminate semantics', () => {
		renderTab({ grantedKeys: ['posts.view'] });

		// Filter so only posts.create is visible; posts.view (granted) is hidden.
		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: 'create' },
		});
		expect(screen.queryByTestId('permission-row-posts.view')).toBeNull();
		expect(screen.getByTestId('permission-row-posts.create')).toBeTruthy();

		const postsModule = screen.getByTestId('permission-module-posts');
		// Mixed staged state across the WHOLE module (1 of 2 granted) →
		// indeterminate, even though the granted row is filtered out of view.
		expect(
			within(postsModule)
				.getByRole('checkbox', { name: 'Toggle all Posts permissions' })
				.getAttribute('data-indeterminate'),
		).toBe('true');

		// Select-all acts on the whole module per its a11y label — visible AND
		// hidden — completing the module.
		fireEvent.click(
			within(postsModule).getByRole('checkbox', {
				name: 'Toggle all Posts permissions',
			}),
		);
		expect(
			screen.getByTestId('permissions-change-status').textContent,
		).toContain('1 unsaved change');

		// Clear the filter: the whole module is granted, incl. the row hidden
		// during select-all — its domain was the full module, not visible-only.
		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: '' },
		});
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

		// Deselect-all while filtered removes BOTH visible and hidden permissions —
		// whole-module semantics in the reverse direction.
		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: 'create' },
		});
		fireEvent.click(
			within(screen.getByTestId('permission-module-posts')).getByRole(
				'checkbox',
				{ name: 'Toggle all Posts permissions' },
			),
		);
		fireEvent.change(screen.getByTestId('permissions-filter'), {
			target: { value: '' },
		});
		expect(
			(
				within(screen.getByTestId('permission-row-posts.view')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
		expect(
			(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				) as HTMLInputElement
			).checked,
		).toBe(false);
	});

	// #976: the save bar renders unconditionally and only its buttons gate on
	// dirtiness. Nested inside the outer describe so it shares the same
	// beforeEach/afterEach (mock setup + cleanup) as the rest of this suite.
	describe('always-rendered save bar (#976)', () => {
		test('is present on first paint, before any interaction, with both buttons disabled and the clean-state message', () => {
			renderTab();

			const actionBar = screen.getByTestId('permissions-action-bar');
			expect(actionBar).toBeTruthy();
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			);
			expect(
				(screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement)
					.disabled,
			).toBe(true);
			expect(
				(
					screen.getByRole('button', {
						name: 'Save changes',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});

		test('enables both buttons once a change is staged', () => {
			renderTab();

			fireEvent.click(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				),
			);

			expect(
				(screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement)
					.disabled,
			).toBe(false);
			expect(
				(
					screen.getByRole('button', {
						name: 'Save changes',
					}) as HTMLButtonElement
				).disabled,
			).toBe(false);
		});

		test('does not unmount the bar after Discard — it returns to the disabled/clean state', () => {
			renderTab();

			fireEvent.click(
				within(screen.getByTestId('permission-row-posts.create')).getByRole(
					'checkbox',
				),
			);
			fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

			expect(screen.getByTestId('permissions-action-bar')).toBeTruthy();
			expect(screen.getByTestId('permissions-change-status').textContent).toBe(
				'No unsaved changes',
			);
			expect(
				(screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement)
					.disabled,
			).toBe(true);
			expect(
				(
					screen.getByRole('button', {
						name: 'Save changes',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});

		test('does not unmount the bar after a successful Save — it returns to the disabled/clean state', async () => {
			renderTab({ grantedKeys: [] });

			fireEvent.click(screen.getByRole('checkbox', { name: 'View posts' }));
			fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await waitFor(() =>
				expect(
					screen.getByTestId('permissions-change-status').textContent,
				).toBe('No unsaved changes'),
			);
			expect(screen.getByTestId('permissions-action-bar')).toBeTruthy();
			expect(
				(screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement)
					.disabled,
			).toBe(true);
			expect(
				(
					screen.getByRole('button', {
						name: 'Save changes',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});
	});
});
