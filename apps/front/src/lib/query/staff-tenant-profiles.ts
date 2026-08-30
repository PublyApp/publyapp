import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeNullableFileUrl } from '~/lib/api-client/resolve-api-file-url';
import type { EntityCrumbQuery } from '~/lib/navigation/breadcrumbs';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	AccountLevel,
	ApiResponse,
	BulkDeleteTenantProfilesBody,
	BulkProfileActionResult,
	CreateTenantProfileAsStaffBody,
	FindTenantProfilePermissionsAsStaffResult,
	FindTenantProfilesAsStaffResult,
	FindTenantProfileUsersAsStaffResult,
	GetTenantProfileByIdResponse,
	ResolveTenantProfileNamesAsStaffBody,
	ResolveTenantProfileNamesAsStaffResult,
	ResolveTenantProfileUserAssignmentsAsStaffBody,
	ResolveTenantProfileUserAssignmentsAsStaffResult,
	TenantProfileItem,
	TenantProfileUserItem,
	TenantUserStatus,
	UpdateTenantProfileAsStaffBody,
} from '@org/client-ts/models/index';
import type { TenantGetResponse } from '@org/client-ts/staff/permissions/scopes/tenant/index';
import type { MutationFeedbackMeta } from '@org/shared-ts/lib/mutation-feedback/types';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type StaffTenantProfilesQueryVariables = {
	tenantId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
	isDefault?: 'true' | 'false';
};

export type CreateStaffTenantProfileInput = {
	tenantId: string;
	name: string;
	description?: string;
	icon?: string;
	tone?: string;
	permissionKeys?: string[];
};

export type UpdateStaffTenantProfileInput = {
	tenantId: string;
	profileId: string;
	name: string;
	description?: string;
	icon?: string | null;
	tone?: string | null;
};

export type DeleteStaffTenantProfileInput = {
	tenantId: string;
	profileId: string;
};

export type BulkDeleteStaffTenantProfilesInput = {
	tenantId: string;
	profileIds: string[];
};

type StaffTenantProfileBulkActionFailedItem = {
	profileId: string | null;
	error: string | null;
};

export type StaffTenantProfileBulkActionSummary = {
	succeededCount: number;
	failedCount: number;
	failedItems: StaffTenantProfileBulkActionFailedItem[];
};

export type StaffTenantProfileRow = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
	isDefault: boolean;
	userAccountCount: number;
	permissionsCount: number;
};

export type StaffTenantProfileDetails = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
	isDefault: boolean;
	userAccountCount: number;
	createdAt: Date | null;
	updatedAt: Date | null;
};

export type StaffTenantProfileDetailsQueryVariables = {
	tenantId: string;
	profileId: string;
};

export type StaffTenantProfilePermissionKeysQueryVariables = {
	tenantId: string;
	profileId: string;
};

export type StaffTenantPermissionCatalogQueryVariables = {
	language?: string;
};

type StaffTenantProfilePermissionMutationVariables = {
	tenantId: string;
	profileId: string;
	permissionKey: string;
};

type StaffTenantProfileMemberMutationVariables = {
	tenantId: string;
	profileId: string;
	userAccountId: string;
};

export type StaffTenantProfileMembersQueryVariables = {
	tenantId: string;
	profileId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	pageIndex?: number;
	size?: number;
};

export type StaffTenantProfileMemberRow = {
	/** The tenant membership (`UserAccount.Id`) — matches the assign/unassign toggle route's
	 * `{user_account_id}`. Never use this to link to the member's own detail page; that route
	 * expects the global user id (`userId` below), not this one (step4b-review MAJOR 4). */
	id: string;
	/** The global `User.Id` — matches `/staff/tenants/{tenantId}/users/{userId}`. Distinct
	 * from `id` above. */
	userId: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	status: TenantUserStatus | null;
	level: AccountLevel | null;
	otherProfiles: StaffTenantProfileMemberProfile[];
	joinedAt: Date | null;
	displayName: string;
};

type StaffTenantProfileMemberProfile = {
	id: string;
	name: string;
};

