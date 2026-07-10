import {
	createUntypedArray,
	createUntypedNumber,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	CreateTenantAsStaffBody,
	CreateTenantAsStaffResult,
	ApiResponse,
	BulkDeleteTenantsResult,
	BulkReactivateTenantsResult,
	BulkSuspendTenantsResult,
	FindTenantsAsStaffResponse,
	GetTenantAsStaffResult,
	TenantReactivatedResult,
	TenantSuspendedResult,
	UpdateTenantAsStaffBody,
	TenantAsStaffListItem,
} from '@org/client-ts/src/models/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffTenantsQueryVariables = {
	q?: string;
	status?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffTenantRow = {
	id: string;
	name: string;
	status: string | null;
	usersCount: number;
	maxUsers: number;
};

export type StaffTenantDetailsQueryVariables = {
	tenantId: string;
};

export type StaffTenantUpdateInput = {
	tenantId: string;
	name?: string;
	maxUsers?: number;
	logoUrl?: string | null;
};

export type StaffTenantLifeCycleInput = {
	tenantId: string;
};

export type StaffTenantDetails = {
	id: string;
	name: string;
	code: string | null;
	status: string | null;
	usersCount: number;
	maxUsers: number;
	logoUrl: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

export type StaffTenantInitialUserInput = {
	email: string;
	accountLevel: string;
};

export type CreateStaffTenantInput = {
	name: string;
	maxUsers: number;
	initialUsers: StaffTenantInitialUserInput[];
};

export const STAFF_TENANTS_QUERY_KEY = ['staff-tenants'] as const;

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

const normalizeOptionalUpdateString = (
	value: string | null | undefined,
): string | null | undefined => {
	if (value === undefined || value === null) {
		return value;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const STAFF_TENANT_DETAILS_QUERY_KEY = [
	'staff-tenants',
	'detail',
] as const;

export const buildFindStaffTenantsQueryParameters = (
	variables: StaffTenantsQueryVariables,
): {
	q?: string;
	status?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => ({
	q: normalizeString(variables.q),
	status: normalizeString(variables.status),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toStaffTenantRows = (
	items: TenantAsStaffListItem[] | null | undefined,
): StaffTenantRow[] => {
	const rows: StaffTenantRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			name: normalizeString(item.name) ?? '—',
			status: normalizeNullableString(item.status),
			usersCount: item.usersCount ?? 0,
			maxUsers: item.maxUsers ?? 0,
		});
	}

	return rows;
};

export const toStaffTenantDetails = (
	result: GetTenantAsStaffResult | null | undefined,
): StaffTenantDetails | null => {
	const id = normalizeString(result?.tenantId?.toString() ?? undefined);
	if (!id) {
		return null;
	}

	return {
		id,
		name: normalizeString(result?.name) ?? '—',
		code: normalizeNullableString(result?.code),
		status: normalizeNullableString(result?.status),
		usersCount: result?.usersCount ?? 0,
		maxUsers: result?.maxUsers ?? 0,
		logoUrl: normalizeNullableString(result?.logoUrl),
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
	};
};

export const buildCreateStaffTenantBody = (
	input: CreateStaffTenantInput,
): CreateTenantAsStaffBody => {
	const body: CreateTenantAsStaffBody = {};
	const name = normalizeString(input.name);
	const rawInitialUsers = Array.isArray(input.initialUsers)
		? input.initialUsers
		: [];
	const initialUsers = rawInitialUsers
		.map((user) => ({
			email: normalizeString(user.email),
			accountLevel: normalizeString(user.accountLevel),
		}))
		.filter((user): user is { email: string; accountLevel: string } =>
			Boolean(user.email && user.accountLevel),
		)
		.map((user) =>
			createUntypedObject({
				email: createUntypedString(user.email),
				accountLevel: createUntypedString(user.accountLevel),
			}),
		);

	if (name) {
		body.name = createUntypedString(name) as typeof body.name;
	}

	if (isPositiveSafeInteger(input.maxUsers)) {
		body.maxUsers = createUntypedNumber(input.maxUsers) as typeof body.maxUsers;
	}

	if (initialUsers.length > 0) {
		body.initialUsers = createUntypedArray(
			initialUsers,
		) as typeof body.initialUsers;
	}

	return body;
};

export const buildUpdateStaffTenantBody = (
	input: Omit<StaffTenantUpdateInput, 'tenantId'>,
): UpdateTenantAsStaffBody => {
	const body: UpdateTenantAsStaffBody = {};
	const name = normalizeString(input.name);
	const logoUrl = normalizeOptionalUpdateString(input.logoUrl);

	if (name) {
		body.name = createUntypedString(name) as typeof body.name;
	}

	if (isPositiveSafeInteger(input.maxUsers)) {
		body.maxUsers = createUntypedNumber(input.maxUsers) as typeof body.maxUsers;
	}

	if (logoUrl !== undefined) {
		body.logoUrl =
			logoUrl === null
				? null
				: (createUntypedString(logoUrl) as typeof body.logoUrl);
	}

	return body;
};

export const staffTenantsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantsAsStaffResponse,
	StaffTenantsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANTS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants.get({
				queryParameters: buildFindStaffTenantsQueryParameters(variables),
			});

			if (!result) {
				throw new Error('staff tenants result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const createStaffTenantMutationOptions = buildStaffMutationOptions<
	ApiClient,
	CreateTenantAsStaffResult | undefined,
	CreateStaffTenantInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'create'],
		mutationFn: (client, variables) =>
			client.staff.tenants.post(buildCreateStaffTenantBody(variables)),
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffTenantsQuery = (variables: StaffTenantsQueryVariables) =>
	useQuery({
		queryKey: staffTenantsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantsQueryOptions.fetcher(variables),
	});

export const updateStaffTenantMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetTenantAsStaffResult | undefined,
	StaffTenantUpdateInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'update'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.patch(buildUpdateStaffTenantBody(variables)),
	},
	{ clientAccessor: getClientManager() },
);

const staffTenantDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetTenantAsStaffResult,
	StaffTenantDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.get();

			if (!result) {
				throw new Error('staff tenant details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffTenantDetailsQuery = (
	variables: StaffTenantDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
		staleTime: 30_000,
	});

export const useCreateStaffTenantMutation = () =>
	useMutation(createStaffTenantMutationOptions);

export const useUpdateStaffTenantMutation = () =>
	useMutation(updateStaffTenantMutationOptions);

export const suspendStaffTenantMutationOptions = buildStaffMutationOptions<
	ApiClient,
	TenantSuspendedResult | undefined,
	StaffTenantLifeCycleInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'suspend'],
		mutationFn: (client, variables) =>
			client.staff.tenants.byTenantId(variables.tenantId).suspend.post({}),
	},
	{ clientAccessor: getClientManager() },
);

