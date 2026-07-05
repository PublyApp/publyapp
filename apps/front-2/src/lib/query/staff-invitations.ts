import {
	createUntypedArray,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	BulkCreateStaffInvitationsBody,
	BulkStaffInvitationsCreated,
	FindStaffInvitationsResult,
} from '@org/client-ts/src/models/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffInvitationInput = {
	email: string;
	profileIds: string[];
};

export type BulkCreateStaffInvitationsInput = {
	invitations: StaffInvitationInput[];
};

export type StaffInvitationsQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
	status?: string;
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

export const useBulkCreateStaffInvitationsMutation = () =>
	useMutation(bulkCreateStaffInvitationsMutationOptions);

export const useStaffInvitationsQuery = (
	variables: StaffInvitationsQueryVariables,
) =>
	useQuery({
		queryKey: staffInvitationsQueryOptions.queryKey(variables),
		queryFn: () => staffInvitationsQueryOptions.fetcher(variables),
	});
