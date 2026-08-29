import {
	createUntypedArray,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import {
	normalizeNullableFileUrl,
	toRootRelativeApiFileUrl,
} from '~/lib/api-client/resolve-api-file-url';
import type { EntityCrumbQuery } from '~/lib/navigation/breadcrumbs';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	AccountLevel,
	AssignTenantUserCompaniesForStaffBody,
	FindTenantUserCompaniesForStaffResult,
	FindTenantsAsStaffResponse,
	TenantUserCompanyBulkActionResult,
	TenantUserDetailsForStaffResult,
	TenantUserStatus,
	UpdateTenantUserIdentityForStaffBody,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

/**
 * Query seam for the GLOBAL (tenant-scope-free) staff tenant-user surface:
 * `/staff/tenant-users/{userId}` + `/companies`. Distinct from the
 * tenant-scoped `staff-tenant-users.ts` seam, which keys everything under a
 * `{ tenantId }` — this user's identity exists across tenants, so neither
 * the details query nor its cache keys may carry one.
 */

export type GlobalTenantUserDetailsQueryVariables = {
	userId: string;
};

export type GlobalTenantUserIdentityUpdateInput = {
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
};

export type GlobalTenantUserCompaniesQueryVariables = {
	userId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type GlobalTenantUserCompaniesLinkInput = {
	userId: string;
	tenantIds: string[];
	level: 'Admin' | 'User';
};

export type GlobalTenantUserCompaniesBulkUnlinkInput = {
	userId: string;
	tenantIds: string[];
};

export type GlobalTenantUsersPickerQueryVariables = {
	q?: string;
	size?: number;
};

export type GlobalTenantUserDetails = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	status: string | null;
	avatarUrl: string | null;
	companyCount: number;
	createdAt: Date | null;
	updatedAt: Date | null;
	displayName: string;
};

export type GlobalTenantUserCompanyRow = {
	/** The tenant (`Tenant.Id`) — the row's entity id and bulk-action key. */
	id: string;
	name: string;
	logoUrl: string | null;
	level: AccountLevel | null;
	status: TenantUserStatus | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

export type GlobalTenantUserBulkUnlinkSummary = {
	succeededCount: number;
	failedCount: number;
	failedItems: Array<{
		tenantId: string | null;
		error: string | null;
	}>;
};

export type TenantPickerOption = {
	id: string;
	name: string;
	logoUrl: string | null;
	status: string | null;
};

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

const normalizeUpdateStringField = (
	value: string | null | undefined,
): string | null | undefined => {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const getDisplayName = ({
	firstName,
	lastName,
	email,
}: Pick<
	GlobalTenantUserDetails,
	'firstName' | 'lastName' | 'email'
>): string => {
	const fullName = getUserFullName({ firstName, lastName });
	return fullName || email;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation key from this; use `invalidateGlobalTenantUsers`. */
export const GLOBAL_TENANT_USERS_QUERY_KEY = [
	'staff-global-tenant-users',
] as const;

/** Invalidates every global tenant-user query (details, companies, picker). */
export const invalidateGlobalTenantUsers = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', GLOBAL_TENANT_USERS_QUERY_KEY),
	});

export const globalTenantUserDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	TenantUserDetailsForStaffResult,
	GlobalTenantUserDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...GLOBAL_TENANT_USERS_QUERY_KEY, 'detail'],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenantUsers
				.byUserId(variables.userId)
				.get();

			if (!result) {
				throw new Error('global tenant user details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateGlobalTenantUserIdentityMutationOptions = buildStaffMutationOptions<
	ApiClient,
	TenantUserDetailsForStaffResult | undefined,
	GlobalTenantUserIdentityUpdateInput
>(
	{
		mutationKeyFn: () => [...GLOBAL_TENANT_USERS_QUERY_KEY, 'update'],
		mutationFn: (client, variables) => {
			const body: UpdateTenantUserIdentityForStaffBody = {};
			const firstName = normalizeUpdateStringField(variables.firstName);
			const lastName = normalizeUpdateStringField(variables.lastName);
			const avatarUrl = normalizeUpdateStringField(variables.avatarUrl);

			if (firstName !== undefined) {
				body.firstName =
					firstName === null
						? null
						: (createUntypedString(firstName) as typeof body.firstName);
			}

			if (lastName !== undefined) {
				body.lastName =
					lastName === null
						? null
						: (createUntypedString(lastName) as typeof body.lastName);
			}

			if (avatarUrl !== undefined) {
				body.avatarUrl =
					avatarUrl === null
						? null
						: (createUntypedString(
								toRootRelativeApiFileUrl(avatarUrl),
							) as typeof body.avatarUrl);
			}

			return client.staff.tenantUsers.byUserId(variables.userId).patch(body);
		},
		meta: {
			successMessage: 'tenant-user-updated-success',
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const globalTenantUserCompaniesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantUserCompaniesForStaffResult,
	GlobalTenantUserCompaniesQueryVariables
>(
	{
		queryKeyFn: () => [...GLOBAL_TENANT_USERS_QUERY_KEY, 'companies'],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenantUsers
				.byUserId(variables.userId)
				.companies.get({
					queryParameters: {
						q: normalizeString(variables.q),
						sortId: normalizeString(variables.sortId),
						sortOrder: variables.sortOrder,
						cursor: normalizeString(variables.cursor),
						limit: isPositiveSafeInteger(variables.size)
							? String(variables.size)
							: undefined,
					},
				});

			if (!result) {
				throw new Error('global tenant user companies result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

/**
 * Kiota's untyped request builders only accept `Untyped*` nodes, so the
 * wire-shape call site names the target type once here instead of widening
 * and re-asserting inline.
 */
function buildAssignCompaniesBody(
	variables: GlobalTenantUserCompaniesLinkInput,
): AssignTenantUserCompaniesForStaffBody {
	return createUntypedObject({
		level: createUntypedString(variables.level),
		tenantIds: createUntypedArray(
			variables.tenantIds.map((tenantId) => createUntypedString(tenantId)),
		),
	}) as AssignTenantUserCompaniesForStaffBody;
}

const linkGlobalTenantUserCompaniesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	TenantUserCompanyBulkActionResult | undefined,
	GlobalTenantUserCompaniesLinkInput
>(
	{
		mutationKeyFn: () => [
			...GLOBAL_TENANT_USERS_QUERY_KEY,
			'companies',
			'link',
		],
		mutationFn: async (client, variables) => {
			return client.staff.tenantUsers
				.byUserId(variables.userId)
				.companies.post(buildAssignCompaniesBody(variables));
		},
		meta: {
			silentSuccess: true,
			skipGlobalErrorHandler: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const bulkUnlinkGlobalTenantUserCompaniesMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		TenantUserCompanyBulkActionResult | undefined,
		GlobalTenantUserCompaniesBulkUnlinkInput
	>(
		{
			mutationKeyFn: () => [
				...GLOBAL_TENANT_USERS_QUERY_KEY,
				'companies',
				'bulk-unlink',
			],
			mutationFn: (client, variables) =>
				client.staff.tenantUsers
					.byUserId(variables.userId)
					.companies.bulkRemove.post({
						tenantIds: createUntypedArray(
							variables.tenantIds.map((tenantId) =>
								createUntypedString(tenantId),
							),
						),
					}),
			meta: {
				silentSuccess: true,
				skipGlobalErrorHandler: true,
			},
		},
		{ clientAccessor: getClientManager() },
	);

const globalTenantUsersPickerQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantsAsStaffResponse,
	GlobalTenantUsersPickerQueryVariables
>(
	{
		queryKeyFn: () => [...GLOBAL_TENANT_USERS_QUERY_KEY, 'tenant-picker'],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants.get({
				queryParameters: {
					q: normalizeString(variables.q),
					limit: isPositiveSafeInteger(variables.size)
						? String(variables.size)
						: undefined,
				},
			});

			if (!result) {
				throw new Error('tenant picker result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const toGlobalTenantUserDetails = (
	result: TenantUserDetailsForStaffResult | null | undefined,
): GlobalTenantUserDetails | null => {
	const id = normalizeString(result?.id?.toString());
	const email = normalizeString(result?.email);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder a staff admin
	// can't distinguish from a legitimate value.
	if (!id || !email) {
		return null;
	}

	const firstName = normalizeNullableString(result?.firstName);
	const lastName = normalizeNullableString(result?.lastName);

	return {
		id,
		email,
		firstName,
		lastName,
		status: normalizeNullableString(result?.status),
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		companyCount:
			typeof result?.companyCount === 'number' ? result.companyCount : 0,
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		displayName: getDisplayName({ firstName, lastName, email }),
	};
};

export const toGlobalTenantUserCompanyRows = (
	items: FindTenantUserCompaniesForStaffResult['data'] | null | undefined,
): GlobalTenantUserCompanyRow[] => {
	const rows: GlobalTenantUserCompanyRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.tenantId?.toString());
		const name = normalizeString(item.tenantName);

		// A company membership without its tenant identity cannot be rendered
		// or acted on — dropped rather than shown as a blank row.
		if (!id || !name) {
			continue;
		}

		rows.push({
			id,
			name,
			logoUrl: normalizeNullableFileUrl(item.tenantLogoUrl),
			level: item.level ?? null,
			status: item.status ?? null,
			createdAt: normalizeDate(item.createdAt),
			updatedAt: normalizeDate(item.updatedAt),
		});
	}

	return rows;
};

export const toGlobalTenantUserBulkUnlinkSummary = (
	result: TenantUserCompanyBulkActionResult | null | undefined,
): GlobalTenantUserBulkUnlinkSummary => ({
	succeededCount: result?.succeededCount ?? 0,
	failedCount: result?.failedCount ?? 0,
	failedItems: (result?.failedItems ?? []).map((item) => ({
		tenantId: normalizeNullableString(item.tenantId?.toString()),
		error: normalizeNullableString(item.errorEscaped),
	})),
});

export const toTenantPickerOptions = (
	data: FindTenantsAsStaffResponse | null | undefined,
): TenantPickerOption[] => {
	const options: TenantPickerOption[] = [];

	for (const item of data?.data ?? []) {
		const id = normalizeString(item.id?.toString());
		const name = normalizeString(item.name);
		if (!id || !name) {
			continue;
		}

		options.push({
			id,
			name,
			logoUrl: normalizeNullableFileUrl(item.logoUrl),
			status: normalizeNullableString(item.status),
		});
	}

	return options;
};

export const useGlobalTenantUserDetailsQuery = (
	variables: GlobalTenantUserDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: globalTenantUserDetailsQueryOptions.queryKey(variables),
		queryFn: () => globalTenantUserDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useUpdateGlobalTenantUserIdentityMutation = () =>
	useMutation(updateGlobalTenantUserIdentityMutationOptions);

export const useGlobalTenantUserCompaniesQuery = (
	variables: GlobalTenantUserCompaniesQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: globalTenantUserCompaniesQueryOptions.queryKey(variables),
		queryFn: () => globalTenantUserCompaniesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useLinkGlobalTenantUserCompaniesMutation = () =>
	useMutation(linkGlobalTenantUserCompaniesMutationOptions);

export const useBulkUnlinkGlobalTenantUserCompaniesMutation = () =>
	useMutation(bulkUnlinkGlobalTenantUserCompaniesMutationOptions);

export const useGlobalTenantUsersPickerQuery = (
	variables: GlobalTenantUsersPickerQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: globalTenantUsersPickerQueryOptions.queryKey(variables),
		queryFn: () => globalTenantUsersPickerQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the global
 * tenant-user detail routes — same query key as
 * `useGlobalTenantUserDetailsQuery`, so TanStack Query dedupes and a cached
 * name paints the crumb instantly.
 */
export const globalTenantUserCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: globalTenantUserDetailsQueryOptions.queryKey({
		userId: params.userId,
	}),
	queryFn: () =>
		globalTenantUserDetailsQueryOptions.fetcher({
			userId: params.userId,
		}),
});

export const selectGlobalTenantUserCrumbName = (
	data: unknown,
): string | undefined =>
	toGlobalTenantUserDetails(
		data as TenantUserDetailsForStaffResult | null | undefined,
	)?.displayName;
