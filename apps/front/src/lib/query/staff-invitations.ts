import {
	createUntypedArray,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	ApiResponse,
	BulkCreateStaffInvitationsBody,
	BulkStaffInvitationsCreated,
	FindStaffInvitationsResult,
	GetStaffInvitationLinkResult,
	StaffInvitationDetails,
} from '@org/client-ts/src/models/index.js';
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
export const invalidateStaffInvitations = (queryClient: QueryClient) =>
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
	return trimmed.length > 0 ? trimmed : undefined;
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

export const buildBulkCreateStaffInvitationsBody = (
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

const staffInvitationDetailsQueryOptions = buildStaffQueryOptions<
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

export const useStaffInvitationLinkMutation = () =>
	useMutation(staffInvitationLinkMutationOptions);

export const useResendStaffInvitationMutation = () =>
	useMutation(resendStaffInvitationMutationOptions);

export const useRevokeStaffInvitationMutation = () =>
	useMutation(revokeStaffInvitationMutationOptions);
