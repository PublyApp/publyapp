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
	CreateInvitationForTenantAsStaffBody,
	ApiResponse,
	BulkCreateTenantInvitationsForTenantAsStaffBody,
	BulkCreateTenantInvitationsForTenantAsStaffCreated,
	BulkRemoveTenantUsersBody,
	BulkRemoveTenantUsersResult,
	FindTenantUsersAsStaffResult,
	InvitationCreatedForTenant,
	ReactivateTenantUserResult,
	SuspendTenantUserResult,
	TenantUserDetailsResult,
	TenantUserItem,
	UpdateTenantUserAsStaffBody,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type StaffTenantUsersQueryVariables = {
	tenantId: string;
	q?: string;
	status?: string;
	level?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffTenantUserInvitationInput = {
	tenantId: string;
	email: string;
	accountLevel: 'Admin' | 'User';
};

export type StaffTenantInvitationInput = {
	email: string;
	accountLevel: 'Admin' | 'User';
	profileIds: string[];
};

export type StaffTenantInvitationsBulkCreateInput = {
	tenantId: string;
	invitations: StaffTenantInvitationInput[];
};

export type StaffTenantInvitationBulkCreateFailedItem = {
	index: number | null;
	email: string | null;
	translationKey: string | null;
};

export type StaffTenantInvitationBulkCreateSummary = {
	succeededCount: number;
	failedCount: number;
	failedItems: StaffTenantInvitationBulkCreateFailedItem[];
};

type StaffTenantUserInvitationBodyInput = Omit<
	StaffTenantUserInvitationInput,
	'tenantId' | 'accountLevel'
> & {
	accountLevel?: string;
};

export type StaffTenantUserRow = {
	/** The global `User.Id` — matches `/staff/tenants/{tenantId}/users/{userId}`. Never use
	 * this for tenant-profile membership operations (assign/unassign/resolve); those key by
	 * `userAccountId` below. */
	id: string;
	/** The tenant membership (`UserAccount.Id`) — matches the tenant-profile assign/unassign
	 * toggle route's `{user_account_id}` and the batch resolve-assignment endpoint. Distinct
	 * from `id` above; never use `id` for these operations (step4b-review BLOCKER 1). */
	userAccountId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	level: string | null;
	status: string | null;
	avatarUrl: string | null;
	displayName: string;
};

export type StaffTenantUserDetailsQueryVariables = {
	tenantId: string;
	userId: string;
};

export type StaffTenantUserUpdateInput = {
	tenantId: string;
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
	accountLevel?: string | null;
};

export type StaffTenantUserRemoveInput = {
	tenantId: string;
	userId: string;
};

export type StaffTenantUserBulkRemoveInput = {
	tenantId: string;
	userIds: string[];
};

export type StaffTenantUserBulkActionFailedItem = {
	userId: string | null;
	error: string | null;
};

export type StaffTenantUserBulkActionSummary = {
	succeededCount: number;
	failedCount: number;
	failedItems: StaffTenantUserBulkActionFailedItem[];
};

export type StaffTenantUserExportInput = {
	tenantId: string;
	q?: string;
	status?: string;
	level?: string;
	ids?: string[];
};

export type StaffTenantUserDetails = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	accountLevel: string | null;
	status: string | null;
	avatarUrl: string | null;
	tenantId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	displayName: string;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation key from this; use `invalidateStaffTenantUsers`. */
export const STAFF_TENANT_USERS_QUERY_KEY = ['staff-tenants', 'users'] as const;
export const STAFF_TENANT_USER_DETAILS_QUERY_KEY = [
	...STAFF_TENANT_USERS_QUERY_KEY,
	'detail',
] as const;

/** Invalidates both the tenant-users list and every user's details entry —
 * `STAFF_TENANT_USER_DETAILS_QUERY_KEY` nests under
 * `STAFF_TENANT_USERS_QUERY_KEY`, so a single prefix invalidation covers
 * both (see F19/F16). */
export const invalidateStaffTenantUsers = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_TENANT_USERS_QUERY_KEY),
	});

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

