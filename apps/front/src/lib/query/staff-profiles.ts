import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { EntityCrumbQuery } from '~/lib/navigation/breadcrumbs';
import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	BulkDeleteStaffProfilesBody,
	BulkProfileActionResult,
	CreateStaffProfileBody,
	FindStaffProfilePermissionsResult,
	FindStaffProfilesResult,
	GetStaffProfileByIdResult,
	StaffProfileItem,
	StaffProfileCreated,
	UpdateStaffProfileBody,
} from '@org/client-ts/models/index';
import type { StaffGetResponse } from '@org/client-ts/staff/permissions/scopes/staff/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffProfilesQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: number;
};

export type CreateStaffProfileInput = {
	name: string;
	description?: string;
	permissions: string[];
	emails?: string[];
	/** Persisted profile style (#980); omitted values stay null on the wire. */
	icon?: string | null;
	tone?: string | null;
};

/** #819 — PATCH body input for the staff-profile edit drawer. Optional keys
 * that are present follow the API's omit/set/clear semantics:
 * `undefined` = omit (keep the stored value), a non-empty string = set,
 * and an explicit empty/whitespace string or `null` = clear. */
export type UpdateStaffProfileInput = {
	profileId: string;
	name: string;
	description?: string | null;
	icon?: string | null;
	tone?: string | null;
};

export type StaffPermissionCatalogQueryVariables = {
	language?: string;
};

export type StaffPermissionCatalogEntry = {
	key?: string | null;
	name?: string | null;
	description?: string | null;
};

export type StaffPermissionCatalog = Record<
	string,
	Record<string, StaffPermissionCatalogEntry>
>;

export type StaffProfileRow = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number | null;
	icon: string;
	iconTone: string;
};

export type StaffProfileDetails = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number | null;
	icon: string;
	iconTone: string;
};

export type StaffProfileDetailsQueryVariables = {
	profileId: string;
};

export type StaffProfilePermissionKeysQueryVariables = {
	profileId: string;
};

type StaffAssignedPermission = {
	key: string;
	label: string;
	description: string | null;
};

export type StaffAssignedPermissionGroup = {
	key: string;
	label: string;
	permissions: StaffAssignedPermission[];
};

/**
 * @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this. Don't hand-assemble a prefixed key at
 * a call site (review-r3-users-auth.md F11); use `invalidateStaffProfiles`.
 */
export const STAFF_PROFILES_QUERY_KEY = ['staff-profiles'] as const;

/** Invalidates the staff-profiles list and every profile's details +
 * permission-keys entries — all nest under `STAFF_PROFILES_QUERY_KEY` (see
 * F16/F19). */
export const invalidateStaffProfiles = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_PROFILES_QUERY_KEY),
	});

const normalizeString = (value: string | undefined): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

// #980: rows/details carry the profile's persisted icon and tone; when none
// was stored, `deriveProfileCardStyle` derives a deterministic picker-valid
// fallback from the name — the same rule tenant profiles follow.
const toProfileCardStyle = (
	name: string,
	icon?: string | null,
	tone?: string | null,
) => {
	const style = deriveProfileCardStyle(name, icon, tone);
	return { icon: style.icon, iconTone: style.tone };
};
const formatModuleLabel = (moduleKey: string): string =>
	moduleKey
		.trim()
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (value) => value.toUpperCase());

const getPermissionGroupKey = (permissionKey: string): string => {
	for (const separator of ['.', ':']) {
		const separatorIndex = permissionKey.indexOf(separator);
		if (separatorIndex > 0) {
			return permissionKey.slice(0, separatorIndex);
		}
	}

	return permissionKey;
};