export type StaffTenantProfileUserAssignmentResolutionQueryVariables = {
	tenantId: string;
	profileId: string;
	userAccountIds: string[];
	/**
	 * Cache-key-busting counter (step4b-rereview MAJOR 2) — deliberately NOT
	 * sent to the API; the fetcher below only ever reads `userAccountIds` for
	 * the request body. Bumping it forces a brand-new query key, so a stale
	 * in-flight fetch from a PREVIOUS generation can never contaminate the
	 * CURRENT generation's `data`/`dataUpdatedAt` — the two are entirely
	 * separate cache entries. This is why callers must bump it after every
	 * committed write rather than relying on `dataUpdatedAt` (receive time,
	 * not causally ordered with request issuance) compared against a
	 * wall-clock commit timestamp.
	 */
	generation: number;
};

/** `user_account_id` -> whether that tenant member is assigned to the
 * profile, per `ResolveTenantProfileUserAssignmentsAsStaff` (#875). */
type StaffTenantProfileUserAssignmentMap = Record<string, boolean>;

export type StaffTenantPermissionOption = {
	key: string;
	label: string;
	description: string | null;
};

export type StaffTenantPermissionGroup = {
	moduleKey: string;
	moduleLabel: string;
	options: StaffTenantPermissionOption[];
};

/**
 * @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation key from this (review-r3-users-auth.md F11); use
 * `invalidateStaffTenantProfiles`. Was previously scoped in-place, which
 * forced every `queryKeyFn` below to `.slice(1)` it back off before handing
 * it to `buildStaffQueryOptions` (which scopes again) — a second, easy-to-
 * forget-in-a-new-call-site incompatible shape, same defect class as
 * `staff-profiles.ts`'s `STAFF_PROFILES_QUERY_KEY`.
 */
export const STAFF_TENANT_PROFILES_QUERY_KEY = [
	'staff-tenants',
	'profiles',
] as const;
const STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY = [
	...STAFF_TENANT_PROFILES_QUERY_KEY,
	'detail',
] as const;
const STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY = [
	...STAFF_TENANT_PROFILES_QUERY_KEY,
	'permission-keys',
] as const;
const STAFF_TENANT_PROFILE_MEMBERS_QUERY_KEY = [
	...STAFF_TENANT_PROFILES_QUERY_KEY,
	'users',
] as const;
const STAFF_TENANT_PROFILE_MEMBER_ASSIGNMENT_RESOLUTION_QUERY_KEY = [
	...STAFF_TENANT_PROFILE_MEMBERS_QUERY_KEY,
	'assignment-resolution',
] as const;
/** @internal Unscoped — see `STAFF_TENANT_PROFILES_QUERY_KEY` above. */
const STAFF_TENANT_PERMISSION_CATALOG_QUERY_KEY = [
	'tenant-permissions',
	'catalog',
] as const;

/** Invalidates the tenant-profiles list, every profile's details entry, its
 * permission-keys entry, and its members entry — all nest under
 * `STAFF_TENANT_PROFILES_QUERY_KEY`, so a single prefix invalidation covers
 * every one. */
export const invalidateStaffTenantProfiles = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_TENANT_PROFILES_QUERY_KEY),
	});

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const normalizeUnknownString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const formatModuleLabel = (moduleKey: string): string =>
	moduleKey
		.trim()
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (value) => value.toUpperCase());

