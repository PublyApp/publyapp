import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	FindTenantProfilesAsStaffResult,
	TenantProfileItem,
} from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffTenantProfilesQueryVariables = {
	tenantId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffTenantProfileRow = {
	id: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	userAccountCount: number;
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

const staffTenantProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantProfilesAsStaffResult,
	StaffTenantProfilesQueryVariables
>(
	{
		queryKeyFn: () => ['staff-tenants', 'profiles'],
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
