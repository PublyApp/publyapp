import * as cookie from 'cookie';
import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';

import { delay } from '@org/shared/utils/any.utils';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { BulkStaffInvitationsCreated } from '@/js-client/src/models';
import {
	SESSION_TOKEN_COOKIE_KEY,
	SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';

import { getQueryKey } from '../../query-utils';

// Query: Find Staff Invitations
const findStaffInvitationsQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.invitations.get,
);

export const useFindStaffInvitations = createQuery({
	queryKey: [findStaffInvitationsQueryKey] as const,
	fetcher: async () => {
		const result = await clientManager.apiClient.staff.invitations.get();
		if (_.isNil(result)) {
			throw new Error(`[${findStaffInvitationsQueryKey}]: result is nil`);
		}
		return result;
	},
});

// Query: Find Staff Profiles
const findStaffProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.get,
);

export const useFindStaffProfiles = createQuery({
	queryKey: [findStaffProfilesQueryKey] as const,
	fetcher: async () => {
		// const result = await clientManager.apiClient.staff.profiles.get();
		const result = await delay(1500, []);
		if (_.isNil(result)) {
			throw new Error(`[${findStaffProfilesQueryKey}]: result is nil`);
		}
		return result;
	},
});

// Mutation: Create Invitation
const createInvitationMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.invitations.post,
);

type CreateInvitationPayload = {
	email: string;
	profileId: string;
};

export const useCreateInvitation = createMutation({
	mutationKey: [createInvitationMutationKey] as const,
	mutationFn: async (data: CreateInvitationPayload) => {
		const result = await clientManager.apiClient.staff.invitations.post({
			email: {
				getValue() {
					return data.email;
				},
			},
			profileId: {
				getValue() {
					return data.profileId;
				},
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${createInvitationMutationKey}]: result is nil`);
		}
		return result;
	},
});

// Mutation: Bulk Create Invitations
type BulkCreateInvitationsPayload = {
	invitations: Array<{
		email: string;
		profileIds: string[];
	}>;
};

const bulkCreateInvitationsMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.invitations.bulk.post,
);

export const useBulkCreateInvitations = createMutation({
	mutationKey: [bulkCreateInvitationsMutationKey] as const,
	mutationFn: async (data: BulkCreateInvitationsPayload) => {
		const reqInfo =
			clientManager.apiClient.staff.invitations.bulk.toPostRequestInformation(
				{},
			);
		const browserCookies = cookie.parse(document.cookie);
		const sessionToken = browserCookies[SESSION_TOKEN_COOKIE_KEY];

		const response = await fetch(reqInfo.URL, {
			method: reqInfo.httpMethod,
			body: JSON.stringify({
				invitations: data.invitations,
			}),
			headers: {
				'Content-Type': 'application/json',
				[SESSION_TOKEN_HEADER_KEY]: sessionToken || '',
			},
		});
		const result: BulkStaffInvitationsCreated | undefined =
			await response.json();

		if (_.isNil(result)) {
			throw new Error(`[${bulkCreateInvitationsMutationKey}]: result is nil`);
		}
		return result;
	},
});

// Mutation: Revoke Invitation
const revokeInvitationMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.invitations.byInvitationId('').delete,
);

type RevokeInvitationPayload = {
	invitationId: string;
};

export const useRevokeInvitation = createMutation({
	mutationKey: [revokeInvitationMutationKey] as const,
	mutationFn: async (data: RevokeInvitationPayload) => {
		const result = await clientManager.apiClient.staff.invitations
			.byInvitationId(data.invitationId)
			.delete();
		if (_.isNil(result)) {
			throw new Error(`[${revokeInvitationMutationKey}]: result is nil`);
		}
		return result;
	},
});