export const reactivateStaffTenantMutationOptions = buildStaffMutationOptions<
	ApiClient,
	TenantReactivatedResult | undefined,
	StaffTenantLifeCycleInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'reactivate'],
		mutationFn: (client, variables) =>
			client.staff.tenants.byTenantId(variables.tenantId).reactivate.post(),
	},
	{ clientAccessor: getClientManager() },
);

export const deleteStaffTenantMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffTenantLifeCycleInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'delete'],
		mutationFn: (client, variables) =>
			client.staff.tenants.byTenantId(variables.tenantId).delete(),
	},
	{ clientAccessor: getClientManager() },
);

export const useSuspendStaffTenantMutation = () =>
	useMutation(suspendStaffTenantMutationOptions);

export const useReactivateStaffTenantMutation = () =>
	useMutation(reactivateStaffTenantMutationOptions);

export const useDeleteStaffTenantMutation = () =>
	useMutation(deleteStaffTenantMutationOptions);

export type BulkStaffTenantActionInput = {
	tenantIds: string[];
};

const buildBulkTenantIdsBody = (tenantIds: string[]) => ({
	tenantIds: createUntypedArray(tenantIds.map((id) => createUntypedString(id))),
});

export const bulkSuspendStaffTenantsMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkSuspendTenantsResult | undefined,
	BulkStaffTenantActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'bulk-suspend'],
		mutationFn: (client, variables) =>
			client.staff.tenants.bulkSuspend.post(
				buildBulkTenantIdsBody(variables.tenantIds),
			),
	},
	{ clientAccessor: getClientManager() },
);

export const bulkReactivateStaffTenantsMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		BulkReactivateTenantsResult | undefined,
		BulkStaffTenantActionInput
	>(
		{
			mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'bulk-reactivate'],
			mutationFn: (client, variables) =>
				client.staff.tenants.bulkReactivate.post(
					buildBulkTenantIdsBody(variables.tenantIds),
				),
		},
		{ clientAccessor: getClientManager() },
	);

export const bulkDeleteStaffTenantsMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkDeleteTenantsResult | undefined,
	BulkStaffTenantActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANTS_QUERY_KEY, 'bulk-delete'],
		mutationFn: (client, variables) =>
			client.staff.tenants.bulkDelete.post(
				buildBulkTenantIdsBody(variables.tenantIds),
			),
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkSuspendStaffTenantsMutation = () =>
	useMutation(bulkSuspendStaffTenantsMutationOptions);

export const useBulkReactivateStaffTenantsMutation = () =>
	useMutation(bulkReactivateStaffTenantsMutationOptions);

export const useBulkDeleteStaffTenantsMutation = () =>
	useMutation(bulkDeleteStaffTenantsMutationOptions);
