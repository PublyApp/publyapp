import {
	createUntypedArray,
	createUntypedBoolean,
	createUntypedNumber,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import {
	resolveApiFileUrl,
	toRootRelativeApiFileUrl,
} from '~/lib/api-client/resolve-api-file-url';
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
	legalName?: string | null;
	description?: string | null;
	websiteUrl?: string | null;
	billingEmail?: string | null;
	supportEmail?: string | null;
	defaultLocale?: string | null;
	timezone?: string | null;
	notes?: string | null;
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
	ownersCount: number;
	pendingInvitationsCount: number;
	expiringSoonInvitationsCount: number;
	profilesCount: number;
	logoUrl: string | null;
	legalName: string | null;
	description: string | null;
	websiteUrl: string | null;
	billingEmail: string | null;
	supportEmail: string | null;
	defaultLocale: string | null;
	timezone: string | null;
	notes: string | null;
	lastActivityAt: Date | null;
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
	code?: string;
	seedDefaultProfile?: boolean;
	initialUsers: StaffTenantInitialUserInput[];
	logoUrl?: string;
	legalName?: string;
	description?: string;
	websiteUrl?: string;
	billingEmail?: string;
	supportEmail?: string;
	defaultLocale?: string;
	timezone?: string;
	notes?: string;
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

const normalizeNullableFileUrl = (
	value: string | null | undefined,
): string | null => {
	const normalized = normalizeString(value);
	return normalized ? resolveApiFileUrl(normalized) : null;
};

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
		ownersCount: result?.ownersCount ?? 0,
		pendingInvitationsCount: result?.pendingInvitationsCount ?? 0,
		expiringSoonInvitationsCount: result?.expiringSoonInvitationsCount ?? 0,
		profilesCount: result?.profilesCount ?? 0,
		logoUrl: normalizeNullableFileUrl(result?.logoUrl),
		legalName: normalizeNullableString(result?.legalName),
		description: normalizeNullableString(result?.description),
		websiteUrl: normalizeNullableString(result?.websiteUrl),
		billingEmail: normalizeNullableString(result?.billingEmail),
		supportEmail: normalizeNullableString(result?.supportEmail),
		defaultLocale: normalizeNullableString(result?.defaultLocale),
		timezone: normalizeNullableString(result?.timezone),
		notes: normalizeNullableString(result?.notes),
		lastActivityAt: normalizeDate(result?.lastActivityAt),
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

	const code = normalizeString(input.code);
	if (code) {
		body.code = createUntypedString(code) as typeof body.code;
	}

	if (typeof input.seedDefaultProfile === 'boolean') {
		body.seedDefaultProfile = createUntypedBoolean(
			input.seedDefaultProfile,
		) as typeof body.seedDefaultProfile;
	}

	const legalName = normalizeString(input.legalName);
	if (legalName) {
		body.legalName = createUntypedString(legalName) as typeof body.legalName;
	}

	const logoUrl = normalizeString(input.logoUrl);
	if (logoUrl) {
		body.logoUrl = createUntypedString(
			toRootRelativeApiFileUrl(logoUrl),
		) as typeof body.logoUrl;
	}

	const description = normalizeString(input.description);
	if (description) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	}

	const websiteUrl = normalizeString(input.websiteUrl);
	if (websiteUrl) {
		body.websiteUrl = createUntypedString(websiteUrl) as typeof body.websiteUrl;
	}

	const billingEmail = normalizeString(input.billingEmail);
	if (billingEmail) {
		body.billingEmail = createUntypedString(
			billingEmail,
		) as typeof body.billingEmail;
	}

	const supportEmail = normalizeString(input.supportEmail);
	if (supportEmail) {
		body.supportEmail = createUntypedString(
			supportEmail,
		) as typeof body.supportEmail;
	}

	const defaultLocale = normalizeString(input.defaultLocale);
	if (defaultLocale) {
		body.defaultLocale = createUntypedString(
			defaultLocale,
		) as typeof body.defaultLocale;
	}

	const timezone = normalizeString(input.timezone);
	if (timezone) {
		body.timezone = createUntypedString(timezone) as typeof body.timezone;
	}

	const notes = normalizeString(input.notes);
	if (notes) {
		body.notes = createUntypedString(notes) as typeof body.notes;
	}

	return body;
};

export const buildUpdateStaffTenantBody = (
	input: Omit<StaffTenantUpdateInput, 'tenantId'>,
): UpdateTenantAsStaffBody => {
	const body: UpdateTenantAsStaffBody = {};
	const name = normalizeString(input.name);
	const logoUrl = normalizeOptionalUpdateString(input.logoUrl);
	const legalName = normalizeOptionalUpdateString(input.legalName);
	const description = normalizeOptionalUpdateString(input.description);
	const websiteUrl = normalizeOptionalUpdateString(input.websiteUrl);
	const billingEmail = normalizeOptionalUpdateString(input.billingEmail);
	const supportEmail = normalizeOptionalUpdateString(input.supportEmail);
	const defaultLocale = normalizeOptionalUpdateString(input.defaultLocale);
	const timezone = normalizeOptionalUpdateString(input.timezone);
	const notes = normalizeOptionalUpdateString(input.notes);

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
				: (createUntypedString(
						toRootRelativeApiFileUrl(logoUrl),
					) as typeof body.logoUrl);
	}

	if (legalName !== undefined) {
		body.legalName =
			legalName === null
				? null
				: (createUntypedString(legalName) as typeof body.legalName);
	}

	if (description !== undefined) {
		body.description =
			description === null
				? null
				: (createUntypedString(description) as typeof body.description);
	}

	if (websiteUrl !== undefined) {
		body.websiteUrl =
			websiteUrl === null
				? null
				: (createUntypedString(websiteUrl) as typeof body.websiteUrl);
	}

	if (billingEmail !== undefined) {
		body.billingEmail =
			billingEmail === null
				? null
				: (createUntypedString(billingEmail) as typeof body.billingEmail);
	}

	if (supportEmail !== undefined) {
		body.supportEmail =
			supportEmail === null
				? null
				: (createUntypedString(supportEmail) as typeof body.supportEmail);
	}

	if (defaultLocale !== undefined) {
		body.defaultLocale =
			defaultLocale === null
				? null
				: (createUntypedString(defaultLocale) as typeof body.defaultLocale);
	}

	if (timezone !== undefined) {
		body.timezone =
			timezone === null
				? null
				: (createUntypedString(timezone) as typeof body.timezone);
	}

	if (notes !== undefined) {
		body.notes =
			notes === null ? null : (createUntypedString(notes) as typeof body.notes);
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