export const toStaffProfileRows = (
	items: StaffProfileItem[] | null | undefined,
): StaffProfileRow[] => {
	const list = items ?? [];
	const rows: StaffProfileRow[] = [];

	for (const item of list) {
		// A row with no readable name is malformed — dropped rather than shown
		// with a `'—'` placeholder (and its icon derived from a fabricated
		// `'profile'` fallback) that a staff admin can't distinguish from a
		// legitimate value (shell-r5-F3).
		const name = item.name?.trim();
		if (typeof item.id !== 'string' || item.id.length === 0 || !name) {
			continue;
		}

		rows.push({
			id: item.id,
			name,
			description: item.description ?? null,
			userAccountCount: item.userAccountCount ?? null,
			...toProfileCardStyle(name, item.icon, item.tone),
		});
	}

	return rows;
};

export const toStaffProfileDetails = (
	result: GetStaffProfileByIdResult | null | undefined,
): StaffProfileDetails | null => {
	const profile = result?.profile;
	const id = normalizeString(profile?.id ?? undefined);
	const name = normalizeString(profile?.name ?? undefined);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder or an icon
	// derived from a fabricated `'profile'` fallback (shell-r5-F3).
	if (!id || !name) {
		return null;
	}

	return {
		id,
		name,
		description: profile?.description ?? null,
		userAccountCount: profile?.userAccountCount ?? null,
		...toProfileCardStyle(name, profile?.icon, profile?.tone),
	};
};

export const toAssignedStaffPermissionGroups = (
	assignedKeys: string[] | null | undefined,
	catalog?: StaffPermissionCatalog | null,
): StaffAssignedPermissionGroup[] => {
	const normalizedAssignedKeys: string[] = [];
	const seenAssignedKeys = new Set<string>();

	for (const permissionKey of assignedKeys ?? []) {
		const normalizedKey = normalizeOptionalString(permissionKey);

		if (!normalizedKey || seenAssignedKeys.has(normalizedKey)) {
			continue;
		}

		normalizedAssignedKeys.push(normalizedKey);
		seenAssignedKeys.add(normalizedKey);
	}

	if (normalizedAssignedKeys.length === 0) {
		return [];
	}

	const catalogEntriesByKey = new Map<
		string,
		{
			groupKey: string;
			groupLabel: string;
			label: string;
			description: string | null;
		}
	>();

	for (const [moduleKey, permissions] of Object.entries(catalog ?? {})) {
		const normalizedModuleKey = normalizeOptionalString(moduleKey);
		if (
			!normalizedModuleKey ||
			typeof permissions !== 'object' ||
			permissions === null
		) {
			continue;
		}

		for (const permission of Object.values(permissions)) {
			if (typeof permission !== 'object' || permission === null) {
				continue;
			}

			const permissionKey = normalizeOptionalString(permission.key);
			if (!permissionKey) {
				continue;
			}

			catalogEntriesByKey.set(permissionKey, {
				groupKey: normalizedModuleKey,
				groupLabel: formatModuleLabel(normalizedModuleKey),
				label: normalizeOptionalString(permission.name) ?? permissionKey,
				description: normalizeOptionalString(permission.description) ?? null,
			});
		}
	}

	const groupsByKey = new Map<string, StaffAssignedPermissionGroup>();

	for (const permissionKey of normalizedAssignedKeys) {
		const catalogEntry = catalogEntriesByKey.get(permissionKey);
		const groupKey =
			catalogEntry?.groupKey ?? getPermissionGroupKey(permissionKey);
		const groupLabel = catalogEntry?.groupLabel ?? formatModuleLabel(groupKey);
		const group = groupsByKey.get(groupKey) ?? {
			key: groupKey,
			label: groupLabel,
			permissions: [],
		};

		group.permissions.push({
			key: permissionKey,
			label: catalogEntry?.label ?? permissionKey,
			description: catalogEntry?.description ?? null,
		});

		groupsByKey.set(groupKey, group);
	}

	const groups = Array.from(groupsByKey.values());

	for (const group of groups) {
		group.permissions.sort((left, right) => {
			const byLabel = left.label.localeCompare(right.label);
			if (byLabel !== 0) {
				return byLabel;
			}
			return left.key.localeCompare(right.key);
		});
	}

	groups.sort((left, right) => {
		const byLabel = left.label.localeCompare(right.label);
		if (byLabel !== 0) {
			return byLabel;
		}
		return left.key.localeCompare(right.key);
	});

	return groups;
};

