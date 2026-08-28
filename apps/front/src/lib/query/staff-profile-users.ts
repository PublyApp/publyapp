import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeNullableFileUrl } from '~/lib/api-client/resolve-api-file-url';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	BulkStaffProfileUserUnassignActionResult,
	FindStaffProfileUsersResult,
	UserStatus,
	StaffProfileUserItem,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffProfileUsersQueryVariables = {
	profileId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	pageIndex?: number;
	size?: number;
};

export type StaffProfileUserRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	status: UserStatus | null;
};

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => {
	return normalizeString(value) ?? null;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const normalizePageIndex = (value: number | undefined): number => {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
		return value;
	}
	return 0;
};

export const toStaffProfileUserRows = (
	items: StaffProfileUserItem[] | null | undefined,
): StaffProfileUserRow[] => {
	const rows: StaffProfileUserRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			email: normalizeString(item.email) ?? '',
			firstName: normalizeNullableString(item.firstName),
			lastName: normalizeNullableString(item.lastName),
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			status: item.status ?? null,
		});
	}

	return rows;
};

export const buildStaffProfileUsersRequestQuery = (
	variables: Omit<StaffProfileUsersQueryVariables, 'profileId'>,
) => {
	return {
		q: normalizeString(variables.q),
		sortId: normalizeString(variables.sortId),
		sortOrder: variables.sortOrder,
		page: String(normalizePageIndex(variables.pageIndex) + 1),
		limit: isPositiveSafeInteger(variables.size)
			? String(variables.size)
			: undefined,
	};
};

const staffProfileUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfileUsersResult,
	StaffProfileUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles', 'users'],
		fetcher: async (client, variables) => {
			const result = await client.staff.profiles
				.byProfileId(variables.profileId)
				.users.get({
					queryParameters: buildStaffProfileUsersRequestQuery(variables),
				});

			if (!result) {
				throw new Error('staff profile users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffProfileUsersQuery = (
	variables: StaffProfileUsersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffProfileUsersQueryOptions.queryKey(variables),
		queryFn: () => staffProfileUsersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

// Invalidates the nested profile-users list family (['staff', 'staff-profiles',
// 'users', …]) — the unassign mutation changes which rows appear in this list,
// so it MUST cover the list family (and, through the same prefix, the nested
// row's line). This is the "Mutation Invalidation Coherence" (#359) requirement
// for a list-membership mutation; see the guard test for the coverage proof.
export const invalidateStaffProfileUsers = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', ['staff-profiles', 'users']),
	});

export type BulkUnassignStaffProfileUsersInput = {
	profileId: string;
	userIds: string[];
};

const bulkUnassignStaffProfileUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffProfileUserUnassignActionResult | undefined,
	BulkUnassignStaffProfileUsersInput
>(
	{
		mutationKeyFn: () => ['staff-profiles', 'bulk-unassign-users'],
		mutationFn: (client, variables) =>
			client.staff.profiles
				.byProfileId(variables.profileId)
				.users.unassign.post({
					userIds: createUntypedArray(
						variables.userIds.map((id) => createUntypedString(id)),
					),
				}),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkUnassignStaffProfileUsersMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		...bulkUnassignStaffProfileUsersMutationOptions,
		onSuccess: () => {
			void invalidateStaffProfileUsers(queryClient);
		},
	});
};
