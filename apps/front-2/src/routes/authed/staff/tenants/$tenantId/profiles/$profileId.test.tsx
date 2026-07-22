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

type BlockerLocationSnapshot = {
	pathname: string;
	search: Record<string, unknown>;
};
type BlockerArgs = {
	current: BlockerLocationSnapshot;
	next: BlockerLocationSnapshot;
	action: string;
};

const PROFILE_PATHNAME =
	'/staff/tenants/11111111-1111-1111-1111-111111111111/profiles/22222222-2222-2222-2222-222222222222';

// A navigation that leaves this exact profile route (sibling route / browser
// Back). Used as the default args for the bare `capturedShouldBlockFn()` calls
// that only exercise the open+dirty gate.
const realNavigationBlockerArgs: BlockerArgs = {
	current: { pathname: PROFILE_PATHNAME, search: { edit: 1 } },
	next: {
		pathname: '/staff/tenants/11111111-1111-1111-1111-111111111111/profiles',
		search: {},
	},
	action: 'PUSH',
};

// A tab switch: same pathname, `edit=1` preserved so the drawer stays open and
// the draft is intact.
const tabSwitchBlockerArgs: BlockerArgs = {
	current: {
		pathname: PROFILE_PATHNAME,
		search: { edit: 1, tab: 'overview' },
	},
	next: {
		pathname: PROFILE_PATHNAME,
		search: { edit: 1, tab: 'permissions' },
	},
	action: 'PUSH',
};

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {} as Record<string, unknown>,
	queryClient: {
		invalidateQueries: vi.fn().mockResolvedValue(undefined),
	},
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	buildStaffTenantPermissionCatalogOptions: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	useStaffTenantProfilePermissionKeysQuery: vi.fn(),
	toStaffTenantProfilePermissionKeys: vi.fn(),
	useStaffTenantProfileMembersQuery: vi.fn(),
	toStaffTenantProfileMemberRows: vi.fn(),
	useStaffTenantPermissionCatalogQuery: vi.fn(),
	useDeleteStaffTenantProfileMutation: vi.fn(),
	useAssignStaffTenantProfilePermissionMutation: vi.fn(),
	useUnassignStaffTenantProfilePermissionMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
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
	capturedMatrixDirtyChange: undefined as
		| ((isDirty: boolean) => void)
		| undefined,
	permissionKeysCacheRevision: 1,
	capturedGrantedRevision: undefined as number | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
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
				? (search as (previous: Record<string, unknown>) => unknown)(
						mocks.search,
					)
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
		invalidateQueries: (arg: unknown) => unknown;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
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
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
	useStaffTenantProfilePermissionKeysQuery:
		mocks.useStaffTenantProfilePermissionKeysQuery,
	getStaffTenantProfilePermissionKeysCacheSnapshot: () => ({
		permissionKeys: [],
		revision: mocks.permissionKeysCacheRevision,
	}),
	toStaffTenantProfilePermissionKeys: mocks.toStaffTenantProfilePermissionKeys,
	useStaffTenantProfileMembersQuery: mocks.useStaffTenantProfileMembersQuery,
	toStaffTenantProfileMemberRows: mocks.toStaffTenantProfileMemberRows,
	useDeleteStaffTenantProfileMutation:
		mocks.useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery:
		mocks.useStaffTenantPermissionCatalogQuery,
	useAssignStaffTenantProfilePermissionMutation:
		mocks.useAssignStaffTenantProfilePermissionMutation,
	useUnassignStaffTenantProfilePermissionMutation:
		mocks.useUnassignStaffTenantProfilePermissionMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_profile-permissions-tab', () => ({
	ProfilePermissionsTab: ({
		onDirtyChange,
		grantedRevision,
	}: {
		onDirtyChange: (isDirty: boolean) => void;
		grantedRevision: number;
	}) => {
		mocks.capturedMatrixDirtyChange = onDirtyChange;
		mocks.capturedGrantedRevision = grantedRevision;
		return <div data-testid="staff-tenant-profile-permissions-content" />;
	},
}));

