import {
	createUntypedArray,
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
	ApiResponse,
	BulkStaffUserActionResult,
	FindStaffUsersResponse,
	GetStaffUserByIdResult,
	GetStaffUserProfilesResult,
	StaffUserItem,
	UpdateStaffUserBody,
	UserStatus,
	UpdateStaffUserEmailBody,
	UpdateStaffUserProfilesBody,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type StaffUsersQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffUserDetailsQueryVariables = {
	userId: string;
};

export type StaffUserProfilesQueryVariables = {
	userId: string;
};

export type StaffUserRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	level: AccountLevel | null;
	status: UserStatus | null;
	displayName: string;
};

export type AssignedStaffProfile = {
	id: string;
	name: string | undefined;
	description: string | null;
};

export type StaffUserDetails = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	accountLevel: string | null;
	status: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	displayName: string;
};

export type StaffUserUpdateInput = {
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
	accountLevel?: string | null;
};

export type StaffUserEmailUpdateInput = {
	userId: string;
	email?: string | null;
};

export type StaffUserProfilesUpdateInput = {
	userId: string;
	profileIds: string[];
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this (review-r3-users-auth.md F11); use
 * `invalidateStaffUsers` / `removeStaffUserDetails`, never hand-assemble a
 * prefixed key at a call site. */
export const STAFF_USERS_QUERY_KEY = ['staff-users'] as const;
const STAFF_USER_DETAILS_QUERY_KEY = [
	...STAFF_USERS_QUERY_KEY,
	'detail',
] as const;
const STAFF_USER_PROFILES_QUERY_KEY = [
	...STAFF_USER_DETAILS_QUERY_KEY,
	'profiles',
] as const;

/** Invalidates the staff-users list, every user's details entry, and its
 * assigned-profiles entry — both nest under `STAFF_USERS_QUERY_KEY`, so a
 * single prefix invalidation covers all three (see F19/F16). */
export const invalidateStaffUsers = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_USERS_QUERY_KEY),
	});

/** Removes a single deleted user's details entry from the cache outright
 * (rather than just invalidating it) so a stale details fetch can't race the
 * navigation away from its now-404 route (review-r3-users-auth.md F11). */
export const removeStaffUserDetails = (queryClient: QueryClient) =>
	queryClient.removeQueries({
		queryKey: scopedKey('staff', STAFF_USER_DETAILS_QUERY_KEY),
	});

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
): string | null => normalizeString(value) ?? null;

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
}: {
	firstName: string | null;
	lastName: string | null;
	email: string;
}): string => {
	const fullName = getUserFullName({
		firstName,
		lastName,
	});
	return fullName || email;
};

export const buildFindStaffUsersQueryParameters = (
	variables: StaffUsersQueryVariables,
) => {
	return {
		q: normalizeString(variables.q),
		sortId: normalizeString(variables.sortId),
		sortOrder: variables.sortOrder,
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.size)
			? String(variables.size)
			: undefined,
	};
};

export const toStaffUserRows = (
	items: StaffUserItem[] | null | undefined,
): StaffUserRow[] => {
	const rows: StaffUserRow[] = [];

	for (const item of items ?? []) {
		// Email is the required fallback identity `getDisplayName` reads when
		// no name is set — dropped rather than shown with a `'—'` placeholder
		// a staff admin can't distinguish from a legitimate value
		// (shell-r5-F3).
		const id = normalizeString(item.id ?? undefined);
		const email = normalizeString(item.email);
		if (!id || !email) {
			continue;
		}

		const firstName = normalizeNullableString(item.firstName);
		const lastName = normalizeNullableString(item.lastName);

		rows.push({
			id,
			email,
			firstName,
			lastName,
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			level: item.level ?? null,
			status: item.status ?? null,
			displayName: getDisplayName({ firstName, lastName, email }),
		});
	}

	return rows;
};

export const toStaffUserDetails = (
	result: GetStaffUserByIdResult | null | undefined,
): StaffUserDetails | null => {
	const id = normalizeString(result?.id ?? undefined);
	const email = normalizeString(result?.email);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder a staff admin
	// can't distinguish from a legitimate value (shell-r5-F3).
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
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		accountLevel: result?.accountLevel ?? null,
		status: result?.status ?? null,
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		displayName: getDisplayName({ firstName, lastName, email }),
	};
};

