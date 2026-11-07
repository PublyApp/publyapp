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
	ApiResponse,
	BulkDeleteTenantRolesBody,
	BulkRoleActionResult,
	CreateTenantRoleAsStaffBody,
	FindTenantRolePermissionsAsStaffResult,
	FindTenantRolesAsStaffResult,
	FindTenantRoleUsersAsStaffResult,
	GetTenantRoleByIdResponse,
	ResolveTenantRoleNamesAsStaffBody,
	ResolveTenantRoleNamesAsStaffResult,
	ResolveTenantRoleUserAssignmentsAsStaffBody,
	ResolveTenantRoleUserAssignmentsAsStaffResult,
	TenantRoleItem,
	TenantRoleUserItem,
	TenantUserStatus,
	UpdateTenantRoleAsStaffBody,
} from '@org/client-ts/models/index';
import type { TenantGetResponse } from '@org/client-ts/staff/permissions/scopes/tenant/index';
import type { MutationFeedbackMeta } from '@org/shared-ts/lib/mutation-feedback/types';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type StaffTenantRolesQueryVariables = {
	tenantId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
	isDefault?: 'true' | 'false';
};

export type CreateStaffTenantRoleInput = {
	tenantId: string;
	name: string;
	description?: string;
	icon?: string;
	tone?: string;
	permissionKeys?: string[];
};

export type UpdateStaffTenantRoleInput = {
	tenantId: string;
	roleId: string;
	name: string;
	description?: string;
	icon?: string | null;
	tone?: string | null;
};

export type DeleteStaffTenantRoleInput = {
	tenantId: string;
	roleId: string;
};

export type BulkDeleteStaffTenantRolesInput = {
	tenantId: string;
	roleIds: string[];
};

type StaffTenantRoleBulkActionFailedItem = {
	roleId: string | null;
	error: string | null;
};

export type StaffTenantRoleBulkActionSummary = {
	succeededCount: number;
	failedCount: number;
	failedItems: StaffTenantRoleBulkActionFailedItem[];
};

export type StaffTenantRoleRow = {
	id: string;
	name: string;
	description: string | null;
	icon?: string | null;
	tone?: string | null;
	isDefault: boolean;
	userAccountCount: number;
	permissionsCount: number;
};