const TENANT_PERMISSION_MODULE_ORDER: readonly string[] = [
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

// Canonical two-column flow from design 02-standalone-permissions. The three
// content groups lead the left column, while Channels/Approvals/Analytics lead
// the right. Administrative groups then trail the column shown in the design.
const TENANT_PERMISSION_LEFT_COLUMN_FLOW: readonly string[] = [
	'posts',
	'media',
	'calendar',
	'invitations',
	'audit_logs',
	'modules',
];

const TENANT_PERMISSION_RIGHT_COLUMN_FLOW: readonly string[] = [
	'channels',
	'approvals',
	'analytics',
	'members',
	'settings',
	'billing',
	'profiles',
];

const TENANT_PERMISSION_CANONICAL_COLUMN_MODULES = new Set([
	...TENANT_PERMISSION_LEFT_COLUMN_FLOW,
	...TENANT_PERMISSION_RIGHT_COLUMN_FLOW,
]);

/** Preserves the design's explicit canonical flow. Unknown/future modules
 * keep their catalog order and append one-by-one to the currently shorter
 * column (left wins ties), keeping growth deterministic and balanced. */
export const buildStaffTenantPermissionGroupColumns = (
	groups: StaffTenantPermissionGroup[],
): readonly [StaffTenantPermissionGroup[], StaffTenantPermissionGroup[]] => {
	const groupByModuleKey = new Map(
		groups.map((group) => [group.moduleKey, group] as const),
	);
	const leftGroups = TENANT_PERMISSION_LEFT_COLUMN_FLOW.flatMap((moduleKey) => {
		const group = groupByModuleKey.get(moduleKey);
		if (group) {
			return [group];
		}
		return [];
	});
	const rightGroups = TENANT_PERMISSION_RIGHT_COLUMN_FLOW.flatMap(
		(moduleKey) => {
			const group = groupByModuleKey.get(moduleKey);
			if (group) {
				return [group];
			}
			return [];
		},
	);

	for (const group of groups) {
		if (TENANT_PERMISSION_CANONICAL_COLUMN_MODULES.has(group.moduleKey)) {
			continue;
		}

		if (leftGroups.length <= rightGroups.length) {
			leftGroups.push(group);
		} else {
			rightGroups.push(group);
		}
	}

	return [leftGroups, rightGroups];
};

/** Known permission modules and their canonical action order. `moduleKey`
 * arrives as a plain string from the API permission key, so lookup goes
 * through Map.get and an unknown future module falls back to name comparison
 * instead of widening the literal to an open dictionary
 * (no-known-value-widening). */
const TENANT_PERMISSION_ACTION_ORDER = new Map<string, readonly string[]>([
	['posts', ['view', 'create', 'edit', 'publish', 'schedule', 'delete']],
	['media', ['view', 'upload', 'edit', 'delete']],
	['calendar', ['view', 'manage']],
	['channels', ['view', 'connect', 'manage', 'disconnect']],
	['approvals', ['request', 'review']],
	['analytics', ['view', 'export']],
	['members', ['view', 'manage', 'suspend', 'remove']],
	['invitations', ['view', 'create', 'resend', 'revoke']],
	[
		'profiles',
		[
			'view',
			'create',
			'edit',
			'assign_members',
			'manage_permissions',
			'delete',
		],
	],
	['settings', ['view', 'edit']],
	['billing', ['view', 'manage']],
	['audit_logs', ['view']],
	[
		'modules',
		['access_dashboard', 'access_billing', 'access_settings', 'access_users'],
	],
]);

const getPermissionAction = (permissionKey: string): string =>
	permissionKey.slice(permissionKey.lastIndexOf('.') + 1);

const comparePermissionOptions = (
	moduleKey: string,
	left: StaffTenantPermissionOption,
	right: StaffTenantPermissionOption,
): number => {
	const actionOrder = TENANT_PERMISSION_ACTION_ORDER.get(moduleKey) ?? [];
	const leftAction = getPermissionAction(left.key);
	const rightAction = getPermissionAction(right.key);
	const leftIndex = actionOrder.indexOf(leftAction);
	const rightIndex = actionOrder.indexOf(rightAction);

	if (leftIndex >= 0 && rightIndex >= 0) {
		return leftIndex - rightIndex;
	}
	if (leftIndex >= 0) {
		return -1;
	}
	if (rightIndex >= 0) {
		return 1;
	}

	return leftAction.localeCompare(rightAction);
};

const comparePermissionGroups = (
	left: StaffTenantPermissionGroup,
	right: StaffTenantPermissionGroup,
): number => {
	const leftIndex = TENANT_PERMISSION_MODULE_ORDER.indexOf(left.moduleKey);
	const rightIndex = TENANT_PERMISSION_MODULE_ORDER.indexOf(right.moduleKey);

	if (leftIndex >= 0 && rightIndex >= 0) {
		return leftIndex - rightIndex;
	}
	if (leftIndex >= 0) {
		return -1;
	}
	if (rightIndex >= 0) {
		return 1;
	}

	return left.moduleKey.localeCompare(right.moduleKey);
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const normalizePageIndex = (value: number | undefined): number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		? value
		: 0;

export const buildStaffTenantPermissionCatalogOptions = (
	catalog: unknown,
): StaffTenantPermissionOption[] => {
	const moduleEntries: StaffTenantPermissionOption[] = [];

	if (!isRecord(catalog)) {
		return moduleEntries;
	}

	for (const [moduleKey, permissions] of Object.entries(catalog)) {
		if (!isRecord(permissions)) {
			continue;
		}

		for (const permission of Object.values(permissions)) {
			if (!isRecord(permission)) {
				continue;
			}

			const key = normalizeUnknownString(permission.key);
			if (!key) {
				continue;
			}

			const name = normalizeUnknownString(permission.name);
			const description = normalizeUnknownString(permission.description);
			const moduleLabel = formatModuleLabel(moduleKey);
			const labelParts = [moduleLabel];

			if (name) {
				labelParts.push(name);
			}

			moduleEntries.push({
				key,
				label:
					labelParts.length > 1 ? `${labelParts[0]} • ${labelParts[1]}` : key,
				description: description ?? null,
			});
		}
	}

	return [...moduleEntries].sort((left, right) =>
		left.label.localeCompare(right.label),
	);
};

/** Groups the flat permission catalog by its module-key prefix (the
 * top-level dictionary key the backend returns, e.g. `Users`/`Tenants`) so
 * the create/edit-profile drawers can render a checklist per module. */
export const buildStaffTenantPermissionCatalogGroups = (
	catalog: unknown,
): StaffTenantPermissionGroup[] => {
	const groups: StaffTenantPermissionGroup[] = [];

	if (!isRecord(catalog)) {
		return groups;
	}

	for (const [moduleKey, permissions] of Object.entries(catalog)) {
		if (!isRecord(permissions)) {
			continue;
		}

		const options: StaffTenantPermissionOption[] = [];

		for (const permission of Object.values(permissions)) {
			if (!isRecord(permission)) {
				continue;
			}

			const key = normalizeUnknownString(permission.key);
			if (!key) {
				continue;
			}

			const name = normalizeUnknownString(permission.name);
			const description = normalizeUnknownString(permission.description);

			options.push({
				key,
				label: name ?? key,
				description: description ?? null,
			});
		}

		if (options.length === 0) {
			continue;
		}

		options.sort((left, right) =>
			comparePermissionOptions(moduleKey, left, right),
		);

		groups.push({
			moduleKey,
			moduleLabel: formatModuleLabel(moduleKey),
			options,
		});
	}

	return groups.sort(comparePermissionGroups);
};

export const buildFindStaffTenantProfilesQueryParameters = (
	variables: Omit<StaffTenantProfilesQueryVariables, 'tenantId'>,
) => ({
	q: normalizeString(variables.q),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
	isDefault: variables.isDefault,
});

const buildBulkDeleteStaffTenantProfilesBody = (
	profileIds: string[],
): BulkDeleteTenantProfilesBody => ({
	profileIds: createUntypedArray(
		profileIds.map((profileId) => createUntypedString(profileId)),
	) as BulkDeleteTenantProfilesBody['profileIds'],
});

export const toStaffTenantProfileBulkActionSummary = (
	result: BulkProfileActionResult | null | undefined,
): StaffTenantProfileBulkActionSummary => ({
	succeededCount: result?.succeededCount ?? 0,
	failedCount: result?.failedCount ?? 0,
	failedItems: (result?.failedItems ?? []).map((item) => ({
		profileId: normalizeString(item.profileId?.toString()) ?? null,
		error: normalizeString(item.errorEscaped) ?? null,
	})),
});

export const buildCreateStaffTenantProfileBody = (
	input: Omit<CreateStaffTenantProfileInput, 'tenantId'>,
): CreateTenantProfileAsStaffBody => {
	const body: CreateTenantProfileAsStaffBody = {};
	const description = normalizeString(input.description);
	const icon = normalizeString(input.icon);
	const tone = normalizeString(input.tone);

	body.name = createUntypedString(input.name) as typeof body.name;

	if (description) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	}
	if (icon) {
		body.icon = createUntypedString(icon) as typeof body.icon;
	}
	if (tone) {
		body.tone = createUntypedString(tone) as typeof body.tone;
	}

	const permissionKeys = (input.permissionKeys ?? [])
		.map((key) => normalizeString(key))
		.filter((key): key is string => key !== undefined);

	if (permissionKeys.length > 0) {
		body.permissionKeys = createUntypedArray(
			permissionKeys.map((key) => createUntypedString(key)),
		) as typeof body.permissionKeys;
	}

	return body;
};

export const buildUpdateStaffTenantProfileBody = (
	input: Omit<UpdateStaffTenantProfileInput, 'tenantId' | 'profileId'>,
): UpdateTenantProfileAsStaffBody => {
	const body: UpdateTenantProfileAsStaffBody = {};
	const description = normalizeString(input.description);
	const icon = normalizeString(input.icon);
	const tone = normalizeString(input.tone);

	body.name = createUntypedString(input.name.trim()) as typeof body.name;

	if (description !== undefined) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	} else if (input.description !== undefined) {
		body.description = null;
	}
	if (icon) {
		body.icon = createUntypedString(icon) as typeof body.icon;
	} else if (input.icon !== undefined) {
		body.icon = null;
	}
	if (tone) {
		body.tone = createUntypedString(tone) as typeof body.tone;
	} else if (input.tone !== undefined) {
		body.tone = null;
	}

	return body;
};