export const buildCreateStaffProfileBody = (
	input: CreateStaffProfileInput,
): CreateStaffProfileBody => {
	const body: CreateStaffProfileBody = {};
	const description = normalizeString(input.description);
	const permissions = input.permissions.filter(
		(permission) => permission.length > 0,
	);
	const emails =
		input.emails?.filter((email) => normalizeString(email) !== undefined) ?? [];

	body.name = createUntypedString(input.name) as typeof body.name;

	if (description) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	}

	if (permissions.length > 0) {
		body.permissions = createUntypedArray(
			permissions.map((permission) => createUntypedString(permission)),
		) as typeof body.permissions;
	}

	if (emails.length > 0) {
		body.emails = createUntypedArray(
			emails.map((email) => createUntypedString(email)),
		) as typeof body.emails;
	}

	if (normalizeString(input.icon ?? undefined) !== undefined) {
		body.icon = createUntypedString(
			normalizeString(input.icon ?? undefined) as string,
		) as typeof body.icon;
	}

	if (normalizeString(input.tone ?? undefined) !== undefined) {
		body.tone = createUntypedString(
			normalizeString(input.tone ?? undefined) as string,
		) as typeof body.tone;
	}

	return body;
};

/**
 * #819 — builds the PATCH body for `UpdateStaffProfile`, mirroring
 * `buildUpdateStaffTenantProfileBody`. The API's PATCH semantics are:
 * omitted key = keep the stored value, string = set, null = clear. A blank
 * form field is normalized to an explicit `null` so clearing a description or
 * style on the wire is unambiguous, while an absent key never reaches the body.
 */
export const buildUpdateStaffProfileBody = (
	input: Omit<UpdateStaffProfileInput, 'profileId'>,
): UpdateStaffProfileBody => {
	const body: UpdateStaffProfileBody = {};
	const description = normalizeString(input.description ?? undefined);
	const icon = normalizeString(input.icon ?? undefined);
	const tone = normalizeString(input.tone ?? undefined);

	body.name = createUntypedString(input.name.trim()) as typeof body.name;

	if (description !== undefined) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	} else if (input.description !== undefined) {
		body.description = null;
	}

	if (icon !== undefined) {
		body.icon = createUntypedString(icon) as typeof body.icon;
	} else if (input.icon !== undefined) {
		body.icon = null;
	}

	if (tone !== undefined) {
		body.tone = createUntypedString(tone) as typeof body.tone;
	} else if (input.tone !== undefined) {
		body.tone = null;
	}

	return body;
};

const staffProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfilesResult,
	StaffProfilesQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_PROFILES_QUERY_KEY],
		fetcher: async (client, vars) => {
			const result = await client.staff.profiles.get({
				queryParameters: {
					q: vars.q,
					sortId: vars.sortId,
					sortOrder: vars.sortOrder,
					cursor: vars.cursor,
					limit: vars.limit === undefined ? undefined : String(vars.limit),
				},
			});

			if (!result) {
				throw new Error('staff profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const createStaffProfileMutationOptions = buildStaffMutationOptions<
	ApiClient,
	StaffProfileCreated | undefined,
	CreateStaffProfileInput
>(
	{
		mutationKeyFn: () => ['staff-profiles', 'create'],
		mutationFn: (client, variables) =>
			client.staff.profiles.post(buildCreateStaffProfileBody(variables)),
		meta: {
			successMessage: 'profile-created-successfully',
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffProfileDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetStaffProfileByIdResult,
	StaffProfileDetailsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles', 'details'],
		fetcher: async (client, variables) => {
			const result = await client.staff.profiles
				.byProfileId(variables.profileId)
				.get();

			if (!result) {
				throw new Error('staff profile details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffProfilePermissionKeysQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfilePermissionsResult,
	StaffProfilePermissionKeysQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles', 'permission-keys'],
		fetcher: async (client, variables) => {
			const result = await client.staff.profiles
				.byProfileId(variables.profileId)
				.permissions.get();

			if (!result) {
				throw new Error('staff profile permission keys result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffPermissionCatalogQueryOptions = buildStaffQueryOptions<
	ApiClient,
	StaffGetResponse,
	StaffPermissionCatalogQueryVariables
>(
	{
		queryKeyFn: () => ['staff-permissions', 'catalog'],
		fetcher: async (client, variables) => {
			const result = await client.staff.permissions.scopes.staff.get({
				queryParameters: {
					language: variables.language,
				},
			});

			if (!result) {
				throw new Error('staff permission catalog result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffProfilesQuery = (variables: StaffProfilesQueryVariables) =>
	useQuery({
		queryKey: staffProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffProfilesQueryOptions.fetcher(variables),
	});

export const useCreateStaffProfileMutation = () =>
	useMutation(createStaffProfileMutationOptions);

const updateStaffProfileMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffProfileByIdResult | undefined,
	UpdateStaffProfileInput
>(
	{
		mutationKeyFn: () => ['staff-profiles', 'update'],
		mutationFn: (client, variables) =>
			client.staff.profiles.byProfileId(variables.profileId).patch(
				buildUpdateStaffProfileBody({
					name: variables.name,
					description: variables.description,
					icon: variables.icon,
					tone: variables.tone,
				}),
			),
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useUpdateStaffProfileMutation = () =>
	useMutation(updateStaffProfileMutationOptions);

export const useStaffProfileDetailsQuery = (
	variables: StaffProfileDetailsQueryVariables,
) =>
	useQuery({
		queryKey: staffProfileDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffProfileDetailsQueryOptions.fetcher(variables),
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the (non-tenant)
 * staff-profile detail route — same query key as
 * `useStaffProfileDetailsQuery`, so TanStack Query dedupes and a cached name
 * paints the crumb instantly.
 */
export const staffProfileCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffProfileDetailsQueryOptions.queryKey({
		profileId: params.profileId,
	}),
	queryFn: () =>
		staffProfileDetailsQueryOptions.fetcher({ profileId: params.profileId }),
});

export const selectStaffProfileCrumbName = (
	data: unknown,
): string | undefined =>
	toStaffProfileDetails(data as GetStaffProfileByIdResult | null | undefined)
		?.name;

export const useStaffProfilePermissionKeysQuery = (
	variables: StaffProfilePermissionKeysQueryVariables,
) =>
	useQuery({
		queryKey: staffProfilePermissionKeysQueryOptions.queryKey(variables),
		queryFn: () => staffProfilePermissionKeysQueryOptions.fetcher(variables),
	});

export const useStaffPermissionCatalogQuery = (
	variables: StaffPermissionCatalogQueryVariables,
) =>
	useQuery({
		queryKey: staffPermissionCatalogQueryOptions.queryKey(variables),
		queryFn: () => staffPermissionCatalogQueryOptions.fetcher(variables),
	});

export type BulkStaffProfileActionInput = {
	profileIds: string[];
};

// #1386 — the toolbar owns bulk feedback (mutation-feedback ownership): the
// silent meta mirrors the #1385 staff-users bulk hooks so the global handler
// stays out of the way and the selection bar toasts full/partial results.
const buildBulkDeleteStaffProfilesBody = (
	profileIds: string[],
): BulkDeleteStaffProfilesBody => ({
	profileIds: createUntypedArray(
		profileIds.map((profileId) => createUntypedString(profileId)),
	),
});

const bulkDeleteStaffProfilesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkProfileActionResult | undefined,
	BulkStaffProfileActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_PROFILES_QUERY_KEY, 'bulk-delete'],
		mutationFn: (client, variables) =>
			client.staff.profiles.bulkDelete.post(
				buildBulkDeleteStaffProfilesBody(variables.profileIds),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkDeleteStaffProfilesMutation = () =>
	useMutation(bulkDeleteStaffProfilesMutationOptions);
