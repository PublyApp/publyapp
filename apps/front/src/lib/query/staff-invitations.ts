import {
	createUntypedArray,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { EntityCrumbQuery } from '~/lib/navigation/breadcrumbs';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	ApiResponse,
	BulkCreateStaffInvitationsBody,
	BulkRevokeStaffInvitationsBody,
	BulkStaffInvitationActionResult,
	BulkStaffInvitationsCreated,
	FindStaffInvitationsResult,
	GetStaffInvitationLinkResult,
	StaffInvitationDetails,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation key from this; use `invalidateStaffInvitations`. */
export const STAFF_INVITATIONS_QUERY_KEY = ['staff-invitations'] as const;

/** Invalidates the staff-invitations list and every invitation's details
 * entry — both nest under `STAFF_INVITATIONS_QUERY_KEY` (see F19/F16). */
export const invalidateStaffInvitations = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_INVITATIONS_QUERY_KEY),
	});

export type StaffInvitationInput = {
	email: string;
	profileIds: string[];
};

export type BulkCreateStaffInvitationsInput = {
	invitations: StaffInvitationInput[];
};

// users-auth-r6-F2: no `q` field — FindStaffInvitations (apps/api/Modules/
// Invitations/Handlers/Staff/FindStaffInvitations.cs) has no search
// parameter, so a `q` field here would either silently do nothing (the old
// bug) or, worse, look load-bearing to a future caller.
export type StaffInvitationsQueryVariables = {
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
	status?: string;
};

export type StaffInvitationDetailsVariables = {
	invitationId: string;
};

export type StaffInvitationActionVariables = {
	invitationId: string;
};

const normalizeString = (value: string | undefined): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

export const buildFindStaffInvitationsQueryParameters = (
	variables: StaffInvitationsQueryVariables,
) => {
	const cursor = normalizeString(variables.cursor);
	const sortId = normalizeString(variables.sortId);
	const sortOrder = variables.sortOrder;
	const status = normalizeString(variables.status);
	const limit =
		typeof variables.size === 'number' ? String(variables.size) : undefined;

	return {
		cursor,
		limit,
		sortId,
		sortOrder,
		status,
	};
};

const buildBulkCreateStaffInvitationsBody = (
	input: BulkCreateStaffInvitationsInput,
): BulkCreateStaffInvitationsBody => ({
	invitations: createUntypedArray(
		input.invitations.map((invitation) =>
			createUntypedObject({
				email: createUntypedString(invitation.email),
				profileIds: createUntypedArray(
					invitation.profileIds.map((profileId) =>
						createUntypedString(profileId),
					),
				),
			}),
		),
	),
});

const bulkCreateStaffInvitationsMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffInvitationsCreated | undefined,
	BulkCreateStaffInvitationsInput
>(
	{
		mutationKeyFn: () => ['staff-invitations', 'bulk-create'],
		mutationFn: async (client, variables) =>
			client.staff.invitations.bulk.post(
				buildBulkCreateStaffInvitationsBody(variables),
			),
		meta: {
			successMessage: 'invitations-sent-successfully',
			validationHandledByForm: true,
		},
	},
	{ clientAccessor: getClientManager() },
);

export type BulkRevokeStaffInvitationsInput = {
	invitationIds: string[];
};

// The kiota body model is untyped-node based; this builder is the one place
// that owns the `{ invitationIds: [...] }` wire shape for
// POST /staff/invitations/bulk-revoke.
export const buildBulkRevokeStaffInvitationsBody = (
	input: BulkRevokeStaffInvitationsInput,
): BulkRevokeStaffInvitationsBody => ({
	invitationIds: createUntypedArray(
		input.invitationIds.map((invitationId) =>
			createUntypedString(invitationId),
		),
	),
});

const bulkRevokeStaffInvitationsMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffInvitationActionResult | undefined,
	BulkRevokeStaffInvitationsInput
