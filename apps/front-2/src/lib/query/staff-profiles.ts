import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	CreateStaffProfileBody,
	FindStaffProfilePermissionsResult,
	FindStaffProfilesResult,
	GetStaffProfileByIdResult,
	StaffProfileItem,
	StaffProfileCreated,
} from '@org/client-ts/src/models/index.js';
import type { StaffGetResponse } from '@org/client-ts/src/staff/permissions/scopes/staff/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
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
	userAccountCount: number;
};

export type StaffProfileDetails = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number;
};

export type StaffProfileDetailsQueryVariables = {
	profileId: string;
};

export type StaffProfilePermissionKeysQueryVariables = {
	profileId: string;
};

export type StaffAssignedPermission = {
	key: string;
	label: string;
	description: string | null;
};

export type StaffAssignedPermissionGroup = {
	key: string;
	label: string;
	permissions: StaffAssignedPermission[];
};

export const STAFF_PROFILES_QUERY_KEY = ['staff', 'staff-profiles'] as const;

const normalizeString = (value: string | undefined): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
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
		if (typeof item.id !== 'string' || item.id.length === 0) {
			continue;
		}

		rows.push({
			id: item.id,
			name: item.name?.trim() || '—',
			description: item.description ?? null,
			userAccountCount: item.userAccountCount ?? 0,
		});
	}

	return rows;
};

export const toStaffProfileDetails = (
	result: GetStaffProfileByIdResult | null | undefined,
): StaffProfileDetails | null => {
	const profile = result?.profile;
	const id = normalizeString(profile?.id ?? undefined);

	if (!id) {
		return null;
	}

	return {
		id,
		name: normalizeString(profile?.name ?? undefined) ?? '—',
		description: profile?.description ?? null,
		userAccountCount: profile?.userAccountCount ?? 0,
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
			return byLabel !== 0 ? byLabel : left.key.localeCompare(right.key);
		});
	}

	groups.sort((left, right) => {
		const byLabel = left.label.localeCompare(right.label);
		return byLabel !== 0 ? byLabel : left.key.localeCompare(right.key);
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

	return body;
};

const staffProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfilesResult,
	StaffProfilesQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles'],
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
	},
	{ clientAccessor: getClientManager() },
);

const staffProfileDetailsQueryOptions = buildStaffQueryOptions<
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

export const useStaffProfileDetailsQuery = (
	variables: StaffProfileDetailsQueryVariables,
) =>
	useQuery({
		queryKey: staffProfileDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffProfileDetailsQueryOptions.fetcher(variables),
	});

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
