import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	FindTenantsAsStaffResponse,
	TenantAsStaffListItem,
} from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

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

const staffTenantsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantsAsStaffResponse,
	StaffTenantsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-tenants'],
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

export const useStaffTenantsQuery = (variables: StaffTenantsQueryVariables) =>
	useQuery({
		queryKey: staffTenantsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantsQueryOptions.fetcher(variables),
	});