>(
	{
		mutationKeyFn: () => ['staff-invitations', 'bulk-revoke'],
		mutationFn: (client, variables) =>
			client.staff.invitations.bulkRevoke.post(
				buildBulkRevokeStaffInvitationsBody(variables),
			),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const staffInvitationsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffInvitationsResult,
	StaffInvitationsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-invitations'],
		fetcher: async (client, variables) => {
			const result = await client.staff.invitations.get({
				queryParameters: buildFindStaffInvitationsQueryParameters(variables),
			});

			if (!result) {
				throw new Error('staff invitations result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const staffInvitationDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	StaffInvitationDetails,
	StaffInvitationDetailsVariables
>(
	{
		queryKeyFn: () => ['staff-invitations', 'details'],
		fetcher: async (client, variables) => {
			const result = await client.staff.invitations
				.byInvitationId(variables.invitationId)
				.get();

			if (!result) {
				throw new Error('staff invitation details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const staffInvitationLinkMutationOptions = buildStaffMutationOptions<
	ApiClient,
	GetStaffInvitationLinkResult,
	StaffInvitationActionVariables
>(
	{
		mutationKeyFn: () => ['staff-invitations', 'link'],
		mutationFn: async (client, variables) => {
			const result = await client.staff.invitations
				.byInvitationId(variables.invitationId)
				.link.get();

			if (!result) {
				throw new Error('staff invitation link result was empty');
			}

			return result;
		},
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

const resendStaffInvitationMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffInvitationActionVariables
>(
	{
		mutationKeyFn: () => ['staff-invitations', 'resend'],
		mutationFn: (client, variables) =>
			client.staff.invitations
				.byInvitationId(variables.invitationId)
				.resend.post(),
		meta: { successMessage: 'resend-invitation-success' },
	},
	{ clientAccessor: getClientManager() },
);

const revokeStaffInvitationMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffInvitationActionVariables
>(
	{
		mutationKeyFn: () => ['staff-invitations', 'revoke'],
		mutationFn: (client, variables) =>
			client.staff.invitations.byInvitationId(variables.invitationId).delete(),
		meta: { successMessage: 'revoke-invitation-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkCreateStaffInvitationsMutation = () =>
	useMutation(bulkCreateStaffInvitationsMutationOptions);

export const useBulkRevokeStaffInvitationsMutation = () =>
	useMutation(bulkRevokeStaffInvitationsMutationOptions);

export const useStaffInvitationsQuery = (
	variables: StaffInvitationsQueryVariables,
) =>
	useQuery({
		queryKey: staffInvitationsQueryOptions.queryKey(variables),
		queryFn: () => staffInvitationsQueryOptions.fetcher(variables),
	});

export const useStaffInvitationDetailsQuery = (
	variables: StaffInvitationDetailsVariables,
) =>
	useQuery({
		queryKey: staffInvitationDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffInvitationDetailsQueryOptions.fetcher(variables),
	});

/**
 * A breadcrumb `entity` crumb's `query`/`select` pair for the invitation
 * detail route — same query key as `useStaffInvitationDetailsQuery`, so
 * TanStack Query dedupes and a cached name paints the crumb instantly. An
 * invitation has no display name of its own, so the invitee's email is the
 * human identifier (matches the detail page's own heading).
 */
export const staffInvitationCrumbQuery = (
	params: Record<string, string>,
): EntityCrumbQuery => ({
	queryKey: staffInvitationDetailsQueryOptions.queryKey({
		invitationId: params.invitationId,
	}),
	queryFn: () =>
		staffInvitationDetailsQueryOptions.fetcher({
			invitationId: params.invitationId,
		}),
});

export const selectStaffInvitationCrumbName = (
	data: unknown,
): string | undefined => {
	const email = (data as StaffInvitationDetails | null | undefined)?.email;
	const trimmed = email?.trim();
	if (trimmed) {
		return trimmed;
	}
	return undefined;
};

export const useStaffInvitationLinkMutation = () =>
	useMutation(staffInvitationLinkMutationOptions);

export const useResendStaffInvitationMutation = () =>
	useMutation(resendStaffInvitationMutationOptions);

export const useRevokeStaffInvitationMutation = () =>
	useMutation(revokeStaffInvitationMutationOptions);
