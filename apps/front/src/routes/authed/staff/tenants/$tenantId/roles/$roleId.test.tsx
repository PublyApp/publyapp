import { QueryClient } from '@tanstack/react-query';
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
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

// `edit` is the only search param this suite's blocker args ever carry;
// keeping it named preserves known-value evidence under no-known-value-widening.
type BlockerLocationSnapshot = {
	pathname: string;
	search: { edit?: number };
};
type BlockerArgs = {
	current: BlockerLocationSnapshot;
	next: BlockerLocationSnapshot;
	action: string;
};

const ROLE_PATHNAME =
	'/staff/tenants/11111111-1111-1111-1111-111111111111/roles/22222222-2222-2222-2222-222222222222';
const PERMISSIONS_PATHNAME = `${ROLE_PATHNAME}/permissions`;
const MEMBERS_PATHNAME = `${ROLE_PATHNAME}/members`;
const ROLES_LIST_PATHNAME =
	'/staff/tenants/11111111-1111-1111-1111-111111111111/roles';

// A navigation that leaves this role's own section routes (sibling route /
// browser Back). Used as the default args for the bare
// `capturedShouldBlockFn()` calls that only exercise the open+dirty gate.
const realNavigationBlockerArgs: BlockerArgs = {
	current: { pathname: ROLE_PATHNAME, search: { edit: 1 } },
	next: {
		pathname: ROLES_LIST_PATHNAME,
		search: {},
	},
	action: 'PUSH',
};

// A section switch: a different pathname under the same layout, `edit=1`
// preserved so the drawer stays mounted and the draft is intact.
const sectionSwitchBlockerArgs: BlockerArgs = {
	current: {
		pathname: ROLE_PATHNAME,
		search: { edit: 1 },
	},
	next: {
		pathname: PERMISSIONS_PATHNAME,
		search: { edit: 1 },
	},
	action: 'PUSH',
};

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {},
	pathname: '',
	/** Rendered in place of the router's `<Outlet />`; the suite swaps in a
	 * probe that consumes the REAL details context the layout publishes. */
	renderOutlet: undefined as (() => JSX.Element) | undefined,
	queryClient: {
		invalidateQueries: vi.fn().mockResolvedValue(undefined),
	},
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	buildStaffTenantPermissionCatalogOptions: vi.fn(),
	useStaffTenantRoleDetailsQuery: vi.fn(),
	toStaffTenantRoleDetails: vi.fn(),
	useStaffTenantRolePermissionKeysQuery: vi.fn(),
	toStaffTenantRolePermissionKeys: vi.fn(),
	useStaffTenantRoleMembersQuery: vi.fn(),
	toStaffTenantRoleMemberRows: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useDeleteStaffTenantRoleMutation: vi.fn(),
	useAssignStaffTenantRolePermissionMutation: vi.fn(),
	useUnassignStaffTenantRolePermissionMutation: vi.fn(),
	// #851: the awaited route loader resolves entities through these two
	// fetchers (the real query-options exports, re-implemented by the mock
	// factory below as thin wrappers around these spies).
	staffTenantDetailsFetcher: vi.fn(),
	staffTenantRoleDetailsFetcher: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as
		| ((args?: BlockerArgs) => boolean)
		| undefined,
	capturedOnDirtyChange: undefined as ((isDirty: boolean) => void) | undefined,
	capturedOnSaved: undefined as (() => void) | undefined,
	permissionKeysCacheRevision: 1,
	language: 'en',
}));

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			roleId: '22222222-2222-2222-2222-222222222222',
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		children,
		to,
		params,
		search,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
		search?: unknown;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		const resolvedSearch =
			typeof search === 'function'
				? (
						search as (
							previous: Record<string, unknown>,
						) => Record<string, unknown>
					)(mocks.search)
				: search;

		return (
			<a
				href={href}
				data-search={
					resolvedSearch === undefined
						? undefined
						: JSON.stringify(resolvedSearch)
				}
				{...props}
			>
				{children}
			</a>
		);
	},
	useBlocker: (opts: { shouldBlockFn: (args: BlockerArgs) => boolean }) => {
		const rawShouldBlockFn = opts.shouldBlockFn;
		// Bare `capturedShouldBlockFn()` calls (which only exercise the
		// open+dirty gate) default to a real cross-route navigation.
		mocks.capturedShouldBlockFn = (args?: BlockerArgs) =>
			rawShouldBlockFn(args ?? realNavigationBlockerArgs);
		return mocks.blockerResolver;
	},
	useNavigate: () => mocks.navigate,
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string } }) => void;
	}) => select({ location: { pathname: mocks.pathname } }),
	Outlet: () =>
		mocks.renderOutlet ? (
			mocks.renderOutlet()
		) : (
			<div data-testid="role-section-outlet" />
		),
}));

vi.mock('@tanstack/react-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
		'@tanstack/react-query',
	);

	return {
		...actual,
		useQueryClient: () => mocks.queryClient,
	};
});

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	invalidateAllStaffTenantScopes: (queryClient: {
		invalidateQueries: (arg: unknown) => void;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
	staffTenantCrumbQuery: () => ({
		queryKey: ['staff', 'staff-tenants', 'details'],
		queryFn: async () => undefined,
	}),
	selectStaffTenantCrumbName: () => undefined,
	// #851: the awaited route loader resolves the tenant through these
	// factory methods (same call contract as the real module).
	staffTenantDetailsQueryOptions: {
		queryKey: (variables: { tenantId: string }) => [
			'staff',
			'staff-tenants',
			'details',
			variables.tenantId,
		],
		fetcher: (variables: { tenantId: string }) =>
			mocks.staffTenantDetailsFetcher(variables),
	},
}));

