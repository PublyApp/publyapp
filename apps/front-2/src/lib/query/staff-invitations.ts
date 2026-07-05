import {
	createUntypedArray,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	BulkCreateStaffInvitationsBody,
	BulkStaffInvitationsCreated,
} from '@org/client-ts/src/models/index.js';
import { buildStaffMutationOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffInvitationInput = {
	email: string;
	profileIds: string[];
};

export type BulkCreateStaffInvitationsInput = {
	invitations: StaffInvitationInput[];
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

export const useBulkCreateStaffInvitationsMutation = () =>
	useMutation(bulkCreateStaffInvitationsMutationOptions);