const getDisplayName = ({
	firstName,
	lastName,
	email,
}: Pick<StaffTenantUserRow, 'firstName' | 'lastName' | 'email'>): string => {
	const fullName = getUserFullName({ firstName, lastName });
	return fullName || email;
};

export const buildFindStaffTenantUsersQueryParameters = (
	variables: Omit<StaffTenantUsersQueryVariables, 'tenantId'>,
): {
	q?: string;
	status?: string;
	level?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => ({
	q: normalizeString(variables.q),
	status: normalizeString(variables.status),
	level: normalizeString(variables.level),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const buildCreateStaffTenantUserInvitationBody = (
	input: StaffTenantUserInvitationBodyInput,
): CreateInvitationForTenantAsStaffBody => {
	const body: CreateInvitationForTenantAsStaffBody = {};
	const email = normalizeString(input.email);
	const accountLevel = normalizeString(input.accountLevel);

	if (email) {
		body.email = createUntypedString(email) as typeof body.email;
	}

	if (accountLevel) {
		body.accountLevel = createUntypedString(
			accountLevel,
		) as typeof body.accountLevel;
	}

	return body;
};

export const buildBulkCreateStaffTenantInvitationsBody = (
	invitations: StaffTenantInvitationInput[],
): BulkCreateTenantInvitationsForTenantAsStaffBody => ({
	invitations: createUntypedArray(
		invitations.map((invitation) =>
			createUntypedObject({
				email: createUntypedString(invitation.email.trim()),
				accountLevel: createUntypedString(invitation.accountLevel),
				profileIds: createUntypedArray(
					invitation.profileIds.map((profileId) =>
						createUntypedString(profileId),
					),
				),
			}),
		),
	) as BulkCreateTenantInvitationsForTenantAsStaffBody['invitations'],
});

export const toStaffTenantInvitationBulkCreateSummary = (
	result: BulkCreateTenantInvitationsForTenantAsStaffCreated | null | undefined,
): StaffTenantInvitationBulkCreateSummary => ({
	succeededCount: result?.succeededCount ?? 0,
	failedCount: result?.failedCount ?? 0,
	failedItems: (result?.failedItems ?? []).map((item) => ({
		index:
			typeof item.index === 'number' && Number.isInteger(item.index)
				? item.index
				: null,
		email: normalizeNullableString(item.email),
		translationKey: normalizeNullableString(item.translationKey),
	})),
});

export const buildUpdateStaffTenantUserBody = (
	input: Omit<StaffTenantUserUpdateInput, 'tenantId' | 'userId'>,
): UpdateTenantUserAsStaffBody => {
	const body: UpdateTenantUserAsStaffBody = {};
	const firstName = normalizeUpdateStringField(input.firstName);
	const lastName = normalizeUpdateStringField(input.lastName);
	const avatarUrl = normalizeUpdateStringField(input.avatarUrl);
	const accountLevel = normalizeUpdateStringField(input.accountLevel);

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

	if (accountLevel !== undefined) {
		body.level =
			accountLevel === null
				? null
				: (createUntypedString(accountLevel) as typeof body.level);
	}

	return body;
};

export const buildBulkRemoveStaffTenantUsersBody = (
	userIds: string[],
): BulkRemoveTenantUsersBody => ({
	userIds: createUntypedArray(
		userIds.map((userId) => createUntypedString(userId)),
	) as BulkRemoveTenantUsersBody['userIds'],
});

export const buildExportStaffTenantUsersQueryParameters = (
	variables: Omit<StaffTenantUserExportInput, 'tenantId'>,
): {
	q?: string;
	status?: string;
	level?: string;
	ids?: string;
} => ({
	q: normalizeString(variables.q),
	status: normalizeString(variables.status),
	level: normalizeString(variables.level),
	ids:
		variables.ids && variables.ids.length > 0
			? variables.ids.join(',')
			: undefined,
});

export const toStaffTenantUserBulkActionSummary = (
	result: BulkRemoveTenantUsersResult | null | undefined,
): StaffTenantUserBulkActionSummary => ({
	succeededCount: result?.succeededCount ?? 0,
	failedCount: result?.failedCount ?? 0,
	failedItems: (result?.failedItems ?? []).map((item) => ({
		userId: normalizeNullableString(item.userId?.toString()),
		error: normalizeNullableString(item.errorEscaped),
	})),
});

export const toStaffTenantUserRows = (
	items: TenantUserItem[] | null | undefined,
): StaffTenantUserRow[] => {
	const rows: StaffTenantUserRow[] = [];

	for (const item of items ?? []) {
		// Email is the required fallback identity `getDisplayName` reads when
		// no name is set — dropped rather than shown with a `'—'` placeholder
		// a staff admin can't distinguish from a legitimate value
		// (shell-r5-F3). A row missing either id is equally malformed — dropped
		// rather than silently mixing up identity domains (step4b-review
		// BLOCKER 1).
		const id = normalizeString(item.id?.toString());
		const userAccountId = normalizeString(item.userAccountId?.toString());
		const email = normalizeString(item.email);
		if (!id || !userAccountId || !email) {
			continue;
		}

		const firstName = normalizeNullableString(item.firstName);
		const lastName = normalizeNullableString(item.lastName);

		rows.push({
			id,
			userAccountId,
			firstName,
			lastName,
			email,
			level: normalizeNullableString(item.level),
			status: normalizeNullableString(item.status),
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			displayName: getDisplayName({ firstName, lastName, email }),
		});
	}

	return rows;
};

export const toStaffTenantUserDetails = (
	result: TenantUserDetailsResult | null | undefined,
): StaffTenantUserDetails | null => {
	const id = normalizeString(result?.id?.toString());
	const email = normalizeString(result?.email);

	// A malformed payload (missing the required identity) is treated the same
	// as "not found" — never rendered with a `'—'` placeholder a staff admin
	// can't distinguish from a legitimate value (shell-r5-F3).
	if (!id || !email) {
		return null;
	}

	return {
		id,
		email,
		firstName: normalizeNullableString(result?.firstName),
		lastName: normalizeNullableString(result?.lastName),
		accountLevel: normalizeNullableString(result?.level),
		status: normalizeNullableString(result?.status),
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		tenantId: normalizeNullableString(result?.tenantId?.toString()),
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		displayName: getDisplayName({
			firstName: normalizeNullableString(result?.firstName),
			lastName: normalizeNullableString(result?.lastName),
			email,
		}),
	};
};

const staffTenantUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantUsersAsStaffResult,
	StaffTenantUsersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.get({
					queryParameters: buildFindStaffTenantUsersQueryParameters(variables),
				});

			if (!result) {
				throw new Error('staff tenant users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const createStaffTenantUserInvitationMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		InvitationCreatedForTenant | undefined,
		StaffTenantUserInvitationInput
	>(
		{
			mutationKeyFn: () => ['staff-tenants', 'users', 'invitations'],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.users.invitations.post(
						buildCreateStaffTenantUserInvitationBody({
							email: variables.email,
							accountLevel: variables.accountLevel,
						}),
					),
			meta: {
				successMessage: 'invitation-sent-success',
				validationHandledByForm: true,
			},
		},
		{ clientAccessor: getClientManager() },
	);

export const bulkCreateStaffTenantInvitationsMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		BulkCreateTenantInvitationsForTenantAsStaffCreated | undefined,
		StaffTenantInvitationsBulkCreateInput
	>(
		{
			mutationKeyFn: () => [
				'staff-tenants',
				'users',
				'invitations',
				'bulk-create',
			],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.users.invitations.bulk.post(
						buildBulkCreateStaffTenantInvitationsBody(variables.invitations),
					),
			meta: {
				silentSuccess: true,
				skipGlobalErrorHandler: true,
				validationHandledByForm: true,
			},
		},
		{ clientAccessor: getClientManager() },
	);

export const staffTenantUserDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	TenantUserDetailsResult,
	StaffTenantUserDetailsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_USER_DETAILS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.get();

			if (!result) {
				throw new Error('staff tenant user details result was empty');
			}

			return result as TenantUserDetailsResult;
		},
	},
	{ clientAccessor: getClientManager() },
);

const updateStaffTenantUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	TenantUserDetailsResult | undefined,
	StaffTenantUserUpdateInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'update'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.patch(buildUpdateStaffTenantUserBody(variables)),
		meta: {
			successMessage: 'tenant-user-updated-success',
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

const suspendTenantUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	SuspendTenantUserResult | undefined,
	{
		tenantId: string;
		userId: string;
	}
>(
	{
		mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'suspend'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.suspend.post(),
		meta: { successMessage: 'tenant-user-suspended-success' },
	},
	{ clientAccessor: getClientManager() },
);

const reactivateTenantUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ReactivateTenantUserResult | undefined,
	{
		tenantId: string;
		userId: string;
	}
>(
	{
		mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'reactivate'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.reactivate.post(),
		meta: { successMessage: 'tenant-user-reactivated-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const removeStaffTenantUserMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffTenantUserRemoveInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'remove'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.delete(),
		meta: { successMessage: 'tenant-user-removed-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const bulkRemoveStaffTenantUsersMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		BulkRemoveTenantUsersResult | undefined,
		StaffTenantUserBulkRemoveInput
	>(
		{
			mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'bulk-remove'],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.users.bulkRemove.post(
						buildBulkRemoveStaffTenantUsersBody(variables.userIds),
					),
			meta: { silentSuccess: true, skipGlobalErrorHandler: true },
		},
		{ clientAccessor: getClientManager() },
	);

export const exportStaffTenantUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ArrayBuffer | undefined,
	StaffTenantUserExportInput
>(
	{
		mutationKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY, 'export'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.exportEscaped.get({
					queryParameters:
						buildExportStaffTenantUsersQueryParameters(variables),
				}),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkRemoveStaffTenantUsersMutation = () =>
	useMutation(bulkRemoveStaffTenantUsersMutationOptions);

export const useExportStaffTenantUsersMutation = () =>
	useMutation(exportStaffTenantUsersMutationOptions);

export const useStaffTenantUsersQuery = (
	variables: StaffTenantUsersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantUsersQueryOptions.queryKey(variables),
		queryFn: () => staffTenantUsersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useStaffTenantUserDetailsQuery = (
	variables: StaffTenantUserDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantUserDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantUserDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the tenant-user
 * detail route — same query key as `useStaffTenantUserDetailsQuery`, so
 * TanStack Query dedupes and a cached name paints the crumb instantly.
 */
export const staffTenantUserCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffTenantUserDetailsQueryOptions.queryKey({
		tenantId: params.tenantId,
		userId: params.userId,
	}),
	queryFn: () =>
		staffTenantUserDetailsQueryOptions.fetcher({
			tenantId: params.tenantId,
			userId: params.userId,
		}),
});

export const selectStaffTenantUserCrumbName = (
	data: unknown,
): string | undefined =>
	toStaffTenantUserDetails(data as TenantUserDetailsResult | null | undefined)
		?.displayName;

export const useInviteTenantUserMutation = () =>
	useMutation(createStaffTenantUserInvitationMutationOptions);

export const useBulkInviteTenantUsersMutation = () =>
	useMutation(bulkCreateStaffTenantInvitationsMutationOptions);

export const useUpdateStaffTenantUserMutation = () =>
	useMutation(updateStaffTenantUserMutationOptions);

export const useSuspendStaffTenantUserMutation = () =>
	useMutation(suspendTenantUserMutationOptions);

export const useReactivateStaffTenantUserMutation = () =>
	useMutation(reactivateTenantUserMutationOptions);

export const useRemoveStaffTenantUserMutation = () =>
	useMutation(removeStaffTenantUserMutationOptions);
