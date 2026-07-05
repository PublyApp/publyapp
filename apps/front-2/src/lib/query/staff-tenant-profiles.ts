import { createUntypedString } from '@microsoft/kiota-abstractions';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	CreateTenantProfileAsStaffBody,
	FindTenantProfilePermissionsAsStaffResult,
	FindTenantProfilesAsStaffResult,
	GetTenantProfileByIdResponse,
	TenantProfileItem,
	UpdateTenantProfileAsStaffBody,
} from '@org/client-ts/src/models/index.js';
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

export const STAFF_TENANT_PROFILES_QUERY_KEY = [
	'staff',
	'staff-tenants',
	'profiles',
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

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

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

const staffTenantProfileDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetTenantProfileByIdResponse,
	StaffTenantProfileDetailsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-tenants', 'profiles', 'detail'],
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
		queryKeyFn: () => ['staff-tenants', 'profiles', 'permission-keys'],
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