vi.mock('~/lib/query/staff-tenant-roles', () => ({
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
	buildStaffTenantPermissionCatalogOptions:
		mocks.buildStaffTenantPermissionCatalogOptions,
	buildStaffTenantPermissionCatalogGroups: (
		additionalData: Record<
			string,
			Record<
				string,
				{ key?: string; name?: string; description?: string | null }
			>
		>,
	) => {
		const groups: Array<{
			moduleKey: string;
			moduleLabel: string;
			options: Array<{
				key: string;
				label: string;
				description: string | null;
			}>;
		}> = [];

		for (const [moduleKey, modulePermissions] of Object.entries(
			additionalData ?? {},
		)) {
			if (typeof modulePermissions !== 'object' || !modulePermissions) {
				continue;
			}

			const options: Array<{
				key: string;
				label: string;
				description: string | null;
			}> = [];

			for (const permission of Object.values(modulePermissions)) {
				const key = permission?.key?.trim() ?? '';
				if (!key) {
					continue;
				}

				options.push({
					key,
					label: permission.name?.trim() || key,
					description: permission.description ?? null,
				});
			}

			if (options.length === 0) {
				continue;
			}

			options.sort((left, right) => left.label.localeCompare(right.label));
			groups.push({
				moduleKey,
				moduleLabel: moduleKey
					.replace(/[_-]+/g, ' ')
					.replace(/\b\w/g, (character) => character.toUpperCase()),
				options,
			});
		}

		return groups.sort((left, right) =>
			left.moduleLabel.localeCompare(right.moduleLabel),
		);
	},
	useStaffTenantRoleDetailsQuery: mocks.useStaffTenantRoleDetailsQuery,
	toStaffTenantRoleDetails: mocks.toStaffTenantRoleDetails,
	// #851: loader-side ensureQueryData resolves through this option
	// factory (same call contract as the real module).
	staffTenantRoleDetailsQueryOptions: {
		queryKey: (variables: { tenantId: string; roleId: string }) => [
			'staff',
			'staff-tenants',
			'roles',
			'detail',
			variables.tenantId,
			variables.roleId,
		],
		fetcher: (variables: { tenantId: string; roleId: string }) =>
			mocks.staffTenantRoleDetailsFetcher(variables),
	},
	useStaffTenantRolePermissionKeysQuery:
		mocks.useStaffTenantRolePermissionKeysQuery,
	getStaffTenantRolePermissionKeysCacheSnapshot: () => ({
		permissionKeys: [],
		revision: mocks.permissionKeysCacheRevision,
	}),
	toStaffTenantRolePermissionKeys: mocks.toStaffTenantRolePermissionKeys,
	// #2340: the route's query spec references all five factories.
	staffTenantPermissionCatalogQueryOptions: {
		queryKey: (variables: { language?: string }) => [
			'staff',
			'permissions',
			'scopes',
			'tenant',
			variables.language,
		],
		fetcher: async () => ({}),
	},
	staffTenantRoleMembersQueryOptions: {
		queryKey: (variables: { tenantId: string; roleId: string }) => [
			'staff',
			'staff-tenants',
			'roles',
			'members',
			variables.tenantId,
			variables.roleId,
		],
		fetcher: async () => ({}),
	},
	staffTenantRolePermissionKeysQueryOptions: {
		queryKey: (variables: { tenantId: string; roleId: string }) => [
			'staff',
			'staff-tenants',
			'roles',
			'permission-keys',
			variables.tenantId,
			variables.roleId,
		],
		fetcher: async () => ({}),
	},
	useStaffTenantRoleMembersQuery: mocks.useStaffTenantRoleMembersQuery,
	toStaffTenantRoleMemberRows: mocks.toStaffTenantRoleMemberRows,
	useDeleteStaffTenantRoleMutation: mocks.useDeleteStaffTenantRoleMutation,
	useStaffTenantPermissionCatalogQuery:
		mocks.useStaffTenantPermissionCatalogQuery,
	useAssignStaffTenantRolePermissionMutation:
		mocks.useAssignStaffTenantRolePermissionMutation,
	useUnassignStaffTenantRolePermissionMutation:
		mocks.useUnassignStaffTenantRolePermissionMutation,
	staffTenantRoleCrumbQuery: () => ({
		queryKey: ['staff', 'staff-tenants', 'roles', 'detail'],
		queryFn: async () => undefined,
	}),
	selectStaffTenantRoleCrumbName: () => undefined,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_role-form-drawer', () => ({
	RoleFormDrawer: ({
		isOpen,
		onDirtyChange,
		onSaved,
	}: {
		isOpen: boolean;
		onDirtyChange?: (isDirty: boolean) => void;
		onSaved?: () => void;
	}) => {
		mocks.capturedOnDirtyChange = onDirtyChange;
		mocks.capturedOnSaved = onSaved;
		if (isOpen) {
			return <div data-testid="role-edit-drawer-open" />;
		}
		return null;
	},
}));

