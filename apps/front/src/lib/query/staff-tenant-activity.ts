import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	AuditLogListItem,
	FindTenantActivityForStaffResponse,
} from '@org/client-ts/models/index';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type TenantActivityQueryVariables = {
	tenantId: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type TenantActivityRow = {
	id: string;
	action: string | null;
	userName: string | null;
	userEmail: string | null;
	ipAddress: string | null;
	targetId: string | null;
	createdAt: Date | null;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this. */
export const STAFF_TENANT_ACTIVITY_QUERY_KEY = [
	'staff-tenant-activity',
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

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

type TenantActivityQueryParameters = {
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
};

export const buildTenantActivityQueryParameters = (
	variables: TenantActivityQueryVariables,
): TenantActivityQueryParameters => ({
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toTenantActivityRows = (
	items: AuditLogListItem[] | null | undefined,
): TenantActivityRow[] => {
	const rows: TenantActivityRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			action: normalizeNullableString(item.action),
			userName: normalizeNullableString(item.userName),
			userEmail: normalizeNullableString(item.userEmail),
			ipAddress: normalizeNullableString(item.ipAddress),
			targetId: normalizeNullableString(item.targetId),
			createdAt: normalizeDate(item.createdAt),
		});
	}

	return rows;
};

export const tenantActivityQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantActivityForStaffResponse,
	TenantActivityQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_ACTIVITY_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.activity.get({
					queryParameters: buildTenantActivityQueryParameters(variables),
				});

			if (!result) {
				throw new Error('tenant activity result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useTenantActivityQuery = (
	variables: TenantActivityQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: tenantActivityQueryOptions.queryKey(variables),
		queryFn: () => tenantActivityQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});