export type StaffTenantRoleDetails = {
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

export type StaffTenantRoleDetailsQueryVariables = {
	tenantId: string;
	roleId: string;
};

export type StaffTenantRolePermissionKeysQueryVariables = {
	tenantId: string;
	roleId: string;
};

export type StaffTenantPermissionCatalogQueryVariables = {
	language?: string;
};

type StaffTenantRolePermissionMutationVariables = {
	tenantId: string;
	roleId: string;
	permissionKey: string;
};

type StaffTenantRoleMemberMutationVariables = {
	tenantId: string;
	roleId: string;
	userAccountId: string;
};

export type StaffTenantRoleMembersQueryVariables = {
	tenantId: string;
	roleId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	pageIndex?: number;
	size?: number;
};

export type StaffTenantRoleMemberRow = {
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
	isFullAccess: boolean;
	otherRoles: StaffTenantRoleMemberRole[];
	joinedAt: Date | null;
	displayName: string;
};

type StaffTenantRoleMemberRole = {
	id: string;
	name: string;
};

export type StaffTenantRoleUserAssignmentResolutionQueryVariables = {
	tenantId: string;
	roleId: string;
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
 * role, per `ResolveTenantRoleUserAssignmentsAsStaff` (#875). */
type StaffTenantRoleUserAssignmentMap = Record<string, boolean>;

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
 * `invalidateStaffTenantRoles`. Was previously scoped in-place, which
 * forced every `queryKeyFn` below to `.slice(1)` it back off before handing
 * it to `buildStaffQueryOptions` (which scopes again) — a second, easy-to-
 * forget-in-a-new-call-site incompatible shape, same defect class as
 * `staff-roles.ts`'s `STAFF_ROLES_QUERY_KEY`.
 */
export const STAFF_TENANT_ROLES_QUERY_KEY = ['staff-tenants', 'roles'] as const;
const STAFF_TENANT_ROLE_DETAILS_QUERY_KEY = [
	...STAFF_TENANT_ROLES_QUERY_KEY,
	'detail',
] as const;
const STAFF_TENANT_ROLE_PERMISSION_KEYS_QUERY_KEY = [
	...STAFF_TENANT_ROLES_QUERY_KEY,
	'permission-keys',
] as const;
const STAFF_TENANT_ROLE_MEMBERS_QUERY_KEY = [
	...STAFF_TENANT_ROLES_QUERY_KEY,
	'users',
] as const;
const STAFF_TENANT_ROLE_MEMBER_ASSIGNMENT_RESOLUTION_QUERY_KEY = [
	...STAFF_TENANT_ROLE_MEMBERS_QUERY_KEY,
	'assignment-resolution',
] as const;
/** @internal Unscoped — see `STAFF_TENANT_ROLES_QUERY_KEY` above. */
const STAFF_TENANT_PERMISSION_CATALOG_QUERY_KEY = [
	'tenant-permissions',
	'catalog',
] as const;

/** Invalidates the tenant-roles list, every role's details entry, its
 * permission-keys entry, and its members entry — all nest under
 * `STAFF_TENANT_ROLES_QUERY_KEY`, so a single prefix invalidation covers
 * every one. */
export const invalidateStaffTenantRoles = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_TENANT_ROLES_QUERY_KEY),
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
	'roles',
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
	'roles',
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
		'roles',
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
 * the create/edit-role drawers can render a checklist per module. */
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

export const buildFindStaffTenantRolesQueryParameters = (
	variables: Omit<StaffTenantRolesQueryVariables, 'tenantId'>,
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

const buildBulkDeleteStaffTenantRolesBody = (
	roleIds: string[],
): BulkDeleteTenantRolesBody => ({
	roleIds: createUntypedArray(
		roleIds.map((roleId) => createUntypedString(roleId)),
	) as BulkDeleteTenantRolesBody['roleIds'],
});

export const toStaffTenantRoleBulkActionSummary = (
	result: BulkRoleActionResult | null | undefined,
): StaffTenantRoleBulkActionSummary => ({
	succeededCount: result?.succeededCount ?? 0,
	failedCount: result?.failedCount ?? 0,
	failedItems: (result?.failedItems ?? []).map((item) => ({
		roleId: normalizeString(item.roleId?.toString()) ?? null,
		error: normalizeString(item.errorEscaped) ?? null,
	})),
});

export const buildCreateStaffTenantRoleBody = (
	input: Omit<CreateStaffTenantRoleInput, 'tenantId'>,
): CreateTenantRoleAsStaffBody => {
	const body: CreateTenantRoleAsStaffBody = {};
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

export const buildUpdateStaffTenantRoleBody = (
	input: Omit<UpdateStaffTenantRoleInput, 'tenantId' | 'roleId'>,
): UpdateTenantRoleAsStaffBody => {
	const body: UpdateTenantRoleAsStaffBody = {};
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

export const toStaffTenantRoleRows = (
	items: TenantRoleItem[] | null | undefined,
): StaffTenantRoleRow[] => {
	const rows: StaffTenantRoleRow[] = [];

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

export const toStaffTenantRoleDetails = (
	result: GetTenantRoleByIdResponse | null | undefined,
): StaffTenantRoleDetails | null => {
	const role = result?.role;
	const id = normalizeString(role?.id?.toString());
	const name = normalizeString(role?.name);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder a staff admin
	// can't distinguish from a legitimate value (shell-r5-F3).
	if (!id || !name) {
		return null;
	}

	return {
		id,
		name,
		description: normalizeNullableString(role?.description),
		icon: normalizeNullableString(role?.icon),
		tone: normalizeNullableString(role?.tone),
		isDefault: role?.isDefault === true,
		userAccountCount: role?.userAccountCount ?? 0,
		createdAt: normalizeDate(role?.createdAt),
		updatedAt: normalizeDate(role?.updatedAt),
	};
};

export const toStaffTenantRolePermissionKeys = (
	result: FindTenantRolePermissionsAsStaffResult | null | undefined,
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

export const buildFindStaffTenantRoleMembersQueryParameters = (
	variables: Omit<StaffTenantRoleMembersQueryVariables, 'tenantId' | 'roleId'>,
) => ({
	q: normalizeString(variables.q),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	page: String(normalizePageIndex(variables.pageIndex) + 1),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toStaffTenantRoleMemberRows = (
	items: TenantRoleUserItem[] | null | undefined,
): StaffTenantRoleMemberRow[] => {
	const rows: StaffTenantRoleMemberRow[] = [];

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
		const otherRoles: StaffTenantRoleMemberRole[] = [];
		for (const role of item.otherRoles ?? []) {
			const roleId = normalizeString(role.id?.toString());
			const roleName = normalizeString(role.name);
			if (!roleId || !roleName) {
				continue;
			}

			otherRoles.push({ id: roleId, name: roleName });
		}

		rows.push({
			id,
			userId,
			email,
			firstName,
			lastName,
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			status: item.status ?? null,
			isFullAccess: item.isFullAccess === true,
			otherRoles,
			joinedAt: normalizeDate(item.joinedAt),
			displayName: getUserFullName({ firstName, lastName }) || email,
		});
	}

	return rows;
};

export const buildResolveStaffTenantRoleMemberAssignmentsBody = (
	userAccountIds: string[],
): ResolveTenantRoleUserAssignmentsAsStaffBody => ({
	userAccountIds: createUntypedArray(
		userAccountIds.map((userAccountId) => createUntypedString(userAccountId)),
	) as ResolveTenantRoleUserAssignmentsAsStaffBody['userAccountIds'],
});

export const toStaffTenantRoleMemberAssignmentMap = (
	result: ResolveTenantRoleUserAssignmentsAsStaffResult | null | undefined,
) => {
	const map: StaffTenantRoleUserAssignmentMap = {};

	for (const assignment of result?.assignments ?? []) {
		const userAccountId = normalizeString(assignment.userAccountId?.toString());
		if (!userAccountId) {
			continue;
		}

		map[userAccountId] = assignment.isAssigned === true;
	}

	return map;
};

const staffTenantRolesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantRolesAsStaffResult,
	StaffTenantRolesQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_ROLES_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.get({
					queryParameters: buildFindStaffTenantRolesQueryParameters(variables),
				});

			if (!result) {
				throw new Error('staff tenant roles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const createStaffTenantRoleMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetTenantRoleByIdResponse | undefined,
	CreateStaffTenantRoleInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'create'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.post(buildCreateStaffTenantRoleBody(variables)),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffTenantRoleMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetTenantRoleByIdResponse | undefined,
	UpdateStaffTenantRoleInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'update'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.patch(buildUpdateStaffTenantRoleBody(variables)),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const deleteStaffTenantRoleMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	DeleteStaffTenantRoleInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'delete'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.delete(),
		meta: { successMessage: 'role-deleted-successfully' },
	},
	{ clientAccessor: getClientManager() },
);

const bulkDeleteStaffTenantRolesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkRoleActionResult | undefined,
	BulkDeleteStaffTenantRolesInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'bulk-delete'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.bulkDelete.post(
					buildBulkDeleteStaffTenantRolesBody(variables.roleIds),
				),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const staffTenantRoleDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetTenantRoleByIdResponse,
	StaffTenantRoleDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_ROLE_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.get();

			if (!result) {
				throw new Error('staff tenant role details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffTenantRolePermissionKeysQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantRolePermissionsAsStaffResult,
	StaffTenantRolePermissionKeysQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_ROLE_PERMISSION_KEYS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.permissions.get();

			if (!result) {
				throw new Error('staff tenant role permission keys result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const getStaffTenantRolePermissionKeysQueryKey = (
	variables: StaffTenantRolePermissionKeysQueryVariables,
) => staffTenantRolePermissionKeysQueryOptions.queryKey(variables);

export const getStaffTenantRolePermissionKeysCacheSnapshot = (
	queryClient: QueryClient,
	variables: StaffTenantRolePermissionKeysQueryVariables,
): { permissionKeys: string[]; revision: number } | null => {
	const queryState =
		queryClient.getQueryState<FindTenantRolePermissionsAsStaffResult>(
			getStaffTenantRolePermissionKeysQueryKey(variables),
		);

	if (!queryState?.data) {
		return null;
	}

	return {
		permissionKeys: toStaffTenantRolePermissionKeys(queryState.data),
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
 * (page/limit), not cursor — mirrors `FindStaffRoleUsers` (the
 * staff-roles precedent this endpoint was intentionally modeled on).
 */
const staffTenantRoleMembersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantRoleUsersAsStaffResult,
	StaffTenantRoleMembersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_ROLE_MEMBERS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.users.get({
					queryParameters:
						buildFindStaffTenantRoleMembersQueryParameters(variables),
				});

			if (!result) {
				throw new Error('tenant role members result was empty');
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
 * command, exactly like the sibling staff-roles resolve endpoint.
 */
const staffTenantRoleMemberAssignmentResolutionQueryOptions =
	buildStaffQueryOptions<
		ApiClient,
		ResolveTenantRoleUserAssignmentsAsStaffResult,
		StaffTenantRoleUserAssignmentResolutionQueryVariables
	>(
		{
			queryKeyFn: () => [
				...STAFF_TENANT_ROLE_MEMBER_ASSIGNMENT_RESOLUTION_QUERY_KEY,
			],
			fetcher: async (client, variables) => {
				const result = await client.staff.tenants
					.byTenantId(variables.tenantId)
					.roles.byRoleId(variables.roleId)
					.users.assignmentResolution.post(
						buildResolveStaffTenantRoleMemberAssignmentsBody(
							variables.userAccountIds,
						),
					);

				if (!result) {
					throw new Error(
						'tenant role member assignment resolution result was empty',
					);
				}

				return result;
			},
		},
		{ clientAccessor: getClientManager() },
	);

const assignStaffTenantRolePermissionMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		void,
		StaffTenantRolePermissionMutationVariables
	>(
		{
			mutationKeyFn: () => [
				'staff',
				'staff-tenants',
				'roles',
				'permissions',
				'assign',
			],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.roles.byRoleId(variables.roleId)
					.permissions.byPermissionKey(variables.permissionKey)
					.post(),
			meta: { successMessage: 'permission-assigned-success' },
		},
		{ clientAccessor: getClientManager() },
	);

const unassignStaffTenantRolePermissionMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		void,
		StaffTenantRolePermissionMutationVariables
	>(
		{
			mutationKeyFn: () => [
				'staff',
				'staff-tenants',
				'roles',
				'permissions',
				'unassign',
			],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.roles.byRoleId(variables.roleId)
					.permissions.byPermissionKey(variables.permissionKey)
					.delete(),
			meta: { successMessage: 'permission-unassigned-success' },
		},
		{ clientAccessor: getClientManager() },
	);

export type ResolveTenantRoleNameResolution = {
	name: string;
	roleId: string | null;
	reason: 'not-found' | 'ambiguous' | null;
};

export const toResolveTenantRoleNameResolutions = (
	result: ResolveTenantRoleNamesAsStaffResult | null | undefined,
): ResolveTenantRoleNameResolution[] =>
	(result?.names ?? [])
		.filter(
			(item): item is NonNullable<typeof item> =>
				item !== null && item !== undefined,
		)
		.map((item) => ({
			name: normalizeString(item.name) ?? '',
			roleId: normalizeString(item.roleId?.toString()) || null,
			reason:
				item.reason === 'not-found' || item.reason === 'ambiguous'
					? item.reason
					: null,
		}));

export type ResolveTenantRoleNamesInput = {
	tenantId: string;
	names: string[];
};

const resolveTenantRoleNamesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ResolveTenantRoleNamesAsStaffResult | undefined,
	ResolveTenantRoleNamesInput
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'resolve-names'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.resolveNames.post({
					names: createUntypedArray(
						variables.names.map((name) => createUntypedString(name)),
					),
				} as ResolveTenantRoleNamesAsStaffBody),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useResolveTenantRoleNamesMutation = () =>
	useMutation(resolveTenantRoleNamesMutationOptions);

export const useStaffTenantRolesQuery = (
	variables: StaffTenantRolesQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantRolesQueryOptions.queryKey(variables),
		queryFn: () => staffTenantRolesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useCreateStaffTenantRoleMutation = () =>
	useMutation(createStaffTenantRoleMutationOptions);

export const useUpdateStaffTenantRoleMutation = () =>
	useMutation(updateStaffTenantRoleMutationOptions);

export const useDeleteStaffTenantRoleMutation = () =>
	useMutation(deleteStaffTenantRoleMutationOptions);

export const useBulkDeleteStaffTenantRolesMutation = () =>
	useMutation(bulkDeleteStaffTenantRolesMutationOptions);

export const useStaffTenantRoleDetailsQuery = (
	variables: StaffTenantRoleDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantRoleDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantRoleDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the tenant-role
 * detail route — same query key as `useStaffTenantRoleDetailsQuery`, so
 * TanStack Query dedupes and a cached name paints the crumb instantly.
 */
export const staffTenantRoleCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffTenantRoleDetailsQueryOptions.queryKey({
		tenantId: params.tenantId,
		roleId: params.roleId,
	}),
	queryFn: () =>
		staffTenantRoleDetailsQueryOptions.fetcher({
			tenantId: params.tenantId,
			roleId: params.roleId,
		}),
});

export const selectStaffTenantRoleCrumbName = (
	data: unknown,
): string | undefined =>
	toStaffTenantRoleDetails(data as GetTenantRoleByIdResponse | null | undefined)
		?.name;

export const useStaffTenantRolePermissionKeysQuery = (
	variables: StaffTenantRolePermissionKeysQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantRolePermissionKeysQueryOptions.queryKey(variables),
		queryFn: () => staffTenantRolePermissionKeysQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffTenantRoleMembersQuery = (
	variables: StaffTenantRoleMembersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantRoleMembersQueryOptions.queryKey(variables),
		queryFn: () => staffTenantRoleMembersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffTenantRoleMemberAssignmentResolutionQuery = (
	variables: StaffTenantRoleUserAssignmentResolutionQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey:
			staffTenantRoleMemberAssignmentResolutionQueryOptions.queryKey(variables),
		queryFn: () =>
			staffTenantRoleMemberAssignmentResolutionQueryOptions.fetcher(variables),
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
 * Idempotent per-member role toggle (owner-confirmed UX, step 4b): POST
 * assigns, DELETE unassigns at
 * `/staff/tenants/{tenantId}/roles/{roleId}/users/{user_account_id}`.
 * Mirrors the permission-key upsert pair above. #875 added the sibling
 * "find members" and batch "resolve assignment" endpoints for TENANT
 * roles (mirroring the STAFF-role users routes, which already exposed
 * both) — see `useStaffTenantRoleMembersQuery` (the Members-tab roster)
 * and `useStaffTenantRoleMemberAssignmentResolutionQuery` (the
 * Assign-members drawer's already-assigned state) above.
 */
const assignStaffTenantRoleUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	void,
	StaffTenantRoleMemberMutationVariables
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'users', 'assign'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.users.byUser_account_id(variables.userAccountId)
				.post(),
		meta: { successMessage: 'role-member-assigned-success' },
	},
	{ clientAccessor: getClientManager() },
);

const unassignStaffTenantRoleUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	void,
	StaffTenantRoleMemberMutationVariables
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'roles', 'users', 'unassign'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.roles.byRoleId(variables.roleId)
				.users.byUser_account_id(variables.userAccountId)
				.delete(),
		meta: { successMessage: 'role-member-unassigned-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const useAssignStaffTenantRolePermissionMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'permission-assigned-success',
	},
) => useMutation({ ...assignStaffTenantRolePermissionMutationOptions, meta });

export const useUnassignStaffTenantRolePermissionMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'permission-unassigned-success',
	},
) => useMutation({ ...unassignStaffTenantRolePermissionMutationOptions, meta });

export const useAssignStaffTenantRoleUserMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'role-member-assigned-success',
	},
) => useMutation({ ...assignStaffTenantRoleUserMutationOptions, meta });

export const useUnassignStaffTenantRoleUserMutation = (
	meta: MutationFeedbackMeta = {
		successMessage: 'role-member-unassigned-success',
	},
) => useMutation({ ...unassignStaffTenantRoleUserMutationOptions, meta });

export {
	assignStaffTenantRolePermissionMutationOptions,
	unassignStaffTenantRolePermissionMutationOptions,
	assignStaffTenantRoleUserMutationOptions,
	unassignStaffTenantRoleUserMutationOptions,
};