vi.mock('./_role-edit-details-drawer', () => ({
	RoleEditDetailsDrawer: ({
		isOpen,
		onDirtyChange,
		onSaved,
	}: {
		isOpen: boolean;
		onDirtyChange?: (isDirty: boolean) => void;
		onSaved?: () => void;
	}) => {
		mocks.capturedOnDirtyChange = onDirtyChange;
		mocks.capturedOnSaved = onSaved;
		if (isOpen) {
			return <div data-testid="role-edit-details-drawer-open" />;
		}
		return null;
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resourceKey = key.includes(':')
				? (key.split(':').at(-1) ?? key)
				: key;
			const labels: TestLabelMap = {
				basics: 'Basics',
				custom: 'Custom',
				'custom-role': 'Custom role',
				roles: 'Roles',
				invitations: 'Invitations',
				users: 'Users',
				tenants: 'Tenants',
				tenant: 'Tenant',
				role: 'Role',
				overview: 'Overview',
				permissions: 'Permissions',
				members: 'Members',
				system: 'System',
				'system-role': 'System role',
				'full-access': 'Full access',
				'system-role-full-access-description':
					'This system role grants every permission.',
				'default-role-name': 'Default role',
				'default-role-description': 'Default role with no permissions',
				'open-tenant': 'Open tenant',
				'back-to-tenant-roles': 'Back to {{name}} roles',
				assign: 'Assign',
				assigned: 'Assigned',
				'assign-permission': 'Assign {{name}}',
				'assigned-permission-keys': 'Assigned permission keys',
				'assigned-users': 'Assigned users',
				available: 'Available',
				'back-to-roles': 'Back to roles',
				'confirm-delete-tenant-role-description':
					'This will permanently delete this tenant role. Users assigned to this role may be affected and the action cannot be undone.',
				'danger-zone': 'Danger zone',
				default: 'Default',
				'default-role': 'Default role',
				'default-role-delete-disabled': "Default roles can't be deleted.",
				delete: 'Delete',
				'delete-role': 'Delete role',
				'delete-tenant-role-confirm-title': 'Delete tenant role',
				description: 'Description',
				edit: 'Edit',
				'edit-details': 'Edit details',
				'edit-role': 'Edit role',
				'error-404-code': '404 — Not Found',
				'error-500-code': '500 — Server Error',
				loading: 'Loading',
				'loading-available-permissions': 'Loading available permissions…',
				'loading-tenant-role': 'Loading tenant role…',
				'manage-permission-keys-description':
					'Manage assigned and available permission keys for this role.',
				name: 'Name',
				no: 'No',
				'no-additional-permission-keys-available':
					'No additional permission keys are available to assign.',
				'no-description-provided': 'No description provided.',
				'no-permissions-assigned-to-role':
					'No permissions are assigned to this role.',
				'no-permissions-available': 'No permission keys are available.',
				'permission-keys': 'Permission keys',
				'role-details': 'Role details',
				'role-sections': 'Role sections',
				retry: 'Retry',
				'status-active': 'Active',
				'status-unknown': 'Unknown',
				'tenant-details-error-title': 'Unable to load this tenant',
				'tenant-permission-catalog-load-failed':
					'Unable to load the tenant permission catalog.',
				'tenant-role-details-description':
					'Core information for this tenant role.',
				'tenant-role-load-error-description':
					'There was a problem loading the role details.',
				'tenant-role-not-found-description':
					'The requested tenant role does not exist or is no longer available.',
				'tenant-role-not-found-title': 'Tenant role not found',
				'tenant-role-payload-empty': 'The role payload was empty.',
				'tenant-member-count': '{{count}} members',
				'tenant-permission-count': '{{count}} permissions',
				'tenant-response-incomplete': 'The tenant response was incomplete.',
				'unable-to-delete-tenant-role': 'Unable to delete this tenant role.',
				'unable-to-load-tenant-role': 'Unable to load this tenant role',
				'unable-to-update-tenant-role-permission':
					'Unable to update this tenant role permission.',
				unassign: 'Unassign',
				'unassign-permission': 'Unassign {{name}}',
				yes: 'Yes',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'unsaved-changes-dialog-description':
					'You have unsaved changes that will be lost if you leave this page.',
				'leave-page': 'Leave page',
				cancel: 'Cancel',
				modules: 'Modules',
				type: 'Type',
				granted: 'Granted',
				manage: 'Manage',
				'with-access': 'with access',
				'view-members': 'View members',
				'view-all-count': 'View all {{total}}',
				'about-this-role': 'About this role',
				'permissions-at-a-glance': 'Permissions at a glance',
				'role-glance-summary_one':
					'{{granted}} of {{total}} granted across {{count}} module',
				'role-glance-summary_other':
					'{{granted}} of {{total}} granted across {{count}} modules',
				'role-glance-module-count_one':
					'{{module}}: {{granted}} of {{total}} permission granted',
				'role-glance-module-count_other':
					'{{module}}: {{granted}} of {{total}} permissions granted',
				'role-created-month': 'Created {{date}}',
				'role-updated-relative': 'Updated {{time}}',
				'no-members-yet': 'No members yet.',
				'loading-members': 'Loading members…',
				'members-load-error': 'Unable to load members.',
				'members-more-count': '+{{count}} more',
				'minutes-ago': '{{count}} minutes ago',
				'hours-ago': '{{count}} hours ago',
				'days-ago': '{{count}} days ago',
				'months-ago': '{{count}} months ago',
				'years-ago': '{{count}} years ago',
			};

			// Mirror i18next plural resolution: a numeric `count` selects the
			// `_one`/`_other` suffixed key when the dictionary provides it.
			const pluralKey =
				typeof options?.count === 'number'
					? `${resourceKey}_${options.count === 1 ? 'one' : 'other'}`
					: undefined;
			let text =
				(pluralKey === undefined ? undefined : labels[pluralKey]) ??
				labels[resourceKey] ??
				resourceKey;
			if (options) {
				for (const [optionKey, value] of Object.entries(options)) {
					text = text.replaceAll(`{{${optionKey}}}`, String(value));
				}
			}
			return text;
		},
		i18n: { language: mocks.language },
	}),
}));

