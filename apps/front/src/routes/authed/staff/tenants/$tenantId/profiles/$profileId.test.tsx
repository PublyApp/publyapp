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
const PERMISSIONS_PATHNAME = `${PROFILE_PATHNAME}/permissions`;
const MEMBERS_PATHNAME = `${PROFILE_PATHNAME}/members`;
const PROFILES_LIST_PATHNAME =
	'/staff/tenants/11111111-1111-1111-1111-111111111111/profiles';

// A navigation that leaves this profile's own section routes (sibling route /
// browser Back). Used as the default args for the bare
// `capturedShouldBlockFn()` calls that only exercise the open+dirty gate.
const realNavigationBlockerArgs: BlockerArgs = {
	current: { pathname: PROFILE_PATHNAME, search: { edit: 1 } },
	next: {
		pathname: PROFILES_LIST_PATHNAME,
		search: {},
	},
	action: 'PUSH',
};

// A section switch: a different pathname under the same layout, `edit=1`
// preserved so the drawer stays mounted and the draft is intact.
const sectionSwitchBlockerArgs: BlockerArgs = {
	current: {
		pathname: PROFILE_PATHNAME,
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
	search: {} as Record<string, unknown>,
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
	permissionKeysCacheRevision: 1,
	language: 'en',
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
			<div data-testid="profile-section-outlet" />
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
	staffTenantProfileCrumbQuery: () => ({
		queryKey: ['staff', 'staff-tenants', 'profiles', 'detail'],
		queryFn: async () => undefined,
	}),
	selectStaffTenantProfileCrumbName: () => undefined,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
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
			const labels: TestLabelMap = {
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
				edit: 'Edit',
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
				'profile-glance-module-count_one':
					'{{module}}: {{granted}} of {{total}} permission granted',
				'profile-glance-module-count_other':
					'{{module}}: {{granted}} of {{total}} permissions granted',
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
		i18n: { language: mocks.language },
	}),
}));

import { Route } from './$profileId';
import {
	type StaffTenantProfileDetailsContextValue,
	useStaffTenantProfileDetailsContext,
} from './$profileId/_details-context';
import {
	parseProfileDetailsSearchParams,
	parseProfileOverviewSearchParams,
} from './_profile-details-search';

/**
 * Stands in for the router's `<Outlet />` and consumes the REAL details
 * context the layout publishes — the exact hook every section child route
 * uses. Nothing here re-declares what the layout provides; it only records it
 * so the suite can assert on it and drive the callbacks the children own
 * (`onPermissionsDirtyChange`, `onDeleteRequest`, …).
 */
let sectionContext: StaffTenantProfileDetailsContextValue | undefined;