export const toStaffTenantProfileRows = (
	items: TenantProfileItem[] | null | undefined,
): StaffTenantProfileRow[] => {
	const rows: StaffTenantProfileRow[] = [];

	for (const item of items ?? []) {
		// A row with no readable name is malformed — dropped rather than shown
		// with a `'—'` placeholder a staff admin can't distinguish from a
		// legitimate value (shell-r5-F3).
		const id = normalizeString(item.id?.toString());
		const name = normalizeString(item.name);
		if (!id || !name) {
			continue;
		}

		rows.push({
			id,
			name,
			description: normalizeNullableString(item.description),
			icon: normalizeNullableString(item.icon),
			tone: normalizeNullableString(item.tone),
			isDefault: item.isDefault === true,
			userAccountCount: item.userAccountCount ?? 0,
			permissionsCount: item.permissionsCount ?? 0,
		});
	}

	return rows;
};

export const toStaffTenantProfileDetails = (
	result: GetTenantProfileByIdResponse | null | undefined,
): StaffTenantProfileDetails | null => {
	const profile = result?.profile;
	const id = normalizeString(profile?.id?.toString());
	const name = normalizeString(profile?.name);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder a staff admin
	// can't distinguish from a legitimate value (shell-r5-F3).
	if (!id || !name) {
		return null;
	}

	return {
		id,
		name,
		description: normalizeNullableString(profile?.description),
		icon: normalizeNullableString(profile?.icon),
		tone: normalizeNullableString(profile?.tone),
		isDefault: profile?.isDefault === true,
		userAccountCount: profile?.userAccountCount ?? 0,
		createdAt: normalizeDate(profile?.createdAt),
		updatedAt: normalizeDate(profile?.updatedAt),
	};
};

