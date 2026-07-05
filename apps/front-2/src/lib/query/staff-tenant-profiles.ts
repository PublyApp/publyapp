import { createUntypedString } from '@microsoft/kiota-abstractions';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	ApiResponse,
	CreateTenantProfileAsStaffBody,
	FindTenantProfilePermissionsAsStaffResult,
	FindTenantProfilesAsStaffResult,
	GetTenantProfileByIdResponse,
	TenantProfileItem,
	UpdateTenantProfileAsStaffBody,
} from '@org/client-ts/src/models/index.js';
import type { TenantGetResponse } from '@org/client-ts/src/staff/permissions/scopes/tenant/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffTenantProfilesQueryVariables = {
	tenantId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type CreateStaffTenantProfileInput = {
	tenantId: string;
	name: string;
	description?: string;
};

export type UpdateStaffTenantProfileInput = {
	tenantId: string;
	profileId: string;
	name: string;
	description?: string;
};

export type DeleteStaffTenantProfileInput = {
	tenantId: string;
	profileId: string;
};

export type StaffTenantProfileRow = {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	userAccountCount: number;
};

export type StaffTenantProfileDetails = {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	userAccountCount: number;
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

export type StaffTenantProfilePermissionMutationVariables = {
	tenantId: string;
	profileId: string;
	permissionKey: string;
};

export type TenantPermissionCatalogItem = {
	key?: string | null;
	name?: string | null;
	description?: string | null;
};

export type TenantPermissionCatalog = Record<
	string,
	Record<string, TenantPermissionCatalogItem>
>;

export type StaffTenantPermissionOption = {
	key: string;
	label: string;
	description: string | null;
};

export const STAFF_TENANT_PROFILES_QUERY_KEY = [
	'staff',
	'staff-tenants',
	'profiles',
] as const;
export const STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY = [
	...STAFF_TENANT_PROFILES_QUERY_KEY,
	'detail',
] as const;
export const STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY = [
	...STAFF_TENANT_PROFILES_QUERY_KEY,
	'permission-keys',
] as const;
export const STAFF_TENANT_PERMISSION_CATALOG_QUERY_KEY = [
	'staff',
	'tenant-permissions',
	'catalog',
] as const;

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const normalizeUnknownString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const formatModuleLabel = (moduleKey: string): string =>
	moduleKey
		.trim()
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (value) => value.toUpperCase());

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

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

export const buildFindStaffTenantProfilesQueryParameters = (
	variables: Omit<StaffTenantProfilesQueryVariables, 'tenantId'>,
): {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => ({
	q: normalizeString(variables.q),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const buildCreateStaffTenantProfileBody = (
	input: Omit<CreateStaffTenantProfileInput, 'tenantId'>,
): CreateTenantProfileAsStaffBody => {
	const body: CreateTenantProfileAsStaffBody = {};
	const description = normalizeString(input.description);

	body.name = createUntypedString(input.name) as typeof body.name;

	if (description) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	}

	return body;
};

export const buildUpdateStaffTenantProfileBody = (
	input: Omit<UpdateStaffTenantProfileInput, 'tenantId' | 'profileId'>,
): UpdateTenantProfileAsStaffBody => {
	const body: UpdateTenantProfileAsStaffBody = {};
	const description = normalizeString(input.description);

	body.name = createUntypedString(input.name.trim()) as typeof body.name;
	body.description =
		description === undefined
			? input.description === undefined
				? undefined
				: null
			: (createUntypedString(description) as typeof body.description);

	return body;
};

export const toStaffTenantProfileRows = (
	items: TenantProfileItem[] | null | undefined,
): StaffTenantProfileRow[] => {
	const rows: StaffTenantProfileRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id?.toString());
		if (!id) {
			continue;
		}

		rows.push({
			id,
			name: normalizeString(item.name) ?? '—',
			description: normalizeNullableString(item.description),
			isDefault: item.isDefault === true,
			userAccountCount: item.userAccountCount ?? 0,
		});
	}

	return rows;
};

export const toStaffTenantProfileDetails = (
	result: GetTenantProfileByIdResponse | null | undefined,
): StaffTenantProfileDetails | null => {
	const profile = result?.profile;
	const id = normalizeString(profile?.id?.toString());

	if (!id) {
		return null;
	}

	return {
		id,
		name: normalizeString(profile?.name) ?? '—',
		description: normalizeNullableString(profile?.description),
		isDefault: profile?.isDefault === true,
		userAccountCount: profile?.userAccountCount ?? 0,
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

const staffTenantProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantProfilesAsStaffResult,
	StaffTenantProfilesQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILES_QUERY_KEY.slice(1)],
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
		},
		{ clientAccessor: getClientManager() },
	);

const staffTenantProfileDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetTenantProfileByIdResponse,
	StaffTenantProfileDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY.slice(1)],
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
		queryKeyFn: () => [
			...STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY.slice(1),
		],
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

const staffTenantPermissionCatalogQueryOptions = buildStaffQueryOptions<
	ApiClient,
	TenantGetResponse,
	StaffTenantPermissionCatalogQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_PERMISSION_CATALOG_QUERY_KEY.slice(1)],
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
		},
		{ clientAccessor: getClientManager() },
	);

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

export const useAssignStaffTenantProfilePermissionMutation = () =>
	useMutation(assignStaffTenantProfilePermissionMutationOptions);

export const useUnassignStaffTenantProfilePermissionMutation = () =>
	useMutation(unassignStaffTenantProfilePermissionMutationOptions);

export {
	assignStaffTenantProfilePermissionMutationOptions,
	unassignStaffTenantProfilePermissionMutationOptions,
};