vi.mock('./_profile-members-tab', () => ({
	ProfileMembersTab: () => (
		<>
			<div data-testid="staff-tenant-profile-members-table" />
			<div data-testid="assign-members-drawer" />
		</>
	),
}));

vi.mock('./_profile-form-drawer', () => ({
	ProfileFormDrawer: ({
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
		return isOpen ? <div data-testid="profile-edit-drawer-open" /> : null;
	},
}));

vi.mock('./_profile-edit-details-drawer', () => ({
	ProfileEditDetailsDrawer: ({
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
		return isOpen ? (
			<div data-testid="profile-edit-details-drawer-open" />
		) : null;
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resourceKey = key.includes(':')
				? (key.split(':').at(-1) ?? key)
				: key;
			const labels: Record<string, string> = {
				basics: 'Basics',
				custom: 'Custom',
				'custom-profile': 'Custom profile',
				profiles: 'Profiles',
				invitations: 'Invitations',
				users: 'Users',
				tenants: 'Tenants',
				tenant: 'Tenant',
				profile: 'Profile',
				overview: 'Overview',
				permissions: 'Permissions',
				members: 'Members',
				system: 'System',
				'system-profile': 'System profile',
				'open-tenant': 'Open tenant',
				'back-to-tenant-profiles': 'Back to {{name}} profiles',
				assign: 'Assign',
				assigned: 'Assigned',
				'assign-permission': 'Assign {{name}}',
				'assigned-permission-keys': 'Assigned permission keys',
				'assigned-users': 'Assigned users',
				available: 'Available',
				'back-to-profiles': 'Back to profiles',
				'confirm-delete-tenant-profile-description':
					'This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone.',
				'danger-zone': 'Danger zone',
				default: 'Default',
				'default-profile': 'Default profile',
				'default-profile-delete-disabled': "Default profiles can't be deleted.",
				delete: 'Delete',
				'delete-profile': 'Delete profile',
				'delete-tenant-profile-confirm-title': 'Delete tenant profile',
				description: 'Description',
				'edit-details': 'Edit details',
				'edit-profile': 'Edit profile',
				'error-404-code': '404 — Not Found',
				'error-500-code': '500 — Server Error',
				loading: 'Loading',
				'loading-available-permissions': 'Loading available permissions…',
				'loading-tenant-profile': 'Loading tenant profile…',
				'manage-permission-keys-description':
					'Manage assigned and available permission keys for this profile.',
				name: 'Name',
				no: 'No',
				'no-additional-permission-keys-available':
					'No additional permission keys are available to assign.',
				'no-description-provided': 'No description provided.',
				'no-permissions-assigned-to-profile':
					'No permissions are assigned to this profile.',
				'no-permissions-available': 'No permission keys are available.',
				'permission-keys': 'Permission keys',
				'permission-state-granted': 'granted',
				'permission-state-not-granted': 'not granted',
				'profile-details': 'Profile details',
				'profile-sections': 'Profile sections',
				retry: 'Retry',
				'status-active': 'Active',
				'status-unknown': 'Unknown',
				'tenant-details-error-title': 'Unable to load this tenant',
				'tenant-permission-catalog-load-failed':
					'Unable to load the tenant permission catalog.',
				'tenant-profile-details-description':
					'Core information for this tenant profile.',
				'tenant-profile-load-error-description':
					'There was a problem loading the profile details.',
				'tenant-profile-not-found-description':
					'The requested tenant profile does not exist or is no longer available.',
				'tenant-profile-not-found-title': 'Tenant profile not found',
				'tenant-profile-payload-empty': 'The profile payload was empty.',
				'tenant-member-count': '{{count}} members',
				'tenant-permission-count': '{{count}} permissions',
				'tenant-response-incomplete': 'The tenant response was incomplete.',
				'unable-to-delete-tenant-profile':
					'Unable to delete this tenant profile.',
				'unable-to-load-tenant-profile': 'Unable to load this tenant profile',
				'unable-to-update-tenant-profile-permission':
					'Unable to update this tenant profile permission.',
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
				'about-this-profile': 'About this profile',
				'permissions-at-a-glance': 'Permissions at a glance',
				'profile-glance-summary_one':
					'{{granted}} of {{total}} granted across {{count}} module',
				'profile-glance-summary_other':
					'{{granted}} of {{total}} granted across {{count}} modules',
				'profile-glance-no-access': 'No access to {{modules}}',
				'profile-created-month': 'Created {{date}}',
				'profile-updated-relative': 'Updated {{time}}',
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
		i18n: { language: 'en' },
	}),
}));

import { useUiStore } from '~/lib/store/ui-store';

import { Route } from './$profileId';
import { parseProfileDetailsSearchParams } from './_profile-details-search';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const nonDefaultProfile = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Approvers',
	description: 'Can review approvals',
	isDefault: false,
	userAccountCount: 7,
	createdAt: new Date('2026-05-10T09:00:00Z'),
	updatedAt: new Date('2026-07-14T10:00:00Z'),
};

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff tenant profile details route', () => {
	test('declares the profile feature namespace', () => {
		expect(Route.options.staticData).toEqual({
			i18nNamespaces: ['staff-tenant-profiles'],
		});
	});

	beforeEach(() => {
		vi.clearAllMocks();
		useUiStore.setState({ breadcrumbOverride: null });
		mocks.search = {};
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.capturedOnDirtyChange = undefined;
		mocks.capturedOnSaved = undefined;
		mocks.capturedMatrixDirtyChange = undefined;
		mocks.permissionKeysCacheRevision = 1;
		mocks.capturedGrantedRevision = undefined;
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue({
				key: 'tenant-profile-deleted-success',
				message: 'Tenant profile deleted successfully',
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
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
			createdAt: new Date('2026-05-10T09:00:00Z'),
			updatedAt: new Date('2026-07-14T10:00:00Z'),
		});
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					profile: {
						id: '22222222-2222-2222-2222-222222222222',
					},
				},
			}),
		);
		mocks.toStaffTenantProfilePermissionKeys.mockReturnValue([
			'tenant.approvals.review',
			'tenant.users.read',
		]);
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				data: {
					permissionKeys: ['tenant.approvals.review', 'tenant.users.read'],
				},
			}),
		);
		mocks.toStaffTenantProfileMemberRows.mockReturnValue([]);
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
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
		mocks.useAssignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
		mocks.useUnassignStaffTenantProfilePermissionMutation.mockReturnValue({
			isPending: false,
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the persisted profile icon and tone in the identity header', () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			...nonDefaultProfile,
			icon: 'briefcase',
			tone: '6',
		});

		renderPage();

		const identity = screen.getByTestId('staff-tenant-profile-identity');
		const tile = identity.querySelector('.publy-profile-detail-tile');
		expect(tile?.getAttribute('data-tone')).toBe('6');
		expect(tile?.querySelector('.tabler-icon-briefcase')).toBeTruthy();
	});

	test('renders standalone tenant and profile chrome above the overview content', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-page'),
		).toBeTruthy();
		const tenantBand = screen.getByTestId('staff-tenant-profile-tenant-band');
		const identity = screen.getByTestId('staff-tenant-profile-identity');
		const tabs = screen.getByTestId('staff-tenant-profile-tabs');

		expect(tenantBand.textContent).toContain('Acme Corporation');
		expect(tenantBand.textContent).toContain('publyapp.com/ACME');
		expect(tenantBand.textContent).toContain('Active');
		expect(
			screen.getByRole('link', { name: 'Open tenant' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111');
		expect(identity.querySelector('.publy-profile-detail-tile')).toBeTruthy();
		expect(identity.textContent).toContain('Approvers');
		expect(identity.textContent).toContain('System profile');
		expect(identity.textContent).toContain('Can review approvals');
		expect(identity.textContent).toContain('7 members · 2 permissions');
		expect(screen.getByRole('button', { name: 'Edit details' })).toBeTruthy();
		expect(tabs.textContent).toContain('Overview');
		expect(tabs.textContent).toContain('Permissions2');
		expect(tabs.textContent).toContain('Members7');
		expect(tabs.querySelector('[aria-current="page"]')?.textContent).toContain(
			'Overview',
		);
		expect(
			screen.getByTestId('staff-tenant-profile-overview-content'),
		).toBeTruthy();
		expect(screen.queryByText('Basics')).toBeNull();
		expect(
			screen
				.getByRole('link', { name: 'Back to Acme Corporation profiles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		// Overview stat cards (computed from the granted keys + catalog).
		expect(screen.getByTestId('profile-stat-members').textContent).toContain(
			'7',
		);
		expect(
			screen.getByTestId('profile-stat-permissions').textContent,
		).toContain('/ 3');
		expect(screen.getByTestId('profile-stat-modules').textContent).toContain(
			'with access',
		);
		expect(screen.getByTestId('profile-stat-type').textContent).toContain(
			'System profile',
		);
		// The glance renders human permission names, not raw keys.
		expect(screen.getByText('Review approvals')).toBeTruthy();
		expect(screen.getByText('Read users')).toBeTruthy();
		expect(screen.getByText('Write users')).toBeTruthy();
		// One module with access → singular "module" (plural-key resolution).
		expect(screen.getByText('2 of 3 granted across 1 module')).toBeTruthy();
		// The assign/unassign editing UI has moved off Overview (step 3).
		expect(screen.queryByRole('button', { name: /^Assign / })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Unassign / })).toBeNull();
		expect(mocks.useStaffTenantProfileDetailsQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
		expect(mocks.useStaffTenantProfilePermissionKeysQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			},
			{ enabled: true },
		);
		expect(mocks.useStaffTenantPermissionCatalogQuery).toHaveBeenCalledWith({});
	});

	test('shows an "Updated" relative timestamp in the identity meta, omitting it when absent', () => {
		const withTimestamp = renderPage();
		expect(
			screen.getByTestId('staff-tenant-profile-identity').textContent,
		).toContain('Updated');
		withTimestamp.unmount();

		mocks.toStaffTenantProfileDetails.mockReturnValue({
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
			screen.getByTestId('staff-tenant-profile-identity').textContent,
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

		const tenantBand = screen.getByTestId('staff-tenant-profile-tenant-band');
		expect(tenantBand.textContent).toContain('publyapp.com/—');
	});

	test('renders the URL-selected permissions and canonical members tabs with counted tabs', () => {
		mocks.search = { tab: 'permissions' };
		mocks.permissionKeysCacheRevision = 7;
		const view = renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-profile-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Permissions2');
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();
		expect(mocks.capturedGrantedRevision).toBe(7);
		expect(
			screen.queryByTestId('staff-tenant-profile-overview-content'),
		).toBeNull();

		view.unmount();
		mocks.search = { tab: 'members' };
		renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-profile-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Members7');
		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();
		expect(screen.getByTestId('assign-members-drawer')).toBeTruthy();
	});

	test('validates profile tab search state and keeps the numeric edit flag', () => {
		expect(parseProfileDetailsSearchParams({})).toEqual({
			edit: undefined,
			tab: undefined,
		});
		expect(
			parseProfileDetailsSearchParams({ edit: '1', tab: 'permissions' }),
		).toEqual({ edit: 1, tab: 'permissions' });
		expect(
			parseProfileDetailsSearchParams({ edit: 2, tab: 'unsupported' }),
		).toEqual({ edit: undefined, tab: undefined });
		expect(parseProfileDetailsSearchParams({ tab: 'overview' })).toEqual({
			edit: undefined,
			tab: undefined,
		});
	});

	test('publishes named breadcrumbs and clears them when the page unmounts', async () => {
		const view = renderPage();

		await waitFor(() => {
			expect(useUiStore.getState().breadcrumbOverride).toEqual([
				{ label: 'Tenants', to: '/staff/tenants' },
				{
					label: 'Acme Corporation',
					to: '/staff/tenants/11111111-1111-1111-1111-111111111111',
				},
				{
					label: 'Profiles',
					to: '/staff/tenants/11111111-1111-1111-1111-111111111111/profiles',
				},
				{ label: 'Approvers' },
			]);
		});

		view.unmount();
		expect(useUiStore.getState().breadcrumbOverride).toBeNull();
	});

	test('publishes a stable four-item generic trail while entity names load', async () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({ isPending: true }),
		);
		mocks.toStaffTenantDetails.mockReturnValue(null);
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({ isPending: true }),
		);
		mocks.toStaffTenantProfileDetails.mockReturnValue(null);

		renderPage();

		await waitFor(() => {
			expect(
				useUiStore.getState().breadcrumbOverride?.map(({ label }) => label),
			).toEqual(['Tenants', 'Tenant', 'Profiles', 'Profile']);
		});
	});

	// First-paint guard: the override is published in a layout effect, so the
	// full 4-crumb trail is committed to the store synchronously (before the
	// browser paints) — the app-shell never renders its 3-crumb path fallback
	// first and then jumps to 4. Asserted with no `waitFor`: the trail must
	// already be present the instant the first render commits, even while both
	// entity queries are still loading (generic labels, four crumbs).
	test('publishes the four-crumb trail before first paint without a fallback jump', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({ isPending: true }),
		);
		mocks.toStaffTenantDetails.mockReturnValue(null);
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({ isPending: true }),
		);
		mocks.toStaffTenantProfileDetails.mockReturnValue(null);

		renderPage();

		const trail = useUiStore.getState().breadcrumbOverride;
		expect(trail).toHaveLength(4);
		expect(trail?.map(({ label }) => label)).toEqual([
			'Tenants',
			'Tenant',
			'Profiles',
			'Profile',
		]);
	});

	test('moves the delete action into a labeled danger-zone section under permissions', () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			...nonDefaultProfile,
		});

		renderPage();

		const editButton = screen.getByRole('button', { name: 'Edit details' });
		const deleteButton = screen.getByRole('button', {
			name: 'Delete profile',
		});
		const dangerZoneHeading = screen.getByRole('heading', {
			name: 'Danger zone',
		});
		const dangerZoneSection = dangerZoneHeading.closest('section');

		expect(deleteButton).toBeTruthy();
		expect(
			screen
				.getByTestId('staff-tenant-profile-identity')
				.contains(deleteButton),
		).toBe(false);
		expect(editButton.closest('section')).toBe(null);
		expect(dangerZoneSection).not.toBeNull();
		expect(dangerZoneSection?.contains(deleteButton)).toBe(true);
		expect(
			screen.getByText(
				'This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone.',
			),
		).toBeTruthy();
	});

	test('shows the danger-zone description and no delete button for default profiles', () => {
		renderPage();

		const dangerZoneHeading = screen.getByRole('heading', {
			name: 'Danger zone',
		});
		const dangerZoneSection = dangerZoneHeading.closest('section');

		expect(dangerZoneSection).not.toBeNull();
		expect(
			dangerZoneSection?.textContent?.includes(
				"Default profiles can't be deleted.",
			),
		).toBe(true);
		expect(screen.queryByRole('button', { name: 'Delete profile' })).toBeNull();
	});

	test('edit profile button navigates to open the edit drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));

		const navigation = mocks.navigate.mock.calls[0]?.[0] as {
			replace?: boolean;
			search?: (previous: Record<string, unknown>) => Record<string, unknown>;
		};
		expect(navigation.replace).toBe(true);
		expect(navigation.search?.({ tab: 'permissions' })).toEqual({
			edit: 1,
			tab: 'permissions',
		});
	});

	test('renders the minimal edit-details drawer when the edit search param is set', () => {
		mocks.search = { edit: 1 };
		renderPage();

		expect(screen.getByTestId('profile-edit-details-drawer-open')).toBeTruthy();
		expect(screen.queryByTestId('profile-edit-drawer-open')).toBeNull();
	});

	test('confirms deletion, invalidates tenant profile queries, and navigates back to the list', async () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		});
		const mutateAsync = vi.fn().mockResolvedValue({
			key: 'tenant-profile-deleted-success',
			message: 'Tenant profile deleted successfully',
		});
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync,
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));

		await waitFor(() =>
			expect(screen.getByText('Delete tenant profile')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: '22222222-2222-2222-2222-222222222222',
			});
		});
		await waitFor(() => {
			expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			});
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/tenants/$tenantId/profiles',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			});
		});
	});

	test('leaves profile delete failures to central feedback without logging out', async () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({
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
			detail: 'Default tenant profile cannot be deleted',
			translationKey: 'tenant-profile-default-delete-not-allowed',
		});
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			isPending: false,
			mutateAsync,
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));

		await waitFor(() =>
			expect(screen.getByText('Delete tenant profile')).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		expect(
			screen.queryByText('Default tenant profile cannot be deleted'),
		).toBeNull();
		expect(
			screen.queryByText('Unable to delete this tenant profile.'),
		).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('disables the delete path for default profiles', () => {
		renderPage();

		expect(screen.getByText("Default profiles can't be deleted.")).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Delete profile' })).toBeNull();
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid profileId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
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
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Profile missing',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local error view without logging out for ordinary problem failures', () => {
		mocks.useStaffTenantProfilePermissionKeysQuery.mockReturnValue(
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

		expect(
			screen.getByTestId('staff-tenant-profile-details-error'),
		).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when a detail failure should invalidate the session', () => {
		mocks.useStaffTenantProfileDetailsQuery.mockReturnValue(
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
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
			buildQueryResult({ error: membersError, isError: true }),
		);
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) => error === membersError,
		);

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
		expect(navigation.search?.({ edit: 1, tab: 'members' })).toEqual({
			edit: undefined,
			tab: 'members',
		});
	});

	// A tab switch stays on this exact profile route and preserves `edit=1`, so
	// the drawer stays open and the draft is intact — the guard must not fire a
	// misleading discard prompt. A real navigation away (sibling route / Back)
	// still blocks the dirty draft.
	test('the nav-guard allows dirty tab switches but still blocks real navigation away', () => {
		mocks.search = { edit: 1 };
		renderPage();

		act(() => mocks.capturedOnDirtyChange?.(true));

		// Tab switch (same pathname, edit preserved) → no block.
		expect(mocks.capturedShouldBlockFn?.(tabSwitchBlockerArgs)).toBe(false);

		// Real navigation off the profile route → still blocks.
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

	// Step 3: the inline Permissions matrix stages edits in a mounted tab; any
	// navigation that leaves that tab discards them, so the page-level guard
	// must prompt on a tab switch / Back while the matrix is dirty — without
	// prompting when the drawer opens on the same tab (matrix stays mounted).
	test('the nav-guard blocks leaving the Permissions tab while the inline matrix is dirty', () => {
		const tabSwitchAway: BlockerArgs = {
			current: { pathname: PROFILE_PATHNAME, search: { tab: 'permissions' } },
			next: { pathname: PROFILE_PATHNAME, search: {} },
			action: 'PUSH',
		};
		const backNavAway: BlockerArgs = {
			current: { pathname: PROFILE_PATHNAME, search: { tab: 'permissions' } },
			next: {
				pathname:
					'/staff/tenants/11111111-1111-1111-1111-111111111111/profiles',
				search: {},
			},
			action: 'PUSH',
		};
		const openDrawerSameTab: BlockerArgs = {
			current: { pathname: PROFILE_PATHNAME, search: { tab: 'permissions' } },
			next: {
				pathname: PROFILE_PATHNAME,
				search: { tab: 'permissions', edit: 1 },
			},
			action: 'PUSH',
		};

		mocks.search = { tab: 'permissions' };
		renderPage();

		expect(mocks.capturedShouldBlockFn?.(tabSwitchAway)).toBe(false);

		act(() => mocks.capturedMatrixDirtyChange?.(true));

		expect(mocks.capturedShouldBlockFn?.(tabSwitchAway)).toBe(true);
		expect(mocks.capturedShouldBlockFn?.(backNavAway)).toBe(true);
		// Opening the edit drawer keeps the matrix mounted on the same tab.
		expect(mocks.capturedShouldBlockFn?.(openDrawerSameTab)).toBe(false);

		act(() => mocks.capturedMatrixDirtyChange?.(false));
		expect(mocks.capturedShouldBlockFn?.(tabSwitchAway)).toBe(false);
	});
});