export const toAssignedStaffProfiles = (
	result: GetStaffUserProfilesResult | null | undefined,
): AssignedStaffProfile[] => {
	const profiles: AssignedStaffProfile[] = [];

	for (const item of result?.assignedProfiles ?? []) {
		const id = normalizeString(
			typeof item.id === 'string' ? item.id : undefined,
		);

		if (!id) {
			continue;
		}

		profiles.push({
			id,
			name: normalizeString(item.name),
			description: normalizeNullableString(item.description),
		});
	}

	return profiles;
};

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
	if (trimmed.length > 0) return trimmed;
	return null;
};

const buildUpdateStaffUserBody = (
	input: StaffUserUpdateInput,
): Partial<UpdateStaffUserBody> => {
	const body: Partial<UpdateStaffUserBody> = {};
	const firstName = normalizeUpdateStringField(input.firstName);
	const lastName = normalizeUpdateStringField(input.lastName);
	const avatarUrl = normalizeUpdateStringField(input.avatarUrl);
	const accountLevel = normalizeUpdateStringField(input.accountLevel);

	if (firstName !== undefined) {
		body.firstName = firstName === null ? null : createUntypedString(firstName);
	}

	if (lastName !== undefined) {
		body.lastName = lastName === null ? null : createUntypedString(lastName);
	}

	if (avatarUrl !== undefined) {
		body.avatarUrl =
			avatarUrl === null
				? null
				: createUntypedString(toRootRelativeApiFileUrl(avatarUrl));
	}

	if (accountLevel !== undefined) {
		body.accountLevel =
			accountLevel === null
				? null
				: (createUntypedString(
						accountLevel,
					) as UpdateStaffUserBody['accountLevel']);
	}

	return body;
};

const buildUpdateStaffUserEmailBody = (
	email: string | null,
): UpdateStaffUserEmailBody => ({
	email: email === null ? null : createUntypedString(email),
});

