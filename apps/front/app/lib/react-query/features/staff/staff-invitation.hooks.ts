import { createUntypedString } from '@microsoft/kiota-abstractions';
import * as cookie from 'cookie';
import _ from 'lodash';

import { delay } from '@org/shared/utils/any.utils';
import type {
	BulkStaffInvitationsCreated,
	CreateStaffInvitationBody,
} from '@/js-client/src/models';
import {
	SESSION_TOKEN_COOKIE_KEY,
	SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

// Query: Find Staff Invitations
export const useFindStaffInvitations = createStaffQuery({
	queryKeyFn: (client) => client.staff.invitations.get,
	fetcher: async (client) => {
		const result = await client.staff.invitations.get();
		if (_.isNil(result)) {
			throw new Error('useFindStaffInvitations: result is nil');
		}
		return result;
	},
});

// Query: Find Staff Profiles (placeholder using delay)
export const useFindStaffProfilesFromInvitations = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.get,
	fetcher: async (_client) => {
		// const result = await client.staff.profiles.get();
		const result = await delay(1500, []);
		if (_.isNil(result)) {
			throw new Error('useFindStaffProfilesFromInvitations: result is nil');
		}
		return result;
	},
});

// Mutation: Create Invitation
type CreateInvitationPayload = {
	email: string;
	profileId: string;
};

export const useCreateInvitation = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.post,
	mutationFn: async (client, data: CreateInvitationPayload) => {
		const body: CreateStaffInvitationBody = {
			email: createUntypedString(data.email) as typeof body.email,
			profileId: createUntypedString(data.profileId) as typeof body.profileId,
		};
		const result = await client.staff.invitations.post(body);
		if (_.isNil(result)) {
			throw new Error('useCreateInvitation: result is nil');
		}
		return result;
	},
});

// Mutation: Bulk Create Invitations
// Note: This mutation uses a custom fetch due to API limitations with Kiota
type BulkCreateInvitationsPayload = {
	invitations: Array<{
		email: string;
		profileIds: string[];
	}>;
};

export const useBulkCreateInvitations = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.bulk.post,
	mutationFn: async (client, data: BulkCreateInvitationsPayload) => {
		// Use client to get request info, but make custom fetch for bulk endpoint
		const reqInfo = client.staff.invitations.bulk.toPostRequestInformation({});
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
			throw new Error('useBulkCreateInvitations: result is nil');
		}
		return result;
	},
});

// Mutation: Revoke Invitation
type RevokeInvitationPayload = {
	invitationId: string;
};

export const useRevokeInvitation = createStaffMutation({
	mutationKeyFn: (client) => client.staff.invitations.byInvitationId('').delete,
	mutationFn: async (client, data: RevokeInvitationPayload) => {
		const result = await client.staff.invitations
			.byInvitationId(data.invitationId)
			.delete();
		if (_.isNil(result)) {
			throw new Error('useRevokeInvitation: result is nil');
		}
		return result;
	},
});