export const toStaffTenantProfilePermissionKeys = (
	result: FindTenantProfilePermissionsAsStaffResult | null | undefined,
): string[] => {
	const normalizedKeys: string[] = [];
	const seenKeys = new Set<string>();

	for (const permissionKey of result?.permissionKeys ?? []) {
		const normalizedKey = normalizeString(permissionKey);
		if (!normalizedKey || seenKeys.has(normalizedKey)) {
			continue;
		}

		normalizedKeys.push(normalizedKey);
		seenKeys.add(normalizedKey);
	}

	return [...normalizedKeys].sort((left, right) => left.localeCompare(right));
};

export const buildFindStaffTenantProfileMembersQueryParameters = (
	variables: Omit<
		StaffTenantProfileMembersQueryVariables,
		'tenantId' | 'profileId'
	>,
) => ({
	q: normalizeString(variables.q),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	page: String(normalizePageIndex(variables.pageIndex) + 1),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toStaffTenantProfileMemberRows = (
	items: TenantProfileUserItem[] | null | undefined,
): StaffTenantProfileMemberRow[] => {
	const rows: StaffTenantProfileMemberRow[] = [];

	for (const item of items ?? []) {
		// Email is the required fallback identity `getUserFullName` falls back
		// to — dropped rather than shown with a `'—'` placeholder a staff admin
		// can't distinguish from a legitimate value (shell-r5-F3). A row missing
		// either id is equally malformed — dropped rather than silently linking
		// to the wrong identity domain (step4b-review MAJOR 4).
		const id = normalizeString(item.id?.toString());
		const userId = normalizeString(item.userId?.toString());
		const email = normalizeString(item.email);
		if (!id || !userId || !email) {
			continue;
		}

		const firstName = normalizeNullableString(item.firstName);
		const lastName = normalizeNullableString(item.lastName);
		const otherProfiles: StaffTenantProfileMemberProfile[] = [];
		for (const profile of item.otherProfiles ?? []) {
			const profileId = normalizeString(profile.id?.toString());
			const profileName = normalizeString(profile.name);
			if (!profileId || !profileName) {
				continue;
			}

			otherProfiles.push({ id: profileId, name: profileName });
		}

		rows.push({
			id,
			userId,
			email,
			firstName,
			lastName,
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			status: item.status ?? null,
			level: item.level ?? null,
			otherProfiles,
			joinedAt: normalizeDate(item.joinedAt),
			displayName: getUserFullName({ firstName, lastName }) || email,
		});
	}

	return rows;
};

export const buildResolveStaffTenantProfileMemberAssignmentsBody = (
	userAccountIds: string[],
): ResolveTenantProfileUserAssignmentsAsStaffBody => ({
	userAccountIds: createUntypedArray(
		userAccountIds.map((userAccountId) => createUntypedString(userAccountId)),
	) as ResolveTenantProfileUserAssignmentsAsStaffBody['userAccountIds'],
});

export const toStaffTenantProfileMemberAssignmentMap = (
	result: ResolveTenantProfileUserAssignmentsAsStaffResult | null | undefined,
) => {
	const map: StaffTenantProfileUserAssignmentMap = {};

	for (const assignment of result?.assignments ?? []) {
		const userAccountId = normalizeString(assignment.userAccountId?.toString());
		if (!userAccountId) {
			continue;
		}

		map[userAccountId] = assignment.isAssigned === true;
	}

	return map;
};

export const staffTenantProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantProfilesAsStaffResult,
	StaffTenantProfilesQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILES_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.get({
					queryParameters:
						buildFindStaffTenantProfilesQueryParameters(variables),
				});

			if (!result) {
				throw new Error('staff tenant profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const createStaffTenantProfileMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetTenantProfileByIdResponse | undefined,
	CreateStaffTenantProfileInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'create'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.post(buildCreateStaffTenantProfileBody(variables)),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffTenantProfileMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetTenantProfileByIdResponse | undefined,
	UpdateStaffTenantProfileInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'update'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.patch(buildUpdateStaffTenantProfileBody(variables)),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const deleteStaffTenantProfileMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		ApiResponse | undefined,
		DeleteStaffTenantProfileInput
	>(
		{
			mutationKeyFn: () => ['staff-tenants', 'profiles', 'delete'],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.profiles.byProfileId(variables.profileId)
					.delete(),
			meta: { successMessage: 'profile-deleted-successfully' },
		},
		{ clientAccessor: getClientManager() },
	);

const bulkDeleteStaffTenantProfilesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkProfileActionResult | undefined,
	BulkDeleteStaffTenantProfilesInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'bulk-delete'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.bulkDelete.post(
					buildBulkDeleteStaffTenantProfilesBody(variables.profileIds),
				),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const staffTenantProfileDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetTenantProfileByIdResponse,
	StaffTenantProfileDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.get();

			if (!result) {
				throw new Error('staff tenant profile details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffTenantProfilePermissionKeysQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantProfilePermissionsAsStaffResult,
	StaffTenantProfilePermissionKeysQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.permissions.get();

			if (!result) {
				throw new Error(
					'staff tenant profile permission keys result was empty',
				);
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const getStaffTenantProfilePermissionKeysQueryKey = (
	variables: StaffTenantProfilePermissionKeysQueryVariables,
) => staffTenantProfilePermissionKeysQueryOptions.queryKey(variables);

export const getStaffTenantProfilePermissionKeysCacheSnapshot = (
	queryClient: QueryClient,
	variables: StaffTenantProfilePermissionKeysQueryVariables,
): { permissionKeys: string[]; revision: number } | null => {
	const queryState =
		queryClient.getQueryState<FindTenantProfilePermissionsAsStaffResult>(
			getStaffTenantProfilePermissionKeysQueryKey(variables),
		);

	if (!queryState?.data) {
		return null;
	}

	return {
		permissionKeys: toStaffTenantProfilePermissionKeys(queryState.data),
		revision: queryState.dataUpdateCount,
	};
};

export const staffTenantPermissionCatalogQueryOptions = buildStaffQueryOptions<
	ApiClient,
	TenantGetResponse,
	StaffTenantPermissionCatalogQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PERMISSION_CATALOG_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.permissions.scopes.tenant.get({
				queryParameters: {
					language: variables.language,
				},
			});

			if (!result) {
				throw new Error('staff tenant permission catalog result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

/**
 * Backs the Members-tab roster (#875's Find endpoint). Offset pagination
 * (page/limit), not cursor — mirrors `FindStaffProfileUsers` (the
 * staff-profiles precedent this endpoint was intentionally modeled on).
 */
export const staffTenantProfileMembersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantProfileUsersAsStaffResult,
	StaffTenantProfileMembersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILE_MEMBERS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.users.get({
					queryParameters:
						buildFindStaffTenantProfileMembersQueryParameters(variables),
				});

			if (!result) {
				throw new Error('tenant profile members result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

/**
 * Batch "is assigned" read backing the Assign-members drawer's already-
 * assigned state (#875's resolve endpoint). Modeled as a query (not a
 * mutation) even though the wire call is a POST — it is a read, not a
 * command, exactly like the sibling staff-profiles resolve endpoint.
 */
const staffTenantProfileMemberAssignmentResolutionQueryOptions =
	buildStaffQueryOptions<
		ApiClient,
		ResolveTenantProfileUserAssignmentsAsStaffResult,
		StaffTenantProfileUserAssignmentResolutionQueryVariables
	>(
		{
			queryKeyFn: () => [
				...STAFF_TENANT_PROFILE_MEMBER_ASSIGNMENT_RESOLUTION_QUERY_KEY,
			],
			fetcher: async (client, variables) => {
				const result = await client.staff.tenants
					.byTenantId(variables.tenantId)
					.profiles.byProfileId(variables.profileId)
					.users.assignmentResolution.post(
						buildResolveStaffTenantProfileMemberAssignmentsBody(
							variables.userAccountIds,
						),
					);

				if (!result) {
					throw new Error(
						'tenant profile member assignment resolution result was empty',
					);
				}

				return result;
			},
		},
		{ clientAccessor: getClientManager() },
	);

const assignStaffTenantProfilePermissionMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		void,
		StaffTenantProfilePermissionMutationVariables
	>(
		{
			mutationKeyFn: () => [
				'staff',
				'staff-tenants',
				'profiles',
				'permissions',
				'assign',
			],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.profiles.byProfileId(variables.profileId)
					.permissions.byPermissionKey(variables.permissionKey)
					.post(),
			meta: { successMessage: 'permission-assigned-success' },
		},
		{ clientAccessor: getClientManager() },
	);

const unassignStaffTenantProfilePermissionMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		void,
		StaffTenantProfilePermissionMutationVariables
	>(
		{
			mutationKeyFn: () => [
				'staff',
				'staff-tenants',
				'profiles',
				'permissions',
				'unassign',
			],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.profiles.byProfileId(variables.profileId)
					.permissions.byPermissionKey(variables.permissionKey)
					.delete(),
			meta: { successMessage: 'permission-unassigned-success' },
		},
		{ clientAccessor: getClientManager() },
	);

export type ResolveTenantProfileNameResolution = {
	name: string;
	profileId: string | null;
	reason: 'not-found' | 'ambiguous' | null;
};

export const toResolveTenantProfileNameResolutions = (
	result: ResolveTenantProfileNamesAsStaffResult | null | undefined,
): ResolveTenantProfileNameResolution[] =>
	(result?.names ?? [])
		.filter(
			(item): item is NonNullable<typeof item> =>
				item !== null && item !== undefined,
		)
		.map((item) => ({
			name: normalizeString(item.name) ?? '',
			profileId: normalizeString(item.profileId?.toString()) || null,
			reason:
				item.reason === 'not-found' || item.reason === 'ambiguous'
					? item.reason
					: null,
		}));

export type ResolveTenantProfileNamesInput = {
	tenantId: string;
	names: string[];
};

const resolveTenantProfileNamesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ResolveTenantProfileNamesAsStaffResult | undefined,
	ResolveTenantProfileNamesInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'resolve-names'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.resolveNames.post({
					names: createUntypedArray(
						variables.names.map((name) => createUntypedString(name)),
					),
				} as ResolveTenantProfileNamesAsStaffBody),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useResolveTenantProfileNamesMutation = () =>
	useMutation(resolveTenantProfileNamesMutationOptions);

export const useStaffTenantProfilesQuery = (
	variables: StaffTenantProfilesQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffTenantProfilesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useCreateStaffTenantProfileMutation = () =>
	useMutation(createStaffTenantProfileMutationOptions);

export const useUpdateStaffTenantProfileMutation = () =>
	useMutation(updateStaffTenantProfileMutationOptions);

export const useDeleteStaffTenantProfileMutation = () =>
	useMutation(deleteStaffTenantProfileMutationOptions);

export const useBulkDeleteStaffTenantProfilesMutation = () =>
	useMutation(bulkDeleteStaffTenantProfilesMutationOptions);

export const useStaffTenantProfileDetailsQuery = (
	variables: StaffTenantProfileDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantProfileDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantProfileDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the tenant-profile
 * detail route — same query key as `useStaffTenantProfileDetailsQuery`, so
 * TanStack Query dedupes and a cached name paints the crumb instantly.
 */
export const staffTenantProfileCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffTenantProfileDetailsQueryOptions.queryKey({
		tenantId: params.tenantId,
		profileId: params.profileId,
	}),
	queryFn: () =>
		staffTenantProfileDetailsQueryOptions.fetcher({
			tenantId: params.tenantId,
			profileId: params.profileId,
		}),
});

export const selectStaffTenantProfileCrumbName = (
	data: unknown,
): string | undefined =>
	toStaffTenantProfileDetails(
		data as GetTenantProfileByIdResponse | null | undefined,
	)?.name;

export const useStaffTenantProfilePermissionKeysQuery = (
	variables: StaffTenantProfilePermissionKeysQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantProfilePermissionKeysQueryOptions.queryKey(variables),
		queryFn: () =>
			staffTenantProfilePermissionKeysQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffTenantProfileMembersQuery = (
	variables: StaffTenantProfileMembersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantProfileMembersQueryOptions.queryKey(variables),
		queryFn: () => staffTenantProfileMembersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffTenantProfileMemberAssignmentResolutionQuery = (
	variables: StaffTenantProfileUserAssignmentResolutionQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey:
			staffTenantProfileMemberAssignmentResolutionQueryOptions.queryKey(
				variables,
			),
		queryFn: () =>
			staffTenantProfileMemberAssignmentResolutionQueryOptions.fetcher(
				variables,
			),
		enabled: (options?.enabled ?? true) && variables.userAccountIds.length > 0,
	});

export const useStaffTenantPermissionCatalogQuery = (
	variables?: StaffTenantPermissionCatalogQueryVariables,
) =>
	useQuery({
		queryKey: staffTenantPermissionCatalogQueryOptions.queryKey(
			variables ?? {},
		),
		queryFn: () =>
			staffTenantPermissionCatalogQueryOptions.fetcher(variables ?? {}),
	});

/**
 * Idempotent per-member profile toggle (owner-confirmed UX, step 4b): POST
 * assigns, DELETE unassigns at
 * `/staff/tenants/{tenantId}/profiles/{profileId}/users/{user_account_id}`.
 * Mirrors the permission-key upsert pair above. #875 added the sibling
 * "find members" and batch "resolve assignment" endpoints for TENANT
 * profiles (mirroring the STAFF-profile users routes, which already exposed
 * both) — see `useStaffTenantProfileMembersQuery` (the Members-tab roster)
 * and `useStaffTenantProfileMemberAssignmentResolutionQuery` (the
 * Assign-members drawer's already-assigned state) above.
 */
const assignStaffTenantProfileUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	void,
	StaffTenantProfileMemberMutationVariables
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'users', 'assign'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.users.byUser_account_id(variables.userAccountId)
				.post(),
		meta: { successMessage: 'profile-member-assigned-success' },
	},
	{ clientAccessor: getClientManager() },
);

const unassignStaffTenantProfileUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	void,
	StaffTenantProfileMemberMutationVariables
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'profiles', 'users', 'unassign'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.profiles.byProfileId(variables.profileId)
				.users.byUser_account_id(variables.userAccountId)
				.delete(),
		meta: { successMessage: 'profile-member-unassigned-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const useAssignStaffTenantProfilePermissionMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'permission-assigned-success',
	},
) =>
	useMutation({ ...assignStaffTenantProfilePermissionMutationOptions, meta });

export const useUnassignStaffTenantProfilePermissionMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'permission-unassigned-success',
	},
) =>
	useMutation({ ...unassignStaffTenantProfilePermissionMutationOptions, meta });

export const useAssignStaffTenantProfileUserMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'profile-member-assigned-success',
	},
) => useMutation({ ...assignStaffTenantProfileUserMutationOptions, meta });

export const useUnassignStaffTenantProfileUserMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'profile-member-unassigned-success',
	},
) => useMutation({ ...unassignStaffTenantProfileUserMutationOptions, meta });

export {
	assignStaffTenantProfilePermissionMutationOptions,
	unassignStaffTenantProfilePermissionMutationOptions,
	assignStaffTenantProfileUserMutationOptions,
	unassignStaffTenantProfileUserMutationOptions,
};