const buildUpdateStaffUserProfilesBody = (
	input: StaffUserProfilesUpdateInput,
): UpdateStaffUserProfilesBody => ({
	profileIds: createUntypedArray(
		input.profileIds.map((profileId) => createUntypedString(profileId)),
	),
});

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	StaffUsersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_USERS_QUERY_KEY],
		fetcher: async (client, vars) => {
			const result = await client.staff.users.get({
				queryParameters: buildFindStaffUsersQueryParameters(vars),
			});

			if (!result) {
				throw new Error('staff users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffUserDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetStaffUserByIdResult,
	StaffUserDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_USER_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.users.byUserId(variables.userId).get();

			if (!result) {
				throw new Error('staff user details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffUserProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetStaffUserProfilesResult,
	StaffUserProfilesQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_USER_PROFILES_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.users
				.byUserId(variables.userId)
				.profiles.get();

			if (!result) {
				throw new Error('staff user profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffUserByIdResult | undefined,
	StaffUserUpdateInput
>(
	{
		mutationKeyFn: () => ['staff-users', 'update'],
		mutationFn: (client, variables) =>
			client.staff.users
				.byUserId(variables.userId)
				.patch(buildUpdateStaffUserBody(variables)),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffUserEmailMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffUserByIdResult | undefined,
	StaffUserEmailUpdateInput
>(
	{
		mutationKeyFn: () => ['staff-users', 'update-email'],
		mutationFn: (client, variables) =>
			client.staff.users
				.byUserId(variables.userId)
				.email.patch(
					buildUpdateStaffUserEmailBody(
						normalizeUpdateStringField(variables.email) ?? null,
					),
				),
		meta: {
			successMessage: 'staff-user-email-updated-success',
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffUserProfilesMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffUserByIdResult | undefined,
	StaffUserProfilesUpdateInput
>(
	{
		mutationKeyFn: () => ['staff-users', 'update-profiles'],
		mutationFn: (client, variables) =>
			client.staff.users
				.byUserId(variables.userId)
				.profiles.put(buildUpdateStaffUserProfilesBody(variables)),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const suspendStaffUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffUserByIdResult | undefined,
	StaffUserDetailsQueryVariables
>(
	{
		mutationKeyFn: () => ['staff-users', 'suspend'],
		mutationFn: (client, variables) =>
			client.staff.users.byUserId(variables.userId).suspend.post(),
		meta: { successMessage: 'staff-user-suspended-success' },
	},
	{ clientAccessor: getClientManager() },
);

const reactivateStaffUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffUserByIdResult | undefined,
	StaffUserDetailsQueryVariables
>(
	{
		mutationKeyFn: () => ['staff-users', 'reactivate'],
		mutationFn: (client, variables) =>
			client.staff.users.byUserId(variables.userId).reactivate.post(),
		meta: { successMessage: 'staff-user-reactivated-success' },
	},
	{ clientAccessor: getClientManager() },
);

const deleteStaffUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffUserDetailsQueryVariables
>(
	{
		mutationKeyFn: () => ['staff-users', 'delete'],
		mutationFn: (client, variables) =>
			client.staff.users.byUserId(variables.userId).delete(),
		meta: { successMessage: 'staff-user-deleted-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffUsersQuery = (variables: StaffUsersQueryVariables) =>
	useQuery({
		queryKey: staffUsersQueryOptions.queryKey(variables),
		queryFn: () => staffUsersQueryOptions.fetcher(variables),
	});

export const useStaffUserDetailsQuery = (
	variables: StaffUserDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffUserDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffUserDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the staff-user
 * detail route — same query key as `useStaffUserDetailsQuery`, so TanStack
 * Query dedupes and a cached name paints the crumb instantly.
 */
export const staffUserCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffUserDetailsQueryOptions.queryKey({ userId: params.userId }),
	queryFn: () =>
		staffUserDetailsQueryOptions.fetcher({ userId: params.userId }),
});

export const selectStaffUserCrumbName = (data: unknown): string | undefined =>
	toStaffUserDetails(data as GetStaffUserByIdResult | null | undefined)
		?.displayName;

export const useStaffUserProfilesQuery = (
	variables: StaffUserProfilesQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffUserProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffUserProfilesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useUpdateStaffUserMutation = () =>
	useMutation(updateStaffUserMutationOptions);

export const useUpdateStaffUserEmailMutation = () =>
	useMutation(updateStaffUserEmailMutationOptions);

export const useUpdateStaffUserProfilesMutation = () =>
	useMutation(updateStaffUserProfilesMutationOptions);

export const useSuspendStaffUserMutation = () =>
	useMutation(suspendStaffUserMutationOptions);

export const useReactivateStaffUserMutation = () =>
	useMutation(reactivateStaffUserMutationOptions);

export const useDeleteStaffUserMutation = () =>
	useMutation(deleteStaffUserMutationOptions);

export type BulkStaffUserActionInput = {
	userIds: string[];
};

const buildBulkStaffUserIdsBody = (userIds: string[]) => ({
	userIds: createUntypedArray(userIds.map((id) => createUntypedString(id))),
});

const bulkSuspendStaffUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffUserActionResult | undefined,
	BulkStaffUserActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_USERS_QUERY_KEY, 'bulk-suspend'],
		mutationFn: (client, variables) =>
			client.staff.users.bulkSuspend.post(
				buildBulkStaffUserIdsBody(variables.userIds),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const bulkReactivateStaffUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffUserActionResult | undefined,
	BulkStaffUserActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_USERS_QUERY_KEY, 'bulk-reactivate'],
		mutationFn: (client, variables) =>
			client.staff.users.bulkReactivate.post(
				buildBulkStaffUserIdsBody(variables.userIds),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const bulkDeleteStaffUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffUserActionResult | undefined,
	BulkStaffUserActionInput
>(
	{
		mutationKeyFn: () => [...STAFF_USERS_QUERY_KEY, 'bulk-delete'],
		mutationFn: (client, variables) =>
			client.staff.users.bulkDelete.post(
				buildBulkStaffUserIdsBody(variables.userIds),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkSuspendStaffUsersMutation = () =>
	useMutation(bulkSuspendStaffUsersMutationOptions);

export const useBulkReactivateStaffUsersMutation = () =>
	useMutation(bulkReactivateStaffUsersMutationOptions);

export const useBulkDeleteStaffUsersMutation = () =>
	useMutation(bulkDeleteStaffUsersMutationOptions);