const DetailsContextProbe = () => {
	sectionContext = useStaffTenantProfileDetailsContext();

	return <div data-testid="profile-section-outlet" />;
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
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff tenant profile details route', () => {
	test('declares the profile feature namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual([
			'staff-tenant-profiles',
		]);
	});

	// The breadcrumb trail itself is no longer published by this component —
	// it is declared on `Route.options.staticData.crumbs` and derived by the
	// shell from `useMatches()` (#973). See
	// `src/lib/navigation/breadcrumb-contract.test.tsx` for the real-router
	// coverage (crumb declaration shape, skeleton/name/dash states, no
	// crumb-count jump).
	test('declares an entity crumb for both the tenant and the profile', () => {
		const tail = Route.options.staticData?.crumbs;
		if (typeof tail !== 'function') {
			throw new Error('expected a crumbs function, not the "shell" escape');
		}

		const specs = tail({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
		});
		const entityCount = specs.filter((spec) => spec.kind === 'entity').length;

		expect(entityCount).toBe(2);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.pathname = PROFILE_PATHNAME;
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
		expect(identity.querySelector('.publy-profile-detail-tile')).toBeTruthy();
		expect(identity.textContent).toContain('Approvers');
		expect(identity.textContent).toContain('System profile');
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
		expect(screen.getByTestId('profile-section-outlet')).toBeTruthy();
		expect(screen.queryByText('Basics')).toBeNull();
		expect(
			screen
				.getByRole('link', { name: 'Back to Acme Corporation profiles' })
				.getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		// What the layout resolves once and publishes to whichever section
		// child is mounted (the Overview body's own rendering of these values
		// is covered by `_profile-overview-tab.test.tsx`).
		expect(sectionContext?.profile.name).toBe('Approvers');
		expect(sectionContext?.permissionKeys).toEqual([
			'tenant.approvals.review',
			'tenant.users.read',
		]);
		expect(
			sectionContext?.permissionGroups.map((group) => group.moduleKey),
		).toEqual(['tenant']);
		expect(sectionContext?.locale).toBe('en');
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

	// #977: the section is read off the URL's PATHNAME now, not `?tab=`. The
	// active-tab highlight, the badges, and the payload the mounted section
	// child receives all follow the path.
	test('marks the section named by the pathname as current and keeps its count badge', () => {
		mocks.pathname = PERMISSIONS_PATHNAME;
		mocks.permissionKeysCacheRevision = 7;
		const view = renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-profile-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Permissions2');
		expect(sectionContext?.permissionKeysRevision).toBe(7);
		// Overview's members preview is fetched only on Overview.
		expect(mocks.useStaffTenantProfileMembersQuery).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ enabled: false }),
		);

		view.unmount();
		mocks.pathname = MEMBERS_PATHNAME;
		renderPage();

		expect(
			screen
				.getByTestId('staff-tenant-profile-tabs')
				.querySelector('[aria-current="page"]')?.textContent,
		).toContain('Members7');
		expect(sectionContext?.profile.userAccountCount).toBe(7);
	});

	test('validates the detail search state and keeps the numeric edit flag, with no tab key', () => {
		expect(parseProfileDetailsSearchParams({})).toEqual({ edit: undefined });
		expect(parseProfileDetailsSearchParams({ edit: '1' })).toEqual({ edit: 1 });
		expect(parseProfileDetailsSearchParams({ edit: 2 })).toEqual({
			edit: undefined,
		});
	});

	// #977: `?tab=` is legacy. The overview (index) route still parses it —
	// that is what makes the redirect possible — but only for the two values
	// that now name a real section path.
	test('parses only the two legacy tab values that name a section path', () => {
		expect(parseProfileOverviewSearchParams({})).toEqual({ tab: undefined });
		expect(parseProfileOverviewSearchParams({ tab: 'permissions' })).toEqual({
			tab: 'permissions',
		});
		expect(parseProfileOverviewSearchParams({ tab: 'members' })).toEqual({
			tab: 'members',
		});
		expect(parseProfileOverviewSearchParams({ tab: 'overview' })).toEqual({
			tab: undefined,
		});
		expect(parseProfileOverviewSearchParams({ tab: 'unsupported' })).toEqual({
			tab: undefined,
		});
	});

	// The delete flow stays on the LAYOUT: the Overview body only asks for it
	// (`onDeleteRequest`), which is what the mounted section child calls.
	test('opens the delete confirmation from the section body request', async () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue({ ...nonDefaultProfile });

		renderPage();

		expect(screen.queryByText('Delete tenant profile')).toBeNull();
		act(() => sectionContext?.onDeleteRequest());

		await waitFor(() =>
			expect(screen.getByText('Delete tenant profile')).toBeTruthy(),
		);
		expect(
			screen.getByText(
				'This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone.',
			),
		).toBeTruthy();
	});

	test('edit profile button navigates to open the edit drawer via search state', () => {
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

		act(() => sectionContext?.onDeleteRequest());

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

		act(() => sectionContext?.onDeleteRequest());

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
		// drawer, even though it lives under the same profile path prefix.
		expect(
			mocks.capturedShouldBlockFn?.({
				current: { pathname: PROFILE_PATHNAME, search: { edit: 1 } },
				next: { pathname: `${PROFILE_PATHNAME}/users`, search: { edit: 1 } },
				action: 'PUSH',
			}),
		).toBe(true);

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

	// Step 3 + #977: the inline Permissions matrix stages edits inside the
	// mounted Permissions ROUTE, so any navigation that changes the pathname
	// away from it discards them — a section switch, a sibling route, and a
	// browser Back all do. Opening the edit drawer is a search-only change on
	// the same pathname, which keeps the matrix mounted.
	test('the nav-guard blocks leaving the Permissions section while the inline matrix is dirty', () => {
		const sectionSwitchAway: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: PROFILE_PATHNAME, search: {} },
			action: 'PUSH',
		};
		const siblingRouteAway: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: PROFILES_LIST_PATHNAME, search: {} },
			action: 'PUSH',
		};
		const browserBack: BlockerArgs = {
			current: { pathname: PERMISSIONS_PATHNAME, search: {} },
			next: { pathname: PROFILES_LIST_PATHNAME, search: {} },
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
	// `ProfilePermissionsTab` clears the flag when it unmounts, so a dirty
	// matrix while OFF that route should not happen — this pins what the guard
	// does if that cleanup ever regresses: a stale flag must not start
	// blocking navigations between two other sections, because there is no
	// mounted matrix left for the prompt to be about.
	//
	// The deciding clause really is this precondition: with it dropped, the
	// matrix arm returns `true` before the drawer arm is ever reached, so no
	// later clause can rescue the outcome.
	test('a stale matrix-dirty flag does not block once the Permissions section is no longer showing', () => {
		mocks.pathname = PROFILE_PATHNAME;
		renderPage();

		act(() => sectionContext?.onPermissionsDirtyChange(true));

		expect(
			mocks.capturedShouldBlockFn?.({
				current: { pathname: PROFILE_PATHNAME, search: {} },
				next: { pathname: MEMBERS_PATHNAME, search: {} },
				action: 'PUSH',
			}),
		).toBe(false);
	});
});