import { Route } from './$roleId';
import {
	type StaffTenantRoleDetailsContextValue,
	useStaffTenantRoleDetailsContext,
} from './$roleId/_details-context';
import {
	parseRoleDetailsSearchParams,
	parseRoleOverviewSearchParams,
} from './_role-details-search';

/**
 * Stands in for the router's `<Outlet />` and consumes the REAL details
 * context the layout publishes — the exact hook every section child route
 * uses. Nothing here re-declares what the layout provides; it only records it
 * so the suite can assert on it and drive the callbacks the children own
 * (`onPermissionsDirtyChange`, `onDeleteRequest`, …).
 */
let sectionContext: StaffTenantRoleDetailsContextValue | undefined;

const DetailsContextProbe = () => {
	sectionContext = useStaffTenantRoleDetailsContext();

	return <div data-testid="role-section-outlet" />;
};

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const nonDefaultRole = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Approvers',
	description: 'Can review approvals',
	isDefault: false,
	userAccountCount: 7,
	createdAt: new Date('2026-05-10T09:00:00Z'),
	updatedAt: new Date('2026-07-14T10:00:00Z'),
};

const renderPage = () => {
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff tenant role details route', () => {
	test('declares the role feature namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual([
			'staff-tenant-roles',
		]);
	});

	// The breadcrumb trail itself is no longer published by this component —
	// it is declared on `Route.options.staticData.crumbs` and derived by the
	// shell from `useMatches()` (#973). See
	// `src/lib/navigation/breadcrumb-contract.test.tsx` for the real-router
	// coverage (crumb declaration shape, skeleton/name/dash states, no
	// crumb-count jump).
	test('declares an entity crumb for both the tenant and the role', () => {
		const tail = Route.options.staticData?.crumbs;
		if (typeof tail !== 'function') {
			throw new Error('expected a crumbs function, not the "shell" escape');
		}

		const specs = tail({
			tenantId: '11111111-1111-1111-1111-111111111111',
			roleId: '22222222-2222-2222-2222-222222222222',
		});
		const entityCount = specs.filter((spec) => spec.kind === 'entity').length;

		expect(entityCount).toBe(2);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.pathname = ROLE_PATHNAME;
		mocks.renderOutlet = () => <DetailsContextProbe />;
		sectionContext = undefined;
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.capturedOnDirtyChange = undefined;
		mocks.capturedOnSaved = undefined;
		mocks.permissionKeysCacheRevision = 1;
		mocks.language = 'en';
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useDeleteStaffTenantRoleMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue({
				key: 'tenant-role-deleted-success',
				message: 'Tenant role deleted successfully',
			}),
		});
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		// #851: loader-side fetchers resolve to raw wire payloads; the page
		// body still maps them through the mocked toStaffTenant* functions.
		mocks.staffTenantDetailsFetcher.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
		});
		mocks.staffTenantRoleDetailsFetcher.mockResolvedValue({
			role: {
				id: '22222222-2222-2222-2222-222222222222',
			},
		});
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
			createdAt: new Date('2026-05-10T09:00:00Z'),
			updatedAt: new Date('2026-07-14T10:00:00Z'),
		});
		mocks.useStaffTenantRoleDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					role: {
						id: '22222222-2222-2222-2222-222222222222',
					},
				},
			}),
		);
		mocks.toStaffTenantRolePermissionKeys.mockReturnValue([
			'tenant.approvals.review',
			'tenant.users.read',
		]);
		mocks.useStaffTenantRolePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				data: {
					permissionKeys: ['tenant.approvals.review', 'tenant.users.read'],
				},
			}),
		);
		mocks.toStaffTenantRoleMemberRows.mockReturnValue([]);
		mocks.useStaffTenantRoleMembersQuery.mockReturnValue(
			buildQueryResult({ data: { data: [] } }),
		);
		mocks.useStaffTenantPermissionCatalogQuery.mockReturnValue(
			buildQueryResult({
				data: {
					additionalData: {
						tenant: {
							'tenant.approvals.review': {
								key: 'tenant.approvals.review',
								name: 'Review approvals',
								description: 'Review tenant approver workflows',
							},
							'tenant.users.read': {
								key: 'tenant.users.read',
								name: 'Read users',
								description: 'Read tenant users',
							},
							'tenant.users.write': {
								key: 'tenant.users.write',
								name: 'Write users',
								description: 'Write tenant users',
							},
						},
					},
				},
			}),
		);
		mocks.buildStaffTenantPermissionCatalogOptions.mockImplementation(
			(
				additionalData: Record<
					string,
					Record<string, { key?: string; description?: string | null }>
				>,
			) => {
				const options: Array<{
					key: string;
					description: string | null;
					label: string;
				}> = [];

				for (const modulePermissions of Object.values(additionalData)) {
					if (typeof modulePermissions !== 'object' || !modulePermissions) {
						continue;
					}

					for (const permission of Object.values(modulePermissions)) {
						if (!permission || typeof permission !== 'object') {
							continue;
						}

						const key = (permission as { key?: string }).key?.trim() ?? '';

						if (!key) {
							continue;
						}

						options.push({
							key,
							label: key,
							description:
								(permission as { description?: string | null })?.description ??
								null,
						});
					}
				}

				return options.sort((left, right) =>
					left.label.localeCompare(right.label),
				);
			},
		);
		mocks.useAssignStaffTenantRolePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
		mocks.useUnassignStaffTenantRolePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the persisted role icon and tone in the identity header', () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			...nonDefaultRole,
			icon: 'briefcase',
			tone: '6',
		});

		renderPage();

		const identity = screen.getByTestId('staff-tenant-role-identity');
		const tile = identity.querySelector('.publy-role-detail-tile');
		expect(tile?.getAttribute('data-tone')).toBe('6');
		expect(tile?.querySelector('.tabler-icon-briefcase')).toBeTruthy();
	});

	test('renders standalone tenant and role chrome above the overview content', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-role-details-page')).toBeTruthy();
		const tenantBand = screen.getByTestId('staff-tenant-role-tenant-band');
		const identity = screen.getByTestId('staff-tenant-role-identity');
		const tabs = screen.getByTestId('staff-tenant-role-tabs');

		expect(tenantBand.textContent).toContain('Acme Corporation');
		expect(tenantBand.textContent).toContain('publyapp.com/ACME');
		expect(tenantBand.textContent).toContain('Active');
		// #1024 (review-ui-fidelity.md MINOR): a prior version of this test
		// checked only text/href and would still pass if the whole #1024 commit
		// were reverted. Assert the rendered grey-surface class and the arrow
		// icon actually reaching the DOM, not just the link's accessible name.
		expect(tenantBand.className).toContain('bg-muted');
		const openTenantLink = screen.getByRole('link', { name: 'Open tenant' });
		expect(openTenantLink.getAttribute('href')).toBe(
			'/staff/tenants/11111111-1111-1111-1111-111111111111',
		);
		expect(
			openTenantLink.querySelector('.tabler-icon-arrow-right'),
		).toBeTruthy();
		expect(identity.querySelector('.publy-role-detail-tile')).toBeTruthy();
		// A renamed default role keeps its own name (display-role.ts): only
		// the untouched seeded copy is translated at render time.
		expect(identity.textContent).toContain('Approvers');
		// The type chip follows `isFullAccess`: a default role is not the
		// protected system role.
		expect(identity.textContent).toContain('Custom role');
		expect(identity.textContent).toContain('Can review approvals');
		expect(identity.textContent).toContain('7 members · 2 permissions');
		// #1023 (review-ui-fidelity.md MINOR): the accessible-name assertion
		// alone still passes if the pencil icon or the size="sm" treatment is
		// removed — assert both so a partial revert of the button's visual
		// treatment fails here.
		const editButton = screen.getByRole('button', { name: 'Edit' });
		expect(editButton.querySelector('.tabler-icon-pencil')).toBeTruthy();
		expect(editButton.className).toContain('h-8');
		// #977: the count badges next to Permissions and Members survive the
		// move to path segments, and the section links are real hrefs.
		expect(tabs.textContent).toContain('Overview');
		expect(tabs.textContent).toContain('Permissions2');
		expect(tabs.textContent).toContain('Members7');
		expect(tabs.querySelector('[aria-current="page"]')?.textContent).toContain(
			'Overview',
		);
		expect(
			screen.getByRole('link', { name: 'Permissions2' }).getAttribute('href'),
		).toBe(PERMISSIONS_PATHNAME);
		expect(
			screen.getByRole('link', { name: 'Members7' }).getAttribute('href'),
		).toBe(MEMBERS_PATHNAME);
		// The section body itself is a child route now, rendered through the
		// layout's `<Outlet />`.
		expect(screen.getByTestId('role-section-outlet')).toBeTruthy();
		expect(screen.queryByText('Basics')).toBeNull();
		expect(
			screen
				.getByRole('link', { name: 'Back to Acme Corporation roles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/roles');
		// What the layout resolves once and publishes to whichever section
		// child is mounted (the Overview body's own rendering of these values
		// is covered by `_role-overview-tab.test.tsx`).
		expect(sectionContext?.role.name).toBe('Approvers');
		expect(sectionContext?.permissionKeys).toEqual([
			'tenant.approvals.review',
			'tenant.users.read',
		]);
		expect(
			sectionContext?.permissionGroups.map((group) => group.moduleKey),
		).toEqual(['tenant']);
		expect(sectionContext?.locale).toBe('en');
		expect(mocks.useStaffTenantRoleDetailsQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
		expect(mocks.useStaffTenantRolePermissionKeysQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenCalledWith({
			language: 'en',
		});
	});

	test('requests a localized permission catalog when the language changes', () => {
		const englishView = renderPage();
		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenLastCalledWith(
			{
				language: 'en',
			},
		);
		englishView.unmount();

		mocks.language = 'fr';
		renderPage();

		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenLastCalledWith(
			{
				language: 'fr',
			},
		);
	});

	test('shows an "Updated" relative timestamp in the identity meta, omitting it when absent', () => {
		const withTimestamp = renderPage();
		expect(
			screen.getByTestId('staff-tenant-role-identity').textContent,
		).toContain('Updated');
		withTimestamp.unmount();

		mocks.toStaffTenantRoleDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
			createdAt: null,
			updatedAt: null,
		});
		renderPage();
		expect(
			screen.getByTestId('staff-tenant-role-identity').textContent,
		).not.toContain('Updated');
	});

	test('renders an em-dash workspace-code placeholder when the tenant has no code', () => {
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: null,
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});

		renderPage();

		const tenantBand = screen.getByTestId('staff-tenant-role-tenant-band');
		expect(tenantBand.textContent).toContain('publyapp.com/—');
	});

	// #977: the section is read off the URL's PATHNAME now, not `?tab=`. The
	// active-tab highlight, the badges, and the payload the mounted section
	// child receives all follow the path.
	test('marks the section named by the pathname as current and keeps its count badge', () => {
		mocks.pathname = PERMISSIONS_PATHNAME;
		mocks.permissionKeysCacheRevision = 7;
		const view = renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-role-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Permissions2');
		expect(sectionContext?.permissionKeysRevision).toBe(7);
		// Overview's members preview is fetched only on Overview.
		expect(mocks.useStaffTenantRoleMembersQuery).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ enabled: false }),
		);

		view.unmount();
		mocks.pathname = MEMBERS_PATHNAME;
		renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-role-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Members7');
		expect(sectionContext?.role.userAccountCount).toBe(7);
	});

	test('validates the detail search state and keeps the numeric edit flag, with no tab key', () => {
		expect(parseRoleDetailsSearchParams({})).toEqual({ edit: undefined });
		expect(parseRoleDetailsSearchParams({ edit: '1' })).toEqual({ edit: 1 });
		expect(parseRoleDetailsSearchParams({ edit: 2 })).toEqual({
			edit: undefined,
		});
	});

	// #977: `?tab=` is legacy. The overview (index) route still parses it —
	// that is what makes the redirect possible — but only for the two values
	// that now name a real section path.
	test('parses only the two legacy tab values that name a section path', () => {
		expect(parseRoleOverviewSearchParams({})).toEqual({ tab: undefined });
		expect(parseRoleOverviewSearchParams({ tab: 'permissions' })).toEqual({
			tab: 'permissions',
		});
		expect(parseRoleOverviewSearchParams({ tab: 'members' })).toEqual({
			tab: 'members',
		});
		expect(parseRoleOverviewSearchParams({ tab: 'overview' })).toEqual({
			tab: undefined,
		});
		expect(parseRoleOverviewSearchParams({ tab: 'unsupported' })).toEqual({
			tab: undefined,
		});
	});

	test('shows « Accès complet » and hides Edit for the full-access system role', () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			...nonDefaultRole,
			isFullAccess: true,
		});

		renderPage();

		const identity = screen.getByTestId('staff-tenant-role-identity');
		expect(identity.textContent).toContain('System role');
		expect(identity.textContent).toContain('Full access');
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
	});

	// The delete flow stays on the LAYOUT: the Overview body only asks for it
	// (`onDeleteRequest`), which is what the mounted section child calls.
	test('opens the delete confirmation from the section body request', async () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({ ...nonDefaultRole });

		renderPage();

		expect(screen.queryByText('Delete tenant role')).toBeNull();
		act(() => sectionContext?.onDeleteRequest());

		await waitFor(() =>
			expect(screen.getByText('Delete tenant role')).toBeTruthy(),
		);
		expect(
			screen.getByText(
				'This will permanently delete this tenant role. Users assigned to this role may be affected and the action cannot be undone.',
			),
		).toBeTruthy();
	});

	test('edit role button navigates to open the edit drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		const navigation = mocks.navigate.mock.calls[0]?.[0] as {
			replace?: boolean;
			search?: (previous: Record<string, unknown>) => Record<string, unknown>;
		};
		expect(navigation.replace).toBe(true);
		expect(navigation.search?.({})).toEqual({ edit: 1 });
	});

	test('renders the minimal edit-details drawer when the edit search param is set', () => {
		mocks.search = { edit: 1 };
		renderPage();

		expect(screen.getByTestId('role-edit-details-drawer-open')).toBeTruthy();
		expect(screen.queryByTestId('role-edit-drawer-open')).toBeNull();
	});

	// #2327: the full-access system role has no editable state, so `?edit=1`
	// must not open the drawer — and the page canonicalizes the flag away
	// (replace-navigating on the section path, so the section is preserved).
	test('a ?edit=1 deep link on the full-access system role opens nothing and drops the param', () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			...nonDefaultRole,
			isFullAccess: true,
		});
		mocks.search = { edit: 1 };

		renderPage();

		expect(screen.queryByTestId('role-edit-details-drawer-open')).toBeNull();
		const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			replace?: boolean;
			search?: (previous: Record<string, unknown>) => Record<string, unknown>;
		};
		expect(navigation.replace).toBe(true);
		expect(navigation.search?.({ edit: 1 })).toEqual({ edit: undefined });
	});

	test('confirms deletion, invalidates tenant role queries, and navigates back to the list', async () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		});
		const mutateAsync = vi.fn().mockResolvedValue({
			key: 'tenant-role-deleted-success',
			message: 'Tenant role deleted successfully',
		});
		mocks.useDeleteStaffTenantRoleMutation.mockReturnValue({
			isPending: false,
			mutateAsync,
		});

		renderPage();

		act(() => sectionContext?.onDeleteRequest());

		await waitFor(() =>
			expect(screen.getByText('Delete tenant role')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: '22222222-2222-2222-2222-222222222222',
			});
		});
		await waitFor(() => {
			expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			});
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/roles',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			});
		});
	});

	test('leaves role delete failures to central feedback without logging out', async () => {
		mocks.toStaffTenantRoleDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		});
		const mutateAsync = vi.fn().mockRejectedValue({
			status: 400,
			responseStatusCode: 400,
			title: 'Bad Request',
			detail: 'Default tenant role cannot be deleted',
			translationKey: 'tenant-role-default-delete-not-allowed',
		});
		mocks.useDeleteStaffTenantRoleMutation.mockReturnValue({
			isPending: false,
			mutateAsync,
		});

		renderPage();

		act(() => sectionContext?.onDeleteRequest());

		await waitFor(() =>
			expect(screen.getByText('Delete tenant role')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		expect(
			screen.queryByText('Default tenant role cannot be deleted'),
		).toBeNull();
		expect(screen.queryByText('Unable to delete this tenant role.')).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantRoleDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid roleId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-role-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantRolePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders not found without logging out for 404 failures', () => {
		mocks.useStaffTenantRoleDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Role missing',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-role-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local error view without logging out for ordinary problem failures', () => {
		mocks.useStaffTenantRolePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Unexpected failure',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-role-details-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when a detail failure should invalidate the session', () => {
		mocks.useStaffTenantRoleDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Session expired',
				},
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('redirects to logout when only the members query fails with a session-expiring error', () => {
		// Details/permissions succeed (already cached); ONLY the members query
		// 401s. The session guard must still trigger — not fall through to the
		// members-preview inline error state.
		const membersError = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		};
		mocks.useStaffTenantRoleMembersQuery.mockReturnValue(
			buildQueryResult({ error: membersError, isError: true }),
		);
		mocks.shouldLogoutForFailure.mockImplementation(() => true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		expect(screen.queryByText('Unable to load members.')).toBeNull();
	});

	// tenants-r1-F2: the edit drawer's open flag is URL-driven (`?edit=1`); a
	// browser Back or sibling-route navigation changes/unmounts it without
	// ever calling the drawer's own close guard, discarding a dirty edit
	// draft with no confirmation.
	test('the URL nav-guard only blocks navigation while the edit drawer is open AND dirty', () => {
		mocks.search = { edit: 1 };
		renderPage();

		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		act(() => mocks.capturedOnDirtyChange?.(false));
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('the URL nav-guard never blocks when the edit drawer is closed, even if reported dirty', () => {
		mocks.search = {};
		renderPage();

		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	// W8-DRAWER: `onDirtyChange(false)` is an async state update — a
	// successful edit submit calls it and then `onSaved()` (which closes the
	// drawer via setEditDrawerOpen(false)) synchronously in the same tick, so
	// the guard's closure still sees the old (dirty) render.
	test('a successful edit submit does not leave the nav guard blocking its own drawer close (W8-DRAWER)', () => {
		mocks.search = { edit: 1 };
		renderPage();

		act(() => mocks.capturedOnDirtyChange?.(true));
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		// React batches state updates across a single `act` callback and only
		// applies them once it returns, so asserting *inside* this callback
		// (before the flush) reproduces the real stale-closure race.
		act(() => {
			mocks.capturedOnDirtyChange?.(false);
			mocks.capturedOnSaved?.();

			expect(mocks.capturedShouldBlockFn?.()).toBe(false);
		});

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.any(Function),
				replace: true,
			}),
		);
		const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: (previous: Record<string, unknown>) => Record<string, unknown>;
		};
		expect(navigation.search?.({ edit: 1 })).toEqual({ edit: undefined });
	});

	// #977: a section switch is a PATHNAME change now, but the edit drawer is
	// hosted by the LAYOUT, so it stays mounted with its draft intact across
	// one — the guard must not fire a misleading discard prompt there. A real
	// navigation away (sibling route / Back) still blocks the dirty draft.
	test('the nav-guard allows dirty section switches but still blocks real navigation away', () => {
		mocks.search = { edit: 1 };
		renderPage();

		act(() => mocks.capturedOnDirtyChange?.(true));

		// Section switch (a sibling section pathname, edit preserved) → no block.
		expect(mocks.capturedShouldBlockFn?.(sectionSwitchBlockerArgs)).toBe(false);

		// A sibling route that is NOT one of this layout's sections unmounts the
		// drawer, even though it lives under the same role path prefix.
		expect(
			mocks.capturedShouldBlockFn?.({
				current: { pathname: ROLE_PATHNAME, search: { edit: 1 } },
				next: { pathname: `${ROLE_PATHNAME}/users`, search: { edit: 1 } },
				action: 'PUSH',
			}),
		).toBe(true);

		// Real navigation off the role route → still blocks.
		expect(mocks.capturedShouldBlockFn?.(realNavigationBlockerArgs)).toBe(true);
	});

	test('shows the unsaved-changes confirm dialog when the router blocks navigation away from a dirty edit drawer', () => {
		const proceed = vi.fn();
		const reset = vi.fn();
		mocks.search = { edit: 1 };
		mocks.blockerResolver.status = 'blocked';
		mocks.blockerResolver.proceed = proceed;
		mocks.blockerResolver.reset = reset;

		renderPage();

		expect(screen.getByText('Leave without saving?')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		expect(proceed).toHaveBeenCalled();
		expect(reset).not.toHaveBeenCalled();
	});

	// Step 3 + #977: the inline Permissions matrix stages edits inside the
	// mounted Permissions ROUTE, so any navigation that changes the pathname
	// away from it discards them — a section switch, a sibling route, and a
	// browser Back all do. Opening the edit drawer is a search-only change on
	// the same pathname, which keeps the matrix mounted.
	test('the nav-guard blocks leaving the Permissions section while the inline matrix is dirty', () => {
		const sectionSwitchAway: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: ROLE_PATHNAME, search: {} },
			action: 'PUSH',
		};
		const siblingRouteAway: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: ROLES_LIST_PATHNAME, search: {} },
			action: 'PUSH',
		};
		const browserBack: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: ROLES_LIST_PATHNAME, search: {} },
			action: 'BACK',
		};
		const openDrawerSameSection: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: PERMISSIONS_PATHNAME, search: { edit: 1 } },
			action: 'PUSH',
		};
		const closeDrawerSameSection: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: { edit: 1 } },
			next: { pathname: PERMISSIONS_PATHNAME, search: {} },
			action: 'PUSH',
		};

		mocks.pathname = PERMISSIONS_PATHNAME;
		renderPage();

		expect(mocks.capturedShouldBlockFn?.(sectionSwitchAway)).toBe(false);

		act(() => sectionContext?.onPermissionsDirtyChange(true));

		expect(mocks.capturedShouldBlockFn?.(sectionSwitchAway)).toBe(true);
		expect(mocks.capturedShouldBlockFn?.(siblingRouteAway)).toBe(true);
		expect(mocks.capturedShouldBlockFn?.(browserBack)).toBe(true);
		// Opening or closing the edit drawer keeps the matrix mounted on the
		// same section pathname.
		expect(mocks.capturedShouldBlockFn?.(openDrawerSameSection)).toBe(false);
		expect(mocks.capturedShouldBlockFn?.(closeDrawerSameSection)).toBe(false);

		act(() => sectionContext?.onPermissionsDirtyChange(false));
		expect(mocks.capturedShouldBlockFn?.(sectionSwitchAway)).toBe(false);
	});

	// The matrix arm's `current.pathname === permissionsPathname` precondition.
	// `RolePermissionsTab` clears the flag when it unmounts, so a dirty
	// matrix while OFF that route should not happen — this pins what the guard
	// does if that cleanup ever regresses: a stale flag must not start
	// blocking navigations between two other sections, because there is no
	// mounted matrix left for the prompt to be about.
	//
	// The deciding clause really is this precondition: with it dropped, the
	// matrix arm returns `true` before the drawer arm is ever reached, so no
	// later clause can rescue the outcome.
	test('a stale matrix-dirty flag does not block once the Permissions section is no longer showing', () => {
		mocks.pathname = ROLE_PATHNAME;
		renderPage();

		act(() => sectionContext?.onPermissionsDirtyChange(true));

		expect(
			mocks.capturedShouldBlockFn?.({
				current: { pathname: ROLE_PATHNAME, search: {} },
				next: { pathname: MEMBERS_PATHNAME, search: {} },
				action: 'PUSH',
			}),
		).toBe(false);
	});

	// #2340: the route loader preloads the page's queries fire-and-forget
	// (`preloadRouteQueries` + the `roleDetailsQueries` spec); it never awaits.
	// These specs pin the loader wiring on Route.options directly (this suite
	// mounts the component without a router, so the loader itself stays inert
	// here). The end-to-end hover/click contract lives in
	// `$roleId.preload.test.tsx`.
	describe('#2340 route loader preload', () => {
		const loaderArgs = {
			params: {
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: '22222222-2222-2222-2222-222222222222',
			},
			context: { queryClient: new QueryClient(), locale: 'en' },
		};

		test('warms the tenant and role details queries without awaiting', async () => {
			const loader = Route.options.loader as
				| ((args: {
						params: { tenantId: string; roleId: string };
						context: { queryClient: QueryClient; locale: string };
				  }) => void)
				| undefined;
			if (!loader) {
				throw new Error('expected the #2340 route preload loader');
			}

			loader(loaderArgs);

			await waitFor(() => {
				expect(mocks.staffTenantDetailsFetcher).toHaveBeenCalledWith(
					expect.objectContaining({
						tenantId: '11111111-1111-1111-1111-111111111111',
					}),
				);
			});
			await waitFor(() => {
				expect(mocks.staffTenantRoleDetailsFetcher).toHaveBeenCalledWith(
					expect.objectContaining({
						tenantId: '11111111-1111-1111-1111-111111111111',
						roleId: '22222222-2222-2222-2222-222222222222',
					}),
				);
			});
		});

		test('declares the pending skeleton as its pendingComponent', () => {
			expect(Route.options.pendingComponent).toBeDefined();
		});
	});
});
